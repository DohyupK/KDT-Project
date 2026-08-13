import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const EXTRACT_PY = `
import sys, zipfile, re, xml.etree.ElementTree as ET
p = sys.argv[1]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with zipfile.ZipFile(p) as z:
    xml = z.read('word/document.xml')
tree = ET.fromstring(xml)
paras = []
for para in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
    texts = []
    for t in para.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
        if t.text: texts.append(t.text)
        if t.tail: texts.append(t.tail)
    line = ''.join(texts).strip()
    if line: paras.append(line)
body = '\\n'.join(paras)
print(body)
`

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseWordDocumentXml(xml: string): string {
  const paragraphs: string[] = []
  const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi
  let pMatch: RegExpExecArray | null

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pContent = pMatch[1]
    const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi
    let tMatch: RegExpExecArray | null
    const lineParts: string[] = []
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      lineParts.push(tMatch[1])
    }
    const line = decodeXmlEntities(lineParts.join('')).trim()
    if (line) {
      paragraphs.push(line)
    }
  }

  if (paragraphs.length > 0) {
    return paragraphs.join('\n')
  }

  // Fallback if <w:p> tag regex fails
  const stripped = decodeXmlEntities(xml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return stripped
}

function decompressBuffer(buf: Buffer): Buffer | null {
  try {
    return zlib.inflateRawSync(buf)
  } catch {
    /* try inflateSync */
  }
  try {
    return zlib.inflateSync(buf)
  } catch {
    /* try unzipSync */
  }
  try {
    return zlib.unzipSync(buf)
  } catch {
    /* failed */
  }
  return null
}

function extractDocxXmlFromBuffer(buffer: Buffer): string | null {
  try {
    for (let offset = 0; offset <= buffer.length - 30; offset++) {
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        const compression = buffer.readUInt16LE(offset + 8)
        const compressedSize = buffer.readUInt32LE(offset + 18)
        const uncompressedSize = buffer.readUInt32LE(offset + 22)
        const fileNameLen = buffer.readUInt16LE(offset + 26)
        const extraLen = buffer.readUInt16LE(offset + 28)
        if (offset + 30 + fileNameLen > buffer.length) continue
        const rawFileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen)
        const normalizedName = rawFileName.replace(/\\/g, '/').toLowerCase()

        if (normalizedName.endsWith('word/document.xml') || normalizedName === 'word/document.xml') {
          const dataStart = offset + 30 + fileNameLen + extraLen
          if (dataStart >= buffer.length) continue

          if (compression === 8) {
            // Strategy 1: Full slice to end of buffer
            const decomp1 = decompressBuffer(buffer.subarray(dataStart))
            if (decomp1 && decomp1.length > 0) {
              return decomp1.toString('utf8')
            }
            // Strategy 2: Slice by compressedSize if specified
            if (compressedSize > 0 && dataStart + compressedSize <= buffer.length) {
              const decomp2 = decompressBuffer(buffer.subarray(dataStart, dataStart + compressedSize))
              if (decomp2 && decomp2.length > 0) {
                return decomp2.toString('utf8')
              }
            }
          } else if (compression === 0) {
            const size = uncompressedSize > 0 ? uncompressedSize : buffer.length - dataStart
            return buffer.toString('utf8', dataStart, dataStart + size)
          }
        }
      }
    }
  } catch {
    /* ignore and try python fallback */
  }

  return null
}

async function extractDocxTextPython(absolutePath: string): Promise<string | null> {
  const pyCmds = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']
  for (const cmd of pyCmds) {
    try {
      const { stdout } = await execFileAsync(cmd, ['-c', EXTRACT_PY, absolutePath], {
        maxBuffer: 4 * 1024 * 1024,
        timeout: 8_000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      })
      if (stdout.trim()) {
        return stdout.trim()
      }
    } catch {
      /* continue to next candidate */
    }
  }
  return null
}

type DocBlock = { type: 'p'; text: string } | { type: 'tbl'; rows: string[][] }

function xmlFragmentText(fragment: string): string {
  const parts: string[] = []
  const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi
  let tMatch: RegExpExecArray | null
  while ((tMatch = tRegex.exec(fragment)) !== null) {
    parts.push(decodeXmlEntities(tMatch[1]))
  }
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function parseTableRows(tblXml: string): string[][] {
  const rows: string[][] = []
  const trRegex = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/gi
  let trMatch: RegExpExecArray | null
  while ((trMatch = trRegex.exec(tblXml)) !== null) {
    const cells: string[] = []
    const tcRegex = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/gi
    let tcMatch: RegExpExecArray | null
    while ((tcMatch = tcRegex.exec(trMatch[1])) !== null) {
      cells.push(xmlFragmentText(tcMatch[1]))
    }
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells)
    }
  }
  return rows
}

function isOpenTagAt(xml: string, idx: number, tag: string): boolean {
  return new RegExp(`^<${tag}(?:\\s|/|>)`).test(xml.slice(idx, idx + tag.length + 8))
}

/** Next real `<w:p` / `<w:tbl` — skips lookalikes like `<w:pPr>` / `<w:tblPr>`. */
function nextOpenTagIndex(xml: string, from: number, tag: string): number {
  let i = from
  while (i < xml.length) {
    const idx = xml.indexOf(`<${tag}`, i)
    if (idx < 0) return -1
    if (isOpenTagAt(xml, idx, tag)) return idx
    i = idx + 1 + tag.length
  }
  return -1
}

/** Slice from an open tag to its matching close, including self-closing `<w:p/>`. */
function sliceUntilClose(xml: string, openIdx: number, tag: string): { inner: string; end: number } | null {
  const closeTag = `</${tag}>`
  const gt = xml.indexOf('>', openIdx)
  if (gt < 0) return null
  if (xml[gt - 1] === '/') {
    return { inner: '', end: gt + 1 }
  }
  let depth = 1
  let i = gt + 1
  while (depth > 0 && i < xml.length) {
    const nextOpen = nextOpenTagIndex(xml, i, tag)
    const nextClose = xml.indexOf(closeTag, i)
    if (nextClose < 0) return null
    if (nextOpen >= 0 && nextOpen < nextClose) {
      const nestedGt = xml.indexOf('>', nextOpen)
      if (nestedGt < 0) return null
      if (xml[nestedGt - 1] === '/') {
        i = nestedGt + 1
        continue
      }
      depth += 1
      i = nestedGt + 1
    } else {
      depth -= 1
      i = nextClose + closeTag.length
      if (depth === 0) {
        return { inner: xml.slice(gt + 1, nextClose), end: i }
      }
    }
  }
  return null
}

const REV_HEADER_CANON: Record<string, string> = {
  개정번호: '개정번호',
  개정일: '개정일',
  개정내용: '개정 내용',
  '개정 내용': '개정 내용',
}

function isRevisionHeaderLabel(text: string): boolean {
  return text in REV_HEADER_CANON
}

function canonRevisionHeader(text: string): string {
  return REV_HEADER_CANON[text] ?? text
}

function looksLikeRevisionNo(text: string): boolean {
  return /^\d{2}$/.test(text)
}

function looksLikeIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
}

/** Rebuild a 개정번호/개정일/개정 내용 table if cell text leaked as paragraphs. */
function recoverRevisionTables(blocks: DocBlock[]): DocBlock[] {
  const out: DocBlock[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]
    if (block.type === 'p' && isRevisionHeaderLabel(block.text)) {
      const headers: string[] = []
      let j = i
      while (
        j < blocks.length &&
        blocks[j].type === 'p' &&
        isRevisionHeaderLabel((blocks[j] as { type: 'p'; text: string }).text)
      ) {
        headers.push(canonRevisionHeader((blocks[j] as { type: 'p'; text: string }).text))
        j += 1
      }
      if (headers.length === 3) {
        const rows: string[][] = [headers]
        while (
          j + 2 < blocks.length &&
          blocks[j].type === 'p' &&
          blocks[j + 1].type === 'p' &&
          blocks[j + 2].type === 'p'
        ) {
          const rev = (blocks[j] as { type: 'p'; text: string }).text
          const date = (blocks[j + 1] as { type: 'p'; text: string }).text
          const content = (blocks[j + 2] as { type: 'p'; text: string }).text
          if (!looksLikeRevisionNo(rev) || !looksLikeIsoDate(date)) break
          rows.push([rev, date, content])
          j += 3
        }
        if (rows.length >= 2) {
          out.push({ type: 'tbl', rows })
          i = j
          continue
        }
      }
    }
    out.push(block)
    i += 1
  }
  return out
}

function revisionTableFromLines(lines: string[]): string[][] | null {
  const idx = lines.findIndex(
    (line, i) =>
      isRevisionHeaderLabel(line) &&
      i + 2 < lines.length &&
      isRevisionHeaderLabel(lines[i + 1]) &&
      isRevisionHeaderLabel(lines[i + 2]),
  )
  if (idx < 0) return null
  const headers = lines.slice(idx, idx + 3).map(canonRevisionHeader)
  const rows: string[][] = [headers]
  let i = idx + 3
  while (i + 2 < lines.length && looksLikeRevisionNo(lines[i]) && looksLikeIsoDate(lines[i + 1])) {
    rows.push([lines[i], lines[i + 1], lines[i + 2]])
    i += 3
  }
  return rows.length >= 2 ? rows : null
}

function parseDocxBlocksFromXml(xml: string): DocBlock[] {
  const bodyMatch = xml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/i)
  const inner = bodyMatch?.[1] ?? xml
  const blocks: DocBlock[] = []
  let i = 0
  while (i < inner.length) {
    const pIdx = nextOpenTagIndex(inner, i, 'w:p')
    const tIdx = nextOpenTagIndex(inner, i, 'w:tbl')
    if (pIdx < 0 && tIdx < 0) break

    const preferTbl = tIdx >= 0 && (pIdx < 0 || tIdx < pIdx)
    if (preferTbl) {
      const sliced = sliceUntilClose(inner, tIdx, 'w:tbl')
      if (!sliced) {
        i = tIdx + 6
        continue
      }
      const rows = parseTableRows(sliced.inner)
      if (rows.length > 0) blocks.push({ type: 'tbl', rows })
      i = sliced.end
      continue
    }
    if (pIdx >= 0) {
      const sliced = sliceUntilClose(inner, pIdx, 'w:p')
      if (!sliced) {
        i = pIdx + 4
        continue
      }
      const text = xmlFragmentText(sliced.inner)
      if (text) blocks.push({ type: 'p', text })
      i = sliced.end
      continue
    }
    i += 4
  }
  return recoverRevisionTables(blocks)
}

function escHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isTopHeading(text: string): boolean {
  return /^[0-9]+\.\s+/.test(text) && !/^[0-9]+\.[0-9]/.test(text)
}

function isSubHeading(text: string): boolean {
  return /^[0-9]+\.[0-9]+\s+/.test(text)
}

function renderTableHtml(rows: string[][]): string {
  if (rows.length === 0) return ''
  const [header, ...body] = rows
  const looksLikeHeader = header.every((c) => c.length > 0 && c.length <= 40)
  const cell = (value: string, tag: 'th' | 'td') =>
    `<${tag}>${escHtml(value) || '&nbsp;'}</${tag}>`
  const thead = looksLikeHeader
    ? `<thead><tr>${header.map((c) => cell(c, 'th')).join('')}</tr></thead>`
    : ''
  const bodyRows = looksLikeHeader ? body : rows
  const tbody = `<tbody>${bodyRows
    .map((row) => `<tr>${row.map((c) => cell(c, 'td')).join('')}</tr>`)
    .join('')}</tbody>`
  return `<table class="doc-table">${thead}${tbody}</table>`
}

function emptyMeta(): DocMeta {
  return {
    docNo: '',
    revision: '',
    date: '',
    security: '',
    author: '',
    reviewer: '',
    approver: '',
    retentionYears: '',
  }
}

function applyMetaFromTable(meta: DocMeta, rows: string[][]): void {
  if (rows.length < 2) {
    const header = rows[0] || []
    if (header.length === 3 && header[0] === '작성') {
      /* names may be in a following incomplete table */
    }
    return
  }
  const headers = rows[0]
  const values = rows[1]
  const map: Record<string, keyof DocMeta> = {
    문서번호: 'docNo',
    개정번호: 'revision',
    제정일: 'date',
    보안등급: 'security',
    작성: 'author',
    검토: 'reviewer',
    승인: 'approver',
    보존기간: 'retentionYears',
  }
  headers.forEach((h, i) => {
    const key = map[h]
    if (key && values[i] && !meta[key]) {
      meta[key] = values[i]
    }
  })
}

function isSignoffTable(rows: string[][]): boolean {
  const header = rows[0] || []
  return header.length === 3 && header[0] === '작성' && header[1] === '검토' && header[2] === '승인'
}

function blocksToPreviewData(blocks: DocBlock[]): PreviewData {
  const meta = emptyMeta()
  const toc: TocItem[] = []
  const htmlParts: string[] = []
  let title = ''
  let subtitle = ''
  let sectionCounter = 0
  let seenBody = false
  let preambleParas = 0

  for (const block of blocks) {
    if (block.type === 'tbl') {
      if (isSignoffTable(block.rows)) {
        continue
      }
      applyMetaFromTable(meta, block.rows)
      for (const row of block.rows) {
        for (const cell of row) {
          const m = cell.match(/^(\d+년)$/)
          if (m && !meta.retentionYears) meta.retentionYears = m[1]
        }
      }
      htmlParts.push(renderTableHtml(block.rows))
      continue
    }

    const line = block.text
    if (isTopHeading(line)) {
      seenBody = true
      sectionCounter += 1
      const id = `section-${sectionCounter}`
      toc.push({ id, label: line })
      const numMatch = line.match(/^([0-9]+\.)\s+(.*)$/)
      const num = numMatch?.[1] ?? ''
      const rest = numMatch?.[2] ?? line
      htmlParts.push(
        `<h3 id="${id}" class="doc-section"><span class="sec-num">${escHtml(num)}</span><span class="sec-title">${escHtml(rest)}</span></h3>`,
      )
      continue
    }
    if (isSubHeading(line)) {
      seenBody = true
      htmlParts.push(`<h4 class="doc-subhead">${escHtml(line)}</h4>`)
      continue
    }
    if (!seenBody && preambleParas < 2 && line.length >= 8 && !/^(문서번호|개정번호|제정일|보안등급|작성|검토|승인|개정내용|개정 내용|개정일)$/.test(line)) {
      if (!title) {
        title = line
        preambleParas += 1
        htmlParts.push(`<h1 class="doc-title">${escHtml(line)}</h1>`)
        continue
      }
      if (!subtitle) {
        subtitle = line
        preambleParas += 1
        htmlParts.push(`<p class="doc-subtitle">${escHtml(line)}</p>`)
        continue
      }
    }
    if (/^(문서번호|개정번호|제정일|보안등급|작성|검토|승인|개정내용|개정 내용|개정일|최초 제정|서명)$/.test(line)) {
      continue
    }
    htmlParts.push(`<p class="doc-p">${escHtml(line)}</p>`)
  }

  return {
    html: `<div class="doc-preview">${htmlParts.join('')}</div>`,
    toc,
    meta,
    title,
    subtitle,
  }
}

export function parseDocxXmlToPreviewData(xml: string): PreviewData {
  return blocksToPreviewData(parseDocxBlocksFromXml(xml))
}

/** Extract plain text from .docx for read-only preview. */
export async function extractDocxText(absolutePath: string): Promise<string> {
  const ext = path.extname(absolutePath).toLowerCase()
  if (ext !== '.docx') {
    const raw = await fs.readFile(absolutePath, 'utf-8')
    return raw
  }

  // First, try native Node.js ZIP + XML extraction
  try {
    const buffer = await fs.readFile(absolutePath)
    const xml = extractDocxXmlFromBuffer(buffer)
    if (xml) {
      const text = parseWordDocumentXml(xml)
      if (text.trim()) {
        return text.trim()
      }
    }
  } catch {
    /* try python fallback */
  }

  // Second, try Python fallback if native extraction missed
  const pyText = await extractDocxTextPython(absolutePath)
  if (pyText) {
    return pyText
  }

  return '(docx 미리보기를 생성할 수 없습니다.)'
}


export type TocItem = { id: string; label: string }

export type DocMeta = {
  docNo: string
  revision: string
  date: string
  security: string
  author: string
  reviewer: string
  approver: string
  retentionYears: string
}

export type PreviewData = {
  html: string
  toc: TocItem[]
  meta: DocMeta
  title: string
  subtitle: string
}

/** Load a .docx into structured preview HTML (tables + TOC). */
export async function loadDocxPreview(absolutePath: string): Promise<PreviewData> {
  try {
    const buffer = await fs.readFile(absolutePath)
    const xml = extractDocxXmlFromBuffer(buffer)
    if (xml) {
      const parsed = parseDocxXmlToPreviewData(xml)
      if (parsed.html.replace(/<[^>]+>/g, '').trim()) {
        return parsed
      }
    }
  } catch {
    /* fall through to plain-text extraction */
  }
  const text = await extractDocxText(absolutePath)
  return parseDocxToPreviewData(text)
}

/** Legacy plain-text → HTML (kept for backward compat) */
export function textToPreviewHtml(text: string): string {
  return parseDocxToPreviewData(text).html
}

/** Full parse: returns html, toc, and meta extracted from DOCX text. */
export function parseDocxToPreviewData(text: string): PreviewData {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const rawLines = escaped.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  // ── Extract metadata from the header section ──────────────────────────────
  const meta: DocMeta = emptyMeta()

  const META_PATTERNS: Array<{ regex: RegExp; key: keyof DocMeta }> = [
    { regex: /^(QMS-[A-Z]+-\d+)$/, key: 'docNo' },
    { regex: /^(\d{2})$/, key: 'revision' },
    { regex: /^(\d{4}-\d{2}-\d{2})$/, key: 'date' },
    { regex: /^(사내한\(Internal\)|대외비|공개)$/i, key: 'security' },
    { regex: /^(\d+년)$/, key: 'retentionYears' },
  ]

  for (const line of rawLines) {
    for (const p of META_PATTERNS) {
      const m = line.match(p.regex)
      if (m && !meta[p.key]) {
        meta[p.key] = m[1]
      }
    }
    if (/^서명$/.test(line)) {
      if (!meta.author) { meta.author = '서명'; continue }
      if (!meta.reviewer) { meta.reviewer = '서명'; continue }
      if (!meta.approver) { meta.approver = '서명'; continue }
    }
    if (/^최초 제정$/.test(line) && !meta.approver) {
      meta.approver = '최초 제정'
    }
  }

  // ── Find start of body content ────────────────────────────────────────────
  let startIdx = rawLines.findIndex((l) => /^[0-9]+\.\s+/.test(l) || /^[0-9]+\.[0-9]+/.test(l))
  if (startIdx === -1) startIdx = 0

  const preambleLines = startIdx > 0 ? rawLines.slice(0, startIdx) : []
  const revisionTable = revisionTableFromLines(preambleLines)

  const bodyLines = rawLines.slice(startIdx).filter((l) => {
    // strip isolated metadata tokens that leaked into body
    return !/^(문서번호|개정번호|제정일|보안등급|작성|검토|승인|개정내용|개정 내용|개정일|최초 제정|서명|사내한\(Internal\))$/.test(l)
  })

  // ── Build HTML + TOC ──────────────────────────────────────────────────────
  const toc: TocItem[] = []
  const htmlParts: string[] = []
  if (revisionTable) {
    htmlParts.push(renderTableHtml(revisionTable))
  }
  let sectionCounter = 0

  for (const line of bodyLines) {
    if (/^[0-9]+\.\s+/.test(line) && !/^[0-9]+\.[0-9]/.test(line)) {
      // Top-level heading  → h3 with anchor id
      sectionCounter++
      const id = `section-${sectionCounter}`
      toc.push({ id, label: line })
      htmlParts.push(
        `<h3 id="${id}" class="doc-section font-bold text-slate-900 dark:text-slate-100 text-base mt-6 mb-2.5 pb-1.5 border-b border-slate-200 dark:border-slate-700">${line}</h3>`,
      )
    } else if (/^[0-9]+\.[0-9]+\s+/.test(line)) {
      // Sub-heading → h4
      htmlParts.push(
        `<h4 class="font-semibold text-slate-800 dark:text-slate-200 text-sm mt-4 mb-2 pl-1">${line}</h4>`,
      )
    } else if (line.startsWith('•') || line.startsWith('-')) {
      const bulletText = line.replace(/^[•\-]\s*/, '')
      const colonIdx = bulletText.indexOf(':')
      if (colonIdx > 0 && colonIdx < 30) {
        const key = bulletText.slice(0, colonIdx)
        const val = bulletText.slice(colonIdx + 1)
        htmlParts.push(
          `<p class="ml-4 my-1.5 text-sm text-slate-700 dark:text-slate-300"><span class="mr-1 text-slate-400">•</span><strong class="font-medium text-slate-900 dark:text-slate-100">${key}:</strong>${val}</p>`,
        )
      } else {
        htmlParts.push(
          `<p class="ml-4 my-1.5 text-sm text-slate-700 dark:text-slate-300"><span class="mr-1 text-slate-400">•</span>${bulletText}</p>`,
        )
      }
    } else if (line.includes(':')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx > 0 && colonIdx < 20) {
        const key = line.slice(0, colonIdx)
        const val = line.slice(colonIdx + 1)
        htmlParts.push(
          `<p class="my-2 text-sm text-slate-700 dark:text-slate-300"><strong class="font-medium text-slate-900 dark:text-slate-100">${key}:</strong>${val}</p>`,
        )
      } else {
        htmlParts.push(
          `<p class="my-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">${line}</p>`,
        )
      }
    } else {
      htmlParts.push(
        `<p class="my-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">${line}</p>`,
      )
    }
  }

  const html = `<div class="doc-preview">${htmlParts.join('')}</div>`

  return { html, toc, meta, title: '', subtitle: '' }
}


