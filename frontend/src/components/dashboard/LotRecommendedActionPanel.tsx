'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Download, Printer } from 'lucide-react'
import { isAxiosError } from 'axios'
import { fetchDocFileBlob, fetchDocPreview } from '@/api/docsApi'
import {
  saveIssueActionDraft,
} from '@/lib/issueActionDraft'

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

type TocItem = { id: string; label: string }
type DocMeta = {
  docNo: string
  revision: string
  date: string
  security: string
  author: string
  reviewer: string
  approver: string
  retentionYears: string
}
type PreviewData = {
  html: string
  toc: TocItem[]
  meta: DocMeta
  title: string
  subtitle: string
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

function previewFromHtmlString(html: string): PreviewData {
  const toc: TocItem[] = []
  let section = 0
  const withIds = html.replace(/<p[^>]*>\s*([0-9]+\.\s+[^<]+)<\/p>/gi, (full, label: string) => {
    const trimmed = label.trim()
    if (/^[0-9]+\.[0-9]/.test(trimmed)) return full
    if (!/^[0-9]+\.\s+/.test(trimmed)) return full
    section += 1
    const id = `section-${section}`
    toc.push({ id, label: trimmed })
    return `<h3 id="${id}" class="doc-section">${trimmed}</h3>`
  })
  return { html: withIds, toc, meta: emptyMeta(), title: '', subtitle: '' }
}

function normalizePreviewPayload(raw: unknown): PreviewData {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('<')) return previewFromHtmlString(trimmed)
    throw new Error('invalid-preview')
  }
  if (!raw || typeof raw !== 'object') throw new Error('invalid-preview')
  const o = raw as Record<string, unknown>
  if (typeof o.html !== 'string') throw new Error('invalid-preview')
  const toc = Array.isArray(o.toc)
    ? (o.toc as TocItem[]).filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string')
    : []
  return {
    html: o.html,
    toc,
    meta: { ...emptyMeta(), ...(typeof o.meta === 'object' && o.meta ? o.meta : {}) } as DocMeta,
    title: typeof o.title === 'string' ? o.title : '',
    subtitle: typeof o.subtitle === 'string' ? o.subtitle : '',
  }
}

const PRINT_STYLES = `
  body { font-family: 'Noto Sans KR', sans-serif; font-size: 13px; color: #1e293b; padding: 32px; }
  .doc-title { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
  .doc-subtitle { font-size: 12px; color: #64748b; margin: 0 0 16px; }
  h3.doc-section, .doc-section { font-size: 15px; font-weight: 700; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 24px; }
  .sec-num { color: #2563eb; margin-right: 6px; }
  h4 { font-size: 13px; font-weight: 600; margin-top: 16px; }
  p { margin: 6px 0; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; }
  @media print { body { padding: 0; } }
`

function openPrintableDocument(title: string, html: string, autoPrint: boolean): boolean {
  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) return false
  printWindow.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${title.replace(/</g, '')}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>${html}</body>
</html>`)
  printWindow.document.close()
  printWindow.focus()
  if (autoPrint) {
    setTimeout(() => {
      try {
        printWindow.print()
      } catch {
        /* popup blocked after write */
      }
    }, 250)
  }
  return true
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
    regex: /공정\s*시간[^(]*\([^)]+\)/gi,
    light: 'text-orange-700 font-semibold',
    dark: 'text-orange-400 font-semibold',
  },
  {
    regex: /첨가제\s*비율[^(]*\([^)]+\)/gi,
    light: 'text-teal-700 font-semibold',
    dark: 'text-teal-400 font-semibold',
  },
  {
    regex: /탱크\s*압력[^(]*\([^)]+\)/gi,
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
    '(?:금속\\s*불순물[^(]*\\([^)]+\\)|금속이물[^(]*\\([^)]+\\)|습도[^(]*\\([^)]+\\)|(?:소성온도|소성)[^(]*\\([^)]+\\)|(?:리튬\\s*투입량|투입량)[^(]*\\([^)]+\\)|(?:입도|D50|D90)[^(]*\\([^)]+\\)|공정\\s*시간[^(]*\\([^)]+\\)|첨가제\\s*비율[^(]*\\([^)]+\\)|탱크\\s*압력[^(]*\\([^)]+\\)|불량확률\\s*[\\d.]+%?|잔류리튬\\s*(?:예측)?\\s*[\\d.]+\\s*ppm)',
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
  const m = one.match(/^(.*?불량확률[^.]*\.)(\s+)(잔류리튬[\s\S]+)$/)
  if (m) return [m[1].trim(), m[3].trim()]
  return [one]
}

function formatActionCopyText(data: RecommendedActionData): string {
  const lines: string[] = []
  for (const s of data.steps) {
    lines.push(`${s.order}. ${s.text}${s.docId ? ` (${s.docId})` : ''}`)
  }
  return lines.filter(Boolean).join('\n')
}

// ── Document Viewer Modal ─────────────────────────────────────────────────────

function MetaRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-1.5 py-1">
      <span className={`shrink-0 text-[11px] leading-tight ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        {label}
      </span>
      <span className={`min-w-0 break-words text-[11px] font-medium leading-tight ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  )
}

function DocViewerModal({
  open,
  title,
  docPath,
  docId,
  isDark,
  onClose,
}: {
  open: boolean
  title: string
  docPath: string
  docId: string
  isDark: boolean
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PreviewData | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string>('')
  const [pdfLoading, setPdfLoading] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Load document on open
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setData(null)
    setActiveSectionId('')

    const path = docPath
    if (!path && !docId) {
      setError('문서를 열 수 없습니다.')
      setLoading(false)
      return
    }

    void (async () => {
      try {
        const raw = await fetchDocPreview({
          path: path || undefined,
          docId: docId || undefined,
        })
        const preview = normalizePreviewPayload(raw)
        setData(preview)
        if (preview.toc.length > 0) {
          setActiveSectionId(preview.toc[0].id)
        }
      } catch (err) {
        if (isAxiosError(err)) {
          const msg = (err.response?.data as { message?: string } | undefined)?.message
          setError(msg || '문서를 불러오지 못했습니다.')
        } else {
          setError('문서를 불러오지 못했습니다.')
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [open, docPath, docId])

  // IntersectionObserver for active section tracking
  useEffect(() => {
    if (!data || !contentRef.current) return

    observerRef.current?.disconnect()

    const sections = contentRef.current.querySelectorAll<HTMLElement>('h3.doc-section')
    if (sections.length === 0) return

    const visibleSections = new Map<string, number>()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id
          if (entry.isIntersecting) {
            visibleSections.set(id, entry.boundingClientRect.top)
          } else {
            visibleSections.delete(id)
          }
        }
        if (visibleSections.size === 0) return
        // Pick the topmost visible section
        const topmost = [...visibleSections.entries()].reduce((a, b) =>
          a[1] < b[1] ? a : b,
        )
        setActiveSectionId(topmost[0])
      },
      {
        root: contentRef.current,
        rootMargin: '0px 0px -60% 0px',
        threshold: 0,
      },
    )

    for (const section of sections) {
      observerRef.current.observe(section)
    }

    return () => {
      observerRef.current?.disconnect()
    }
  }, [data])

  // Keyboard close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const scrollToSection = (id: string) => {
    if (!contentRef.current) return
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
    const el = contentRef.current.querySelector<HTMLElement>(`#${escaped}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSectionId(id)
    }
  }

  const handlePdfDownload = async () => {
    if (data?.html) {
      const opened = openPrintableDocument(`${docId || title}.pdf`, data.html, true)
      if (opened) return
    }
    if (!docPath && !docId) return
    setPdfLoading(true)
    try {
      const { blob, filename } = await fetchDocFileBlob(docPath, docId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `${docId}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('다운로드에 실패했습니다.')
    } finally {
      setPdfLoading(false)
    }
  }

  const handlePrint = () => {
    if (!data?.html) return
    openPrintableDocument(title, data.html, true)
  }

  const sidebarBg = isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'
  const modalBg = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
  const headerBorder = isDark ? 'border-slate-700' : 'border-slate-200'
  const muted = isDark ? 'text-slate-500' : 'text-slate-400'
  const tocLabelCls = isDark ? 'text-slate-400' : 'text-slate-500'
  const tocItemDefault = isDark
    ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
  const tocItemActive = isDark
    ? 'bg-blue-900/50 text-blue-300 font-semibold'
    : 'bg-blue-50 text-blue-700 font-semibold'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${modalBg}`}
        style={{ height: '88vh' }}
      >
        {/* ── Modal Header ── */}
        <div className={`flex shrink-0 items-center justify-between border-b px-5 py-3.5 ${headerBorder}`}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            <h3 className={`m-0 truncate text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className={`text-xl font-light leading-none transition-colors cursor-pointer ${muted} hover:${isDark ? 'text-slate-100' : 'text-slate-700'}`}
          >
            ×
          </button>
        </div>

        {/* ── Body: Sidebar + Content ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <aside className={`flex w-56 shrink-0 flex-col gap-0 overflow-y-auto border-r ${sidebarBg}`}>
            {/* TOC */}
            <div className="px-4 pt-4 pb-2">
              <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${tocLabelCls}`}>
                문서 목차
              </p>
              {loading ? (
                <p className={`text-[11px] ${muted}`}>로딩 중…</p>
              ) : (data?.toc ?? []).length > 0 ? (
                <nav className="flex flex-col gap-0.5">
                  {data!.toc.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => scrollToSection(item.id)}
                      className={`w-full rounded-md px-2.5 py-1.5 text-left text-[12px] leading-snug transition-colors cursor-pointer ${
                        activeSectionId === item.id ? tocItemActive : tocItemDefault
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              ) : (
                <p className={`text-[11px] ${muted}`}>목차 없음</p>
              )}
            </div>

            {/* Document Meta */}
            {data?.meta && Object.values(data.meta).some(Boolean) ? (
              <>
                <div className={`mx-4 my-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`} />
                <div className="px-4 pb-3">
                  <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${tocLabelCls}`}>
                    문서 정보
                  </p>
                  <MetaRow label="문서번호" value={data.meta.docNo} isDark={isDark} />
                  <MetaRow label="개정번호" value={data.meta.revision} isDark={isDark} />
                  <MetaRow label="제정일" value={data.meta.date} isDark={isDark} />
                  <MetaRow label="보안등급" value={data.meta.security} isDark={isDark} />
                  <MetaRow label="작성" value={data.meta.author} isDark={isDark} />
                  <MetaRow label="검토" value={data.meta.reviewer} isDark={isDark} />
                  <MetaRow label="승인" value={data.meta.approver} isDark={isDark} />
                  <MetaRow label="보존기간" value={data.meta.retentionYears} isDark={isDark} />
                </div>
              </>
            ) : null}

            {/* PDF Download */}
            <div className="mt-auto px-4 pb-4">
              <button
                type="button"
                onClick={() => void handlePdfDownload()}
                disabled={pdfLoading || loading}
                className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDark
                    ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                {pdfLoading ? '다운로드 중…' : 'PDF 다운로드'}
              </button>
            </div>
          </aside>

          {/* Right Content Area */}
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Print button */}
            <div className={`flex shrink-0 justify-end border-b px-5 py-2 ${headerBorder}`}>
              <button
                type="button"
                onClick={handlePrint}
                disabled={loading || !data}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                  isDark
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Printer className="h-3.5 w-3.5" aria-hidden />
                인쇄
              </button>
            </div>

            {/* Scrollable document */}
            <div ref={contentRef} className="flex-1 overflow-y-auto px-8 py-6">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <p className={`text-sm ${muted}`}>문서를 불러오는 중…</p>
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center">
                  <p className={`text-sm ${isDark ? 'text-rose-300' : 'text-rose-500'}`}>{error}</p>
                </div>
              ) : data ? (
                <div
                  className={isDark ? 'doc-preview-theme-dark text-slate-200' : 'text-slate-800'}
                  dangerouslySetInnerHTML={{ __html: data.html }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Panel Component ──────────────────────────────────────────────────────

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
  const [viewerDocId, setViewerDocId] = useState('')

  const closeViewer = useCallback(() => {
    setViewerOpen(false)
  }, [])

  const openDoc = useCallback((source: RecommendedActionSource) => {
    let path = source.path?.trim()
    if (!path && source.docId) {
      path = DOC_SLUG_MAP[source.docId]
    }
    if (!path) return
    setViewerTitle(DOC_TITLE_MAP[source.docId] ?? source.title ?? source.docId)
    setViewerPath(path)
    setViewerDocId(source.docId)
    setViewerOpen(true)
  }, [])

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
    saveIssueActionDraft(lotId, text)
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
                    openDoc(found ?? { docId: s.docId! })
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
              onClick={() => openDoc(src)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors cursor-pointer whitespace-nowrap ${
                isDark
                  ? 'bg-slate-700/80 text-slate-200 ring-slate-600 hover:bg-slate-600'
                  : 'bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200'
              }`}
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

      <DocViewerModal
        open={viewerOpen}
        title={viewerTitle}
        docPath={viewerPath}
        docId={viewerDocId}
        isDark={isDark}
        onClose={closeViewer}
      />
    </div>
  )
}
