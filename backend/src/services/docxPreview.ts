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
  const pyCmds = ['python', 'py', 'python3']
  for (const cmd of pyCmds) {
    try {
      const { stdout } = await execFileAsync(cmd, ['-c', EXTRACT_PY, absolutePath], {
        maxBuffer: 4 * 1024 * 1024,
        timeout: 15_000,
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

export function textToPreviewHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const paras = escaped.split(/\n{2,}|\n/).filter(Boolean)
  return `<div class="doc-preview space-y-2.5 font-sans text-sm leading-relaxed text-slate-800 dark:text-slate-200">
    ${paras
      .map((p) => {
        const trimmed = p.trim()
        if (/^\d+(\.\d+)*\s+/.test(trimmed) || /^[0-9]+\.\s+/.test(trimmed)) {
          return `<h4 class="font-bold text-slate-900 dark:text-slate-100 text-base mt-4 mb-1">${trimmed}</h4>`
        }
        if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
          return `<p class="ml-4 my-1 text-slate-700 dark:text-slate-300">${trimmed}</p>`
        }
        return `<p class="my-1 text-slate-700 dark:text-slate-300">${trimmed}</p>`
      })
      .join('')}
  </div>`
}


