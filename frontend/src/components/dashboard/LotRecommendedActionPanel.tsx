'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'
import { fetchDocFileBlob } from '@/api/docsApi'
import { apiClient } from '@/api/axios'

export type RecommendedActionStep = {
  order: number
  text: string
  docId?: string | null
}

export type RecommendedActionSource = {
  docId: string
  title?: string | null
  path?: string | null
}

export type RecommendedActionData = {
  summary: string
  steps: RecommendedActionStep[]
  sources: RecommendedActionSource[]
  driversJson?: Record<string, unknown> | null
  status: string
  errorMessage?: string | null
}

type DriverCause = {
  feature?: string
  labelKo?: string
  directionKo?: string
  valueText?: string
  refLabel?: string | null
  sharePct?: number
}

const DOC_SLUG_MAP: Record<string, string> = {
  'QMS-GUD-001': 'Confidential/qms-source/QMS-GUD-001_습도트러블슈팅.docx',
  'QMS-GUD-002': 'Confidential/qms-source/QMS-GUD-002_소성온도트러블슈팅.docx',
  'QMS-GUD-003': 'Confidential/qms-source/QMS-GUD-003_금속이물트러블슈팅.docx',
  'QMS-GUD-004': 'Confidential/qms-source/QMS-GUD-004_잔류리튬트러블슈팅.docx',
  'QMS-GUD-005': 'Confidential/qms-source/QMS-GUD-005_입도트러블슈팅.docx',
  'QMS-ACT-001': 'Confidential/qms-source/QMS-ACT-001_소성로점검절차.docx',
  'QMS-ACT-002': 'Confidential/qms-source/QMS-ACT-002_배합비재검토절차.docx',
  'QMS-ACT-003': 'Confidential/qms-source/QMS-ACT-003_드라이룸점검절차.docx',
  'QMS-ACT-004': 'Confidential/qms-source/QMS-ACT-004_마그넷필터절차.docx',
  'QMS-ACT-005': 'Confidential/qms-source/QMS-ACT-005_전수검사운영절차.docx',
  'QMS-ACT-006': 'Confidential/qms-source/QMS-ACT-006_출하보류해제기준.docx',
  'QMS-MAN-001': 'Confidential/qms-source/QMS-MAN-001_SPC운영매뉴얼.docx',
  'QMS-MAN-002': 'Confidential/qms-source/QMS-MAN-002_불량대응절차.docx',
  'QMS-MAN-003': 'Confidential/qms-source/QMS-MAN-003_문제해결8D매뉴얼.docx',
  'QMS-MAN-004': 'Confidential/qms-source/QMS-MAN-004_일상점검인수인계지침.docx',
  'QMS-MAN-005': 'Confidential/qms-source/QMS-MAN-005_데이터기록관리지침.docx',
  'QMS-RULE-001': 'Confidential/qms-source/QMS-RULE-001_관리규격일람.docx',
  'QMS-RULE-002': 'Confidential/qms-source/QMS-RULE-002_공정능력평가규정.docx',
  'QMS-RULE-003': 'Confidential/qms-source/QMS-RULE-003_검사수준운영규정.docx',
  'QMS-RULE-004': 'Confidential/qms-source/QMS-RULE-004_PFMEA운영규정.docx',
  'QMS-RULE-005': 'Confidential/qms-source/QMS-RULE-005_4M변경관리규정.docx',
  'QMS-SOP-001': 'Confidential/qms-source/QMS-SOP-001_잔류리튬관리SOP.docx',
  'QMS-SOP-002': 'Confidential/qms-source/QMS-SOP-002_공정시간관리SOP.docx',
  'QMS-SOP-003': 'Confidential/qms-source/QMS-SOP-003_측정샘플링표준.docx',
  'QMS-STD-001': 'Confidential/qms-source/QMS-STD-001_공정흐름및검사시점기준.docx',
}

const DOC_TITLE_MAP: Record<string, string> = {
  'QMS-GUD-001': 'QMS-GUD-001 습도 트러블슈팅',
  'QMS-GUD-002': 'QMS-GUD-002 소성온도 트러블슈팅',
  'QMS-GUD-003': 'QMS-GUD-003 금속이물 트러블슈팅',
  'QMS-GUD-004': 'QMS-GUD-004 잔류리튬 트러블슈팅',
  'QMS-GUD-005': 'QMS-GUD-005 입도 트러블슈팅',
  'QMS-ACT-001': 'QMS-ACT-001 소성로 점검 절차',
  'QMS-ACT-002': 'QMS-ACT-002 배합비 재검토 절차',
  'QMS-ACT-003': 'QMS-ACT-003 드라이룸 점검 절차',
  'QMS-ACT-004': 'QMS-ACT-004 마그넷 필터 절차',
  'QMS-ACT-005': 'QMS-ACT-005 전수 검사 운영 절차',
  'QMS-ACT-006': 'QMS-ACT-006 출하 보류 해제 기준',
  'QMS-MAN-001': 'QMS-MAN-001 SPC 운영 매뉴얼',
  'QMS-MAN-002': 'QMS-MAN-002 불량 대응 절차',
  'QMS-MAN-003': 'QMS-MAN-003 문제해결 8D 매뉴얼',
  'QMS-MAN-004': 'QMS-MAN-004 일상점검 인수인계 지침',
  'QMS-MAN-005': 'QMS-MAN-005 데이터 기록 관리 지침',
  'QMS-RULE-001': 'QMS-RULE-001 관리 규격 일람',
  'QMS-RULE-002': 'QMS-RULE-002 공정 능력 평가 규정',
  'QMS-RULE-003': 'QMS-RULE-003 검사 수준 운영 규정',
  'QMS-RULE-004': 'QMS-RULE-004 PFMEA 운영 규정',
  'QMS-RULE-005': 'QMS-RULE-005 4M 변경 관리 규정',
  'QMS-SOP-001': 'QMS-SOP-001 잔류리튬 관리 SOP',
  'QMS-SOP-002': 'QMS-SOP-002 공정시간 관리 SOP',
  'QMS-SOP-003': 'QMS-SOP-003 측정 샘플링 표준',
  'QMS-STD-001': 'QMS-STD-001 공정흐름 및 검사시점 기준',
}

const PARAM_PATTERNS = [
  {
    regex: /(?:금속\s*불순물|금속이물)[^(]*\([^)]+\)/gi,
    light: 'text-amber-700 font-semibold',
    dark: 'text-amber-400 font-semibold',
  },
  {
    regex: /습도[^(]*\([^)]+\)/gi,
    light: 'text-sky-700 font-semibold',
    dark: 'text-sky-400 font-semibold',
  },
  {
    regex: /(?:소성온도|소성)[^(]*\([^)]+\)/gi,
    light: 'text-rose-700 font-semibold',
    dark: 'text-rose-400 font-semibold',
  },
  {
    regex: /(?:리튬\s*투입량|투입량)[^(]*\([^)]+\)/gi,
    light: 'text-violet-700 font-semibold',
    dark: 'text-violet-400 font-semibold',
  },
  {
    regex: /(?:입도|D50|D90)[^(]*\([^)]+\)/gi,
    light: 'text-emerald-700 font-semibold',
    dark: 'text-emerald-400 font-semibold',
  },
  {
    regex: /공정시간[^(]*\([^)]+\)/gi,
    light: 'text-orange-700 font-semibold',
    dark: 'text-orange-400 font-semibold',
  },
  {
    regex: /탱크압력[^(]*\([^)]+\)/gi,
    light: 'text-indigo-700 font-semibold',
    dark: 'text-indigo-400 font-semibold',
  },
  {
    regex: /불량확률\s*[\d.]+%?/gi,
    light: 'text-red-600 font-bold',
    dark: 'text-red-400 font-bold',
  },
  {
    regex: /잔류리튬\s*(?:예측)?\s*[\d.]+\s*ppm/gi,
    light: 'text-purple-700 font-bold',
    dark: 'text-purple-400 font-bold',
  },
]

function getMatchedTokenStyle(matched: string, isDark: boolean): string {
  for (const p of PARAM_PATTERNS) {
    p.regex.lastIndex = 0
    if (p.regex.test(matched)) {
      return isDark ? p.dark : p.light
    }
  }
  return isDark ? 'text-slate-200 font-semibold' : 'text-slate-900 font-semibold'
}

function HighlightableText({ text, isDark }: { text: string; isDark: boolean }) {
  const combinedRegex = new RegExp(
    '(?:금속\\s*불순물[^(]*\\([^)]+\\)|금속이물[^(]*\\([^)]+\\)|습도[^(]*\\([^)]+\\)|(?:소성온도|소성)[^(]*\\([^)]+\\)|(?:리튬\\s*투입량|투입량)[^(]*\\([^)]+\\)|(?:입도|D50|D90)[^(]*\\([^)]+\\)|공정시간[^(]*\\([^)]+\\)|탱크압력[^(]*\\([^)]+\\)|불량확률\\s*[\\d.]+%?|잔류리튬\\s*(?:예측)?\\s*[\\d.]+\\s*ppm)',
    'gi',
  )

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const matchedText = match[0]
    const styleClass = getMatchedTokenStyle(matchedText, isDark)
    parts.push(
      <span key={`${match.index}-${matchedText}`} className={styleClass}>
        {matchedText}
      </span>,
    )
    lastIndex = combinedRegex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return <>{parts}</>
}

function roundDecimalText(text: string): string {
  return text.replace(/(\d+\.\d+)/g, (raw) => {
    const n = Number(raw)
    return Number.isFinite(n) ? n.toFixed(2) : raw
  })
}

function roundDecimalsInText(text: string): string {
  return text.replace(/(\d+\.\d+)/g, (raw) => {
    const n = Number(raw)
    return Number.isFinite(n) ? n.toFixed(2) : raw
  })
}

function splitSummaryParagraphs(summary: string): string[] {
  const parts = summary
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length >= 2) return parts
  const one = parts[0] || summary.trim()
  const m = one.match(/^(.*?불량확률[^.]*\.)\s+(잔류리튬[\s\S]+)$/)
  if (m) return [m[1].trim(), m[2].trim()]
  return [one]
}

function formatActionCopyText(data: RecommendedActionData): string {
  const lines = [roundDecimalsInText(data.summary.trim())]
  for (const s of data.steps) {
    lines.push(`${s.order}. ${s.text}${s.docId ? ` (${s.docId})` : ''}`)
  }
  return lines.filter(Boolean).join('\n')
}

export function LotRecommendedActionPanel({
  lotId,
  riskLevel,
  action,
  isDark,
}: {
  lotId: string
  riskLevel: string | null | undefined
  action: RecommendedActionData | null | undefined
  isDark: boolean
}) {
  const router = useRouter()
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerTitle, setViewerTitle] = useState('')
  const [viewerPath, setViewerPath] = useState('')
  const [viewerText, setViewerText] = useState<string | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)

  const closeViewer = useCallback(() => {
    setViewerOpen(false)
    setViewerText(null)
    setViewerError(null)
  }, [])

  const openDoc = useCallback(async (source: RecommendedActionSource) => {
    let path = source.path?.trim()
    if (!path && source.docId) {
      path = DOC_SLUG_MAP[source.docId]
    }
    if (!path) return
    setViewerOpen(true)
    setViewerTitle(DOC_TITLE_MAP[source.docId] || source.title || source.docId)
    setViewerPath(path)
    setViewerLoading(true)
    setViewerError(null)
    setViewerText(null)
    try {
      const tryPreview = path.toLowerCase().endsWith('.docx')
      if (tryPreview) {
        const res = await apiClient.get<string>('/docs/preview', {
          params: { path },
          responseType: 'text',
          transformResponse: [(d) => d],
        })
        setViewerText(String(res.data))
        setViewerLoading(false)
        return
      }
      const { blob } = await fetchDocFileBlob(path)
      const text = await blob.text()
      setViewerText(text)
    } catch {
      setViewerError('문서를 열 수 없습니다.')
    } finally {
      setViewerLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!viewerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeViewer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerOpen, closeViewer])

  if (!action?.summary && !action?.steps?.length) {
    return (
      <div className="mt-auto pt-1 font-sans">
        <p
          className={`mb-1.5 text-xs font-semibold ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}
        >
          조치 (AI 권고)
        </p>
        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {action?.status === 'error'
            ? action.errorMessage || '조치 생성에 실패했습니다.'
            : '조치 권고를 생성 중이거나 아직 없습니다.'}
        </p>
      </div>
    )
  }

  const copyToIssue = () => {
    const text = formatActionCopyText(action)
    try {
      sessionStorage.setItem('issue_action_draft', text)
      sessionStorage.setItem('issue_lot_id', lotId)
    } catch {
      /* ignore quota */
    }
    router.push(`/issue?lotId=${encodeURIComponent(lotId)}`)
  }

  return (
    <div className="mt-auto pt-1 font-sans">
      <p
        className={`mb-2 text-xs font-semibold ${
          isDark ? 'text-slate-300' : 'text-slate-700'
        }`}
      >
        조치 (AI 권고)
      </p>

      {action.summary ? (
        <div
          className={`mb-3 rounded-md border px-3 py-2.5 ${
            isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white shadow-2xs'
          }`}
        >
          {splitSummaryParagraphs(action.summary).map((para, idx, arr) => (
            <p
              key={idx}
              className={`m-0 text-xs font-normal leading-relaxed ${
                idx < arr.length - 1 ? 'mb-2' : ''
              } ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
            >
              <HighlightableText text={roundDecimalsInText(para.trim())} isDark={isDark} />
            </p>
          ))}
        </div>
      ) : null}

      {action.steps.length > 0 ? (
        <ol
          className={`mb-3 list-decimal space-y-2 pl-4 text-xs font-medium leading-relaxed ${
            isDark ? 'text-slate-100' : 'text-slate-900'
          }`}
        >
          {action.steps.map((s) => (
            <li key={`${s.order}-${s.text}`}>
              <span>{s.text}</span>
              {s.docId ? (
                <button
                  type="button"
                  onClick={() => {
                    const found = action.sources.find((src) => src.docId === s.docId)
                    void openDoc(found || { docId: s.docId })
                  }}
                  className={`ml-1.5 whitespace-nowrap text-xs font-medium underline transition-colors cursor-pointer ${
                    isDark ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  ({s.docId})
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {action.sources.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {action.sources.map((src) => (
            <button
              key={src.docId}
              type="button"
              onClick={() => void openDoc(src)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors cursor-pointer ${
                isDark
                  ? 'bg-slate-700/80 text-slate-200 ring-slate-600 hover:bg-slate-600'
                  : 'bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200'
              } whitespace-nowrap`}
            >
              {src.docId}
            </button>
          ))}
        </div>
      ) : null}

      {riskLevel === '심각' ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={copyToIssue}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
              isDark
                ? 'bg-slate-700 text-slate-100 hover:bg-slate-600'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            이슈에 복사
          </button>
        </div>
      ) : null}

      {viewerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={closeViewer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
            }`}
          >
            <div
              className={`flex shrink-0 items-center justify-between border-b px-5 py-4 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <div>
                <h3 className={`m-0 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {viewerTitle}
                </h3>
                <p className={`mb-0 mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {viewerPath}
                </p>
              </div>
              <button type="button" onClick={closeViewer} className="text-xl text-slate-400 hover:text-slate-200 cursor-pointer">
                ×
              </button>
            </div>
            <div className="min-h-[200px] flex-1 overflow-auto px-5 py-4">
              {viewerLoading ? (
                <p className={`py-12 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  불러오는 중…
                </p>
              ) : viewerError ? (
                <p className={`py-12 text-center text-sm ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>
                  {viewerError}
                </p>
              ) : viewerText?.includes('<') ? (
                <div
                  className={`prose prose-sm max-w-none font-sans ${isDark ? 'prose-invert' : ''}`}
                  dangerouslySetInnerHTML={{ __html: viewerText }}
                />
              ) : (
                <pre
                  className={`m-0 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  {viewerText}
                </pre>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}


