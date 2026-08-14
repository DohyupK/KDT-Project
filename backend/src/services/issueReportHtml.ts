import type { IssueDetail } from './issue.service.js'

const COLORS = {
  navy: '#0f172a',
  slate: '#475569',
  line: '#e2e8f0',
  red: '#dc2626',
  amber: '#d97706',
  green: '#16a34a',
}

export type IssueReportKpi = {
  issueCount: number
  riskCritical: number
  riskCaution: number
  riskStable: number
  spcAbnormal: number
  spcCaution: number
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function riskColor(risk: string): string {
  if (risk === '심각') return COLORS.red
  if (risk === '주의') return COLORS.amber
  return COLORS.green
}

function formatProbability(probability: number | null | undefined): string {
  if (probability == null || Number.isNaN(Number(probability))) return '—'
  const n = Number(probability)
  const pct = n <= 1 ? n * 100 : n
  return `${pct.toFixed(1)}%`
}

function mapSpcBucket(spcStatus: string | null | undefined): '이상' | '주의' | '안정' {
  const raw = (spcStatus || '').trim()
  if (!raw) return '안정'
  if (raw.includes('이탈') || raw.includes('이상')) return '이상'
  if (raw.includes('주의')) return '주의'
  return '안정'
}

export function computeIssueReportKpi(issues: IssueDetail[]): IssueReportKpi {
  let riskCritical = 0
  let riskCaution = 0
  let riskStable = 0
  let spcAbnormal = 0
  let spcCaution = 0
  for (const issue of issues) {
    if (issue.riskLevel === '심각') riskCritical += 1
    else if (issue.riskLevel === '주의') riskCaution += 1
    else riskStable += 1
    const spc = mapSpcBucket(issue.analysis?.spcStatus ?? issue.spcStatus)
    if (spc === '이상') spcAbnormal += 1
    else if (spc === '주의') spcCaution += 1
  }
  return {
    issueCount: issues.length,
    riskCritical,
    riskCaution,
    riskStable,
    spcAbnormal,
    spcCaution,
  }
}

function formatNow(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** LOT report HTML matching FE PDF sections 1–4. No window.print(). */
export function buildLotIssueReportHtml(opts: {
  lotId: string
  issues: IssueDetail[]
  generatedAt?: string
}): string {
  const kpi = computeIssueReportKpi(opts.issues)
  const generatedAt = opts.generatedAt ?? formatNow()
  const scopeLabel = `LOT ${opts.lotId}`

  const diagnosisRows = opts.issues
    .map((issue) => {
      const analysis = issue.analysis
      const spc = analysis?.spcStatus ?? issue.spcStatus ?? '—'
      const prob = formatProbability(analysis?.probability)
      const reason = analysis?.riskReason?.trim() || issue.issueContent || '—'
      const level = analysis?.riskLevel ?? issue.riskLevel
      return `<tr>
        <td>${escapeHtml(issue.issueId)}</td>
        <td>${escapeHtml(issue.lotId)}</td>
        <td style="color:${riskColor(level)};font-weight:800;">${escapeHtml(level)}</td>
        <td>${escapeHtml(spc)}</td>
        <td>${escapeHtml(prob)}</td>
        <td>${escapeHtml(reason)}</td>
      </tr>`
    })
    .join('')

  const issueRows = opts.issues
    .map(
      (issue) => `<tr>
        <td>${escapeHtml(issue.issueId)}</td>
        <td>${escapeHtml(issue.createdAt)}</td>
        <td>${escapeHtml(issue.lotId)}</td>
        <td style="color:${riskColor(issue.riskLevel)};font-weight:800;">${escapeHtml(issue.riskLevel)}</td>
        <td>${escapeHtml(issue.issueContent)}</td>
        <td>${escapeHtml(issue.assigneeName || '미배정')}</td>
        <td>${escapeHtml(issue.actionContent || '—')}</td>
        <td>${issue.completed ? '완료' : '미완료'}</td>
      </tr>`,
    )
    .join('')

  const lotAnalysisRows =
    opts.issues.length === 0
      ? '<tr><td colspan="7" style="text-align:center;">대상 이슈가 없습니다.</td></tr>'
      : opts.issues
          .map((issue) => {
            const a = issue.analysis
            return `<tr>
              <td>${escapeHtml(issue.issueId)}</td>
              <td>${escapeHtml(a?.lotId ?? issue.lotId)}</td>
              <td>${escapeHtml(a?.riskLevel ?? issue.riskLevel)}</td>
              <td>${escapeHtml(a?.spcStatus ?? issue.spcStatus ?? '—')}</td>
              <td>${escapeHtml(formatProbability(a?.probability))}</td>
              <td>${escapeHtml(a?.riskReason?.trim() || '—')}</td>
              <td>${escapeHtml(a?.scoredAt ?? a?.createdAt ?? '—')}</td>
            </tr>`
          })
          .join('')

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>이슈 보고서 (LOT)</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif; color: ${COLORS.navy}; padding: 32px; }
  h1 { font-size: 22px; text-align: center; margin: 0 0 6px; }
  .meta { text-align: center; color: ${COLORS.slate}; font-size: 13px; margin-bottom: 8px; }
  h2 { font-size: 15px; margin: 24px 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid ${COLORS.line}; padding: 8px 10px; font-size: 12px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; color: ${COLORS.slate}; white-space: nowrap; }
  .noreply { margin-top: 28px; color: ${COLORS.slate}; font-size: 12px; }
</style>
</head>
<body>
<h1>이슈 보고서 (LOT)</h1>
<div class="meta">대상: ${escapeHtml(scopeLabel)}</div>
<div class="meta">작성자: 시스템 · 생성: ${escapeHtml(generatedAt)}</div>
<h2>1. 요약 KPI</h2>
<table>
  <tr>
    <th>이슈 수</th><td>${kpi.issueCount}</td>
    <th>심각</th><td>${kpi.riskCritical}</td>
    <th>주의</th><td>${kpi.riskCaution}</td>
    <th>안정</th><td>${kpi.riskStable}</td>
  </tr>
  <tr>
    <th>SPC 이상</th><td>${kpi.spcAbnormal}</td>
    <th>SPC 주의</th><td>${kpi.spcCaution}</td>
    <th colspan="2"></th><td colspan="2"></td>
  </tr>
</table>
<h2>2. AI·SPC 진단</h2>
<table>
  <tr><th>이슈 ID</th><th>LOT</th><th>위험도</th><th>SPC</th><th>불량 확률</th><th>위험 원인 / 진단</th></tr>
  ${
    opts.issues.length === 0
      ? '<tr><td colspan="6" style="text-align:center;">대상 이슈가 없습니다.</td></tr>'
      : diagnosisRows
  }
</table>
<h2>3. 이슈 목록</h2>
<table>
  <tr><th>이슈 ID</th><th>등록일시</th><th>LOT</th><th>위험도</th><th>이슈 내용</th><th>담당자</th><th>조치 내용</th><th>완료</th></tr>
  ${
    opts.issues.length === 0
      ? '<tr><td colspan="8" style="text-align:center;">대상 이슈가 없습니다.</td></tr>'
      : issueRows
  }
</table>
<h2>4. LOT 상세 분석</h2>
<table>
  <tr><th>이슈 ID</th><th>LOT</th><th>위험도</th><th>SPC</th><th>불량 확률</th><th>위험 원인</th><th>채점 시각</th></tr>
  ${lotAnalysisRows}
</table>
<p class="noreply">이 메일은 발신 전용(No-reply)입니다. 회신하지 마세요.</p>
</body>
</html>`
}
