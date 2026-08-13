import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadDocxPreview, parseDocxToPreviewData, parseDocxXmlToPreviewData } from '../src/services/docxPreview.js'

const REV_TABLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>LOT 검사 수준 운영 규정</w:t></w:r></w:p>
    <w:p/>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>개정번호</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>개정일</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>개정 내용</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>01</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2026-08-01</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>최초 제정</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:t>1. 목적</w:t></w:r></w:p>
  </w:body>
</w:document>`

test('self-closing empty paragraph does not swallow the following revision table', () => {
  const preview = parseDocxXmlToPreviewData(REV_TABLE_XML)
  assert.match(preview.html, /<table class="doc-table">/)
  assert.match(preview.html, /<th>개정번호<\/th>/)
  assert.match(preview.html, /<th>개정일<\/th>/)
  assert.match(preview.html, /<th>개정 내용<\/th>/)
  assert.match(preview.html, /<td>01<\/td>/)
  assert.match(preview.html, /<td>2026-08-01<\/td>/)
  assert.match(preview.html, /<td>최초 제정<\/td>/)
  assert.doesNotMatch(preview.html, /<p class="doc-p">개정일<\/p>/)
  assert.doesNotMatch(preview.html, /<p class="doc-p">개정 내용<\/p>/)
})

test('plain-text fallback rebuilds the revision-history table', () => {
  const preview = parseDocxToPreviewData(
    ['개정번호', '개정일', '개정 내용', '01', '2026-08-01', '최초 제정', '1. 목적', '본문'].join('\n'),
  )
  assert.match(preview.html, /<th>개정번호<\/th>/)
  assert.match(preview.html, /<th>개정일<\/th>/)
  assert.match(preview.html, /<th>개정 내용<\/th>/)
  assert.match(preview.html, /<td>최초 제정<\/td>/)
})

test('omits the empty 작성/검토/승인 signoff table from preview HTML', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>드라이룸·제습 설비 점검 절차</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>작성</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>검토</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>승인</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
      </w:tr>
    </w:tbl>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>개정번호</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>개정일</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>개정 내용</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>01</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2026-08-02</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>최초 제정</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`
  const preview = parseDocxXmlToPreviewData(xml)
  assert.doesNotMatch(preview.html, /<th>작성<\/th>/)
  assert.doesNotMatch(preview.html, /<th>검토<\/th>/)
  assert.doesNotMatch(preview.html, /<th>승인<\/th>/)
  assert.match(preview.html, /<th>개정번호<\/th>/)
})

test('QMS source docx files keep revision history as a 3-column table', async (t) => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const dir = path.join(repoRoot, 'Documents', 'Confidential', 'qms-source')
  let names: string[]
  try {
    names = (await fs.readdir(dir)).filter((n) => n.toLowerCase().endsWith('.docx'))
  } catch {
    t.skip('qms-source directory is not present')
    return
  }
  assert.ok(names.length > 0, 'expected QMS docx files')
  for (const name of names) {
    const preview = await loadDocxPreview(path.join(dir, name))
    assert.doesNotMatch(preview.html, /<th>작성<\/th>/, `${name} should omit 작성/검토/승인 table`)
    const hasRevisionHeader = /개정번호/.test(preview.html) && /개정일/.test(preview.html)
    if (!hasRevisionHeader) continue
    assert.match(
      preview.html,
      /<table class="doc-table">[\s\S]*<th>개정번호<\/th>[\s\S]*<th>개정일<\/th>[\s\S]*<th>개정 내용<\/th>/,
      `${name} should render 개정 이력 as a table`,
    )
    assert.doesNotMatch(preview.html, /<p class="doc-p">개정일<\/p>/, `${name} leaked 개정일 as a paragraph`)
  }
})
