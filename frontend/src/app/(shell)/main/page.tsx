'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  mainApi,
  RISK_TOP_PAGE_SIZE,
  type QCostSummaryResponse,
  type RiskTopLot,
} from '@/api/mainApi';
import { issueApi } from '@/api/issueApi';
import {
  IssueDetailAnalysis,
  issueDetailToAnalysisModel,
  type IssueDetailAnalysisModel,
} from '@/components/IssueDetailAnalysis';
import { useUiSettings } from '@/components/layout/AppShell';
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent';
import { usePageChat } from '@/context/PageChatContext';
import { useShellRefresh } from '@/hooks/useShellRefresh';
import {
  APPRAISAL_UNIT,
  formatKRW,
  type QCostResult,
} from '@/lib/qCost';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type RiskGrade = '심각' | '주의' | '안정';

type LotProcessRecord = {
  id: string;
  date: string;
  hour: string;
  sintering_temp: number;
  lithium_input: number;
  humidity: number;
  metal_impurity: number;
  tank_pressure: number;
  process_time: number;
  additive_ratio: number;
  quality_defect: 0 | 1;
  d50?: number;
  d90?: number;
};

type RiskLotView = {
  id: string;
  riskScore: number;
  status: RiskGrade;
  riskReason: string;
  record: LotProcessRecord;
};

type SummaryKpi = {
  id: string;
  title: string;
  value: string;
  description: string;
};

type ToastItem = {
  id: number;
  message: string;
  variant: 'success' | 'error' | 'info';
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function splitRecordedAt(recordedAt: string): { date: string; hour: string } {
  const trimmed = (recordedAt || '').trim();
  if (!trimmed) return { date: '—', hour: '' };
  const [datePart, timePart = ''] = trimmed.split(/\s+/);
  const hour = timePart.slice(0, 5) || timePart;
  return { date: datePart || trimmed, hour };
}

function numOrZero(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

function toRiskLotView(lot: RiskTopLot): RiskLotView {
  const { date, hour } = splitRecordedAt(lot.recordedAt);
  return {
    id: lot.lotId,
    riskScore: lot.defectProb ?? 0,
    status: lot.riskLevel,
    riskReason: lot.riskReason?.trim() || '—',
    record: {
      id: lot.lotId,
      date,
      hour,
      sintering_temp: numOrZero(lot.sinteringTemp),
      lithium_input: numOrZero(lot.lithiumInput),
      humidity: numOrZero(lot.humidity),
      metal_impurity: numOrZero(lot.metalImpurity),
      tank_pressure: numOrZero(lot.tankPressure),
      process_time: numOrZero(lot.processTime),
      additive_ratio: numOrZero(lot.additiveRatio),
      quality_defect: lot.qualityDefect ? 1 : 0,
      d50: lot.d50 ?? undefined,
      d90: lot.d90 ?? undefined,
    },
  };
}

function buildPaginationItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 3) return [1, 2, 3, 'ellipsis', total];
  if (current >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total];
  return [1, 'ellipsis', current, 'ellipsis', total];
}

/** 금일 00시 기준 · analysis_lots.probability · 임계 0.8 (기준 시각은 섹션 헤더에 표시) */
const SUMMARY_KPI_META: Omit<SummaryKpi, 'value'>[] = [
  {
    id: 'yield-rate',
    title: '실시간 양품률',
    description: '불량확률 < 0.8',
  },
  {
    id: 'yield-count',
    title: '양품수',
    description: '불량확률 < 0.8',
  },
  {
    id: 'defect-rate',
    title: '불량률',
    description: '불량확률 ≥ 0.8',
  },
  {
    id: 'defect-count',
    title: '불량수',
    description: '불량확률 ≥ 0.8',
  },
];

function formatDailyKpis(kpi: {
  total: number
  goodCount: number
  defectCount: number
  goodRate: number | null
  defectRate: number | null
} | null): SummaryKpi[] {
  const empty = (id: string) => SUMMARY_KPI_META.find((m) => m.id === id)!
  if (!kpi || kpi.total <= 0) {
    return SUMMARY_KPI_META.map((m) => ({ ...m, value: '—' }))
  }
  return [
    { ...empty('yield-rate'), value: `${kpi.goodRate ?? 0}%` },
    { ...empty('yield-count'), value: String(kpi.goodCount) },
    { ...empty('defect-rate'), value: `${kpi.defectRate ?? 0}%` },
    { ...empty('defect-count'), value: String(kpi.defectCount) },
  ]
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function parseYearMonth(yearMonth: string): { year: number; month: number } {
  const [yRaw, mRaw] = yearMonth.split('-')
  const year = Number(yRaw)
  const month = Number(mRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  return { year, month }
}

function formatYearMonthLabel(yearMonth: string): string {
  const { year, month } = parseYearMonth(yearMonth)
  return `${year}년 ${month}월`
}

function toYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Exclusive end date (`to`) for calendar month `YYYY-MM`. */
function monthRange(yearMonth: string): { from: string; to: string } {
  const { year: y, month: m } = parseYearMonth(yearMonth)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`
  return { from, to }
}

function resultFromQCostSummary(data: QCostSummaryResponse): QCostResult {
  return {
    appraisalCost: data.appraisalCost,
    appraisalBreakdown: data.appraisalBreakdown,
    internalCost: data.internalCost,
    externalCost: data.externalCost,
    preventionCost: data.preventionCost,
    totalQCost: data.totalQCost,
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function csvEscape(value: string | number): string {
  const text = String(value)
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function buildQCostCsv(summary: QCostSummaryResponse, yearMonth: string): string {
  const lines = [
    ['항목', '값'],
    ['조회월', formatYearMonthLabel(yearMonth)],
    ['기간_from', summary.from],
    ['기간_to(미포함)', summary.to],
    ['안정_LOT수', summary.stableCount],
    ['주의_LOT수', summary.warningCount],
    ['심각_LOT수', summary.criticalCount],
    ['내부불량_건수', summary.internalDefectCount],
    ['외부유출_건수', summary.externalLeakCount],
    ['평가비용_안정', summary.appraisalBreakdown.stable],
    ['평가비용_주의', summary.appraisalBreakdown.warning],
    ['평가비용_심각', summary.appraisalBreakdown.critical],
    ['평가비용_합계', summary.appraisalCost],
    ['내부실패비용', summary.internalCost],
    ['외부실패비용', summary.externalCost],
    ['예방비용', summary.preventionCost],
    ['총_Q-Cost', summary.totalQCost],
  ]
  return lines.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('PDF 이미지 생성 실패'))
          return
        }
        const buffer = await blob.arrayBuffer()
        resolve(new Uint8Array(buffer))
      },
      'image/jpeg',
      quality,
    )
  })
}

/** Minimal single-page PDF wrapping a JPEG (Korean text via canvas fonts). */
function buildJpegPdf(jpeg: Uint8Array, width: number, height: number): Blob {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  let offset = 0
  const offsets: number[] = [0]

  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    parts.push(bytes)
    offset += bytes.length
  }

  const startObj = (id: number) => {
    offsets[id] = offset
  }

  push('%PDF-1.4\n')

  startObj(1)
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  startObj(2)
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')

  startObj(3)
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`,
  )

  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`
  startObj(4)
  push(`4 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`)

  startObj(5)
  push(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  )
  push(jpeg)
  push('\nendstream\nendobj\n')

  const xrefStart = offset
  push(`xref\n0 6\n0000000000 65535 f \n`)
  for (let id = 1; id <= 5; id += 1) {
    push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`)

  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const merged = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) {
    merged.set(part, cursor)
    cursor += part.length
  }
  return new Blob([merged], { type: 'application/pdf' })
}

async function buildQCostPdfBlob(
  summary: QCostSummaryResponse,
  yearMonth: string,
): Promise<Blob> {
  const width = 794
  const height = 1123
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('PDF 캔버스를 만들 수 없습니다.')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const drawText = (
    text: string,
    x: number,
    y: number,
    options?: { size?: number; weight?: string; color?: string },
  ) => {
    const size = options?.size ?? 14
    const weight = options?.weight ?? 'normal'
    ctx.fillStyle = options?.color ?? '#0f172a'
    ctx.font = `${weight} ${size}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`
    ctx.fillText(text, x, y)
  }

  drawText('Q-Cost 리포트', 48, 64, { size: 28, weight: '700' })
  drawText(`조회 월: ${formatYearMonthLabel(yearMonth)}`, 48, 100, { size: 14, color: '#475569' })
  drawText(`집계 기간: ${summary.from} ~ ${summary.to} (to 미포함)`, 48, 124, {
    size: 13,
    color: '#64748b',
  })

  ctx.strokeStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.moveTo(48, 148)
  ctx.lineTo(width - 48, 148)
  ctx.stroke()

  drawText('총 Q-Cost', 48, 190, { size: 14, color: '#64748b' })
  drawText(formatKRW(summary.totalQCost), 48, 230, { size: 32, weight: '700' })

  const rows: Array<[string, string]> = [
    ['평가 비용 합계', formatKRW(summary.appraisalCost)],
    [
      `  · 안정 ${summary.stableCount.toLocaleString('ko-KR')} LOT`,
      formatKRW(summary.appraisalBreakdown.stable),
    ],
    [
      `  · 주의 ${summary.warningCount.toLocaleString('ko-KR')} LOT`,
      formatKRW(summary.appraisalBreakdown.warning),
    ],
    [
      `  · 심각 ${summary.criticalCount.toLocaleString('ko-KR')} LOT`,
      formatKRW(summary.appraisalBreakdown.critical),
    ],
    [
      `내부 실패 (${summary.internalDefectCount.toLocaleString('ko-KR')}건)`,
      formatKRW(summary.internalCost),
    ],
    [
      `외부 실패 (${summary.externalLeakCount.toLocaleString('ko-KR')}건)`,
      formatKRW(summary.externalCost),
    ],
    ['예방 비용 (월 고정)', formatKRW(summary.preventionCost)],
  ]

  let y = 290
  drawText('상세 내역', 48, y, { size: 16, weight: '700' })
  y += 28
  for (const [label, amount] of rows) {
    drawText(label, 48, y, { size: 14, color: '#334155' })
    ctx.textAlign = 'right'
    drawText(amount, width - 48, y, { size: 14, weight: '600' })
    ctx.textAlign = 'left'
    y += 28
  }

  y += 16
  ctx.strokeStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.moveTo(48, y)
  ctx.lineTo(width - 48, y)
  ctx.stroke()
  y += 36
  drawText(
    `생성 시각: ${new Date().toLocaleString('ko-KR', { hour12: false })}`,
    48,
    y,
    { size: 12, color: '#94a3b8' },
  )
  drawText('단가: 안정 5만 · 주의 10만 · 심각 15만 / LOT · 내부 50만 · 외부 300만 · 예방 2,000만', 48, y + 24, {
    size: 11,
    color: '#94a3b8',
  })

  const jpeg = await canvasToJpegBytes(canvas)
  return buildJpegPdf(jpeg, width, height)
}

const MONTH_LABELS = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
] as const

/** Year/month popover — any past year (e.g. last year) selectable. */
function QCostMonthPicker({
  value,
  onChange,
  isDark,
}: {
  value: string
  onChange: (yearMonth: string) => void
  isDark: boolean
}) {
  const selected = parseYearMonth(value)
  const now = new Date()
  const maxYear = now.getFullYear()
  const minYear = 2020

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(selected.year)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    setViewYear(Math.min(maxYear, Math.max(minYear, selected.year)))
  }, [open, selected.year, maxYear, minYear])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const panelClass = isDark
    ? 'border-slate-600 bg-slate-900 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900'
  const muted = isDark ? 'text-slate-400' : 'text-slate-500'
  const btnClass = isDark
    ? 'h-9 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm font-medium text-slate-100 outline-none transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500/40'
    : 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/40'
  const navBtnClass = isDark
    ? 'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 disabled:opacity-30'
    : 'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30'

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <span className={`mb-1 block text-[11px] font-medium ${muted}`}>조회 월</span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`${btnClass} inline-flex min-w-[9.5rem] items-center justify-between gap-2`}
      >
        <span className="tabular-nums">{formatYearMonthLabel(value)}</span>
        <span aria-hidden className={muted}>
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="조회 월 선택"
          className={`absolute right-0 z-40 mt-2 w-[17.5rem] rounded-xl border p-3 shadow-xl ${panelClass}`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className={navBtnClass}
              aria-label="이전 해"
              disabled={viewYear <= minYear}
              onClick={() => setViewYear((y) => Math.max(minYear, y - 1))}
            >
              ‹
            </button>
            <p className="text-sm font-semibold tabular-nums">{viewYear}년</p>
            <button
              type="button"
              className={navBtnClass}
              aria-label="다음 해"
              disabled={viewYear >= maxYear}
              onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_LABELS.map((label, index) => {
              const month = index + 1
              const isSelected = selected.year === viewYear && selected.month === month
              const isFuture =
                viewYear > maxYear ||
                (viewYear === maxYear && month > now.getMonth() + 1)
              return (
                <button
                  key={label}
                  type="button"
                  disabled={isFuture}
                  onClick={() => {
                    onChange(toYearMonth(viewYear, month))
                    setOpen(false)
                  }}
                  className={`rounded-lg px-2 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isDark
                        ? 'text-slate-200 hover:bg-slate-800'
                        : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <p className={`mt-3 text-[11px] leading-relaxed ${muted}`}>
            ‹ › 로 연도를 바꿔 작년 등 과거 월을 선택할 수 있습니다.
          </p>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Small UI pieces                                                            */
/* -------------------------------------------------------------------------- */

function ToastStack({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-24 right-6 z-[70] flex w-[min(92vw,320px)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${
            toast.variant === 'error'
              ? 'border-red-300 bg-red-50 text-red-800'
              : toast.variant === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-blue-300 bg-blue-50 text-blue-800'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{toast.message}</span>
            <button type="button" className="text-xs opacity-70" onClick={() => onClose(toast.id)}>
              닫기
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
  wide,
  elevated,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Stack above another open modal (e.g. detail over list). */
  elevated?: boolean;
}) {
  const { isDark } = useUiSettings();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${
        elevated ? 'z-[90]' : 'z-[80]'
      } ${isDark ? 'bg-slate-950/70' : 'bg-slate-900/45'}`}
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="닫기" onClick={onClose} />
      <div
        className={`relative max-h-[85vh] w-full overflow-hidden rounded-2xl border shadow-2xl ${
          wide ? 'max-w-5xl' : 'max-w-2xl'
        } ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}
      >
        <div
          className={`flex items-center justify-between border-b px-5 py-4 ${
            isDark ? 'border-slate-700' : 'border-slate-200'
          }`}
        >
          <h3 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm font-bold ${
              isDark
                ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            X
          </button>
        </div>
        <div className="max-h-[calc(85vh-64px)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function MainPage() {
  const { isDark, language } = useUiSettings();
  const { setPagePayload, trackPageChatEvent } = usePageChat();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [selectedLot, setSelectedLot] = useState<RiskLotView | null>(null);
  const [issueAnalysis, setIssueAnalysis] = useState<IssueDetailAnalysisModel | null>(null);
  const [issueAnalysisLoading, setIssueAnalysisLoading] = useState(false);
  const [issueAnalysisError, setIssueAnalysisError] = useState<string | null>(null);
  const issueDetailSeqRef = useRef(0);
  const [topRiskLots, setTopRiskLots] = useState<RiskLotView[]>([]);
  const [riskLotsLoading, setRiskLotsLoading] = useState(true);
  const [riskTopPage, setRiskTopPage] = useState(1);
  const [riskTopTotal, setRiskTopTotal] = useState(0);
  const [riskTopTotalPages, setRiskTopTotalPages] = useState(1);
  const [summaryKpis, setSummaryKpis] = useState<SummaryKpi[]>(() => formatDailyKpis(null));
  const [qCostMonth, setQCostMonth] = useState(currentYearMonth);
  const [qCostSummary, setQCostSummary] = useState<QCostSummaryResponse | null>(null);
  const [qCostLoading, setQCostLoading] = useState(true);
  const [qCostError, setQCostError] = useState<string | null>(null);
  const [qCostExporting, setQCostExporting] = useState<'csv' | 'pdf' | null>(null);

  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const loadSeqRef = useRef(0);
  const qCostSeqRef = useRef(0);

  const pushToast = useCallback((message: string, variant: ToastItem['variant'] = 'info') => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    const timer = setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
    toastTimersRef.current.push(timer);
  }, []);

  const loadMainData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setRiskLotsLoading(true);
    const [riskSettled, kpiSettled] = await Promise.allSettled([
      mainApi.getRiskTop({
        page: riskTopPage,
        pageSize: RISK_TOP_PAGE_SIZE,
      }),
      mainApi.getDailyKpi(),
    ]);
    if (seq !== loadSeqRef.current) return;

    if (riskSettled.status === 'fulfilled') {
      const data = riskSettled.value.data;
      setTopRiskLots((data.lots ?? []).map(toRiskLotView));
      setRiskTopTotal(data.total ?? 0);
      const pages = Math.max(1, data.totalPages ?? 1);
      setRiskTopTotalPages(pages);
      if (data.page != null && data.page !== riskTopPage) {
        setRiskTopPage(data.page);
      } else if (riskTopPage > pages) {
        setRiskTopPage(pages);
      }
    } else {
      setTopRiskLots([]);
      setRiskTopTotal(0);
      setRiskTopTotalPages(1);
      pushToast(
        getApiErrorMessage(riskSettled.reason, '위험 LOT 목록을 불러오지 못했습니다.'),
        'error',
      );
    }

    if (kpiSettled.status === 'fulfilled') {
      setSummaryKpis(formatDailyKpis(kpiSettled.value.data));
    } else {
      setSummaryKpis(formatDailyKpis(null));
      pushToast(
        getApiErrorMessage(kpiSettled.reason, '당일 KPI를 불러오지 못했습니다.'),
        'error',
      );
    }

    if (seq === loadSeqRef.current) {
      setRiskLotsLoading(false);
    }
  }, [pushToast, riskTopPage]);

  useEffect(() => {
    void loadMainData();
  }, [loadMainData]);

  const loadQCost = useCallback(async () => {
    const seq = ++qCostSeqRef.current;
    setQCostLoading(true);
    setQCostError(null);
    const { from, to } = monthRange(qCostMonth);
    try {
      const { data } = await mainApi.getQCost({ from, to });
      if (seq !== qCostSeqRef.current) return;
      setQCostSummary(data);
    } catch (error) {
      if (seq !== qCostSeqRef.current) return;
      setQCostSummary(null);
      setQCostError(getApiErrorMessage(error, 'Q-Cost 데이터를 불러오지 못했습니다.'));
    } finally {
      if (seq === qCostSeqRef.current) setQCostLoading(false);
    }
  }, [qCostMonth]);

  useEffect(() => {
    void loadQCost();
  }, [loadQCost]);

  useEffect(() => {
    setPagePayload(
      '/main',
      {
        riskTop: {
          page: riskTopPage,
          total: riskTopTotal,
          totalPages: riskTopTotalPages,
          lots: topRiskLots.slice(0, 10).map((l) => ({
            lotId: l.id,
            riskScore: l.riskScore,
            status: l.status,
            riskReason: l.riskReason,
          })),
        },
        dailyKpi: summaryKpis.map((k) => ({ id: k.id, title: k.title, value: k.value })),
        qCost: qCostSummary
          ? {
              month: qCostMonth,
              from: qCostSummary.from,
              to: qCostSummary.to,
              stableCount: qCostSummary.stableCount,
              warningCount: qCostSummary.warningCount,
              criticalCount: qCostSummary.criticalCount,
              appraisalCost: qCostSummary.appraisalCost,
              internalCost: qCostSummary.internalCost,
              externalCost: qCostSummary.externalCost,
              preventionCost: qCostSummary.preventionCost,
              totalQCost: qCostSummary.totalQCost,
            }
          : { month: qCostMonth, loading: qCostLoading, error: qCostError },
        selectedLotId: selectedLot?.id ?? null,
      },
      ['risk-top', 'daily-kpi', 'q-cost'],
    );
  }, [
    setPagePayload,
    riskTopPage,
    riskTopTotal,
    riskTopTotalPages,
    topRiskLots,
    summaryKpis,
    qCostSummary,
    qCostMonth,
    qCostLoading,
    qCostError,
    selectedLot?.id,
  ]);

  useShellRefresh(() => {
    void loadMainData();
    void loadQCost();
  });

  const handleDownloadQCostCsv = useCallback(() => {
    if (!qCostSummary) {
      pushToast('다운로드할 Q-Cost 데이터가 없습니다.', 'error');
      return;
    }
    try {
      setQCostExporting('csv');
      trackPageChatEvent({
        type: 'download',
        route: '/main',
        target: 'q-cost-download-csv',
        entityId: qCostMonth,
        payload: { month: qCostMonth, summary: qCostSummary },
      });
      const csv = `\uFEFF${buildQCostCsv(qCostSummary, qCostMonth)}`;
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `qcost_${qCostMonth}.csv`);
      pushToast('Q-Cost CSV를 다운로드했습니다.', 'success');
    } catch (error) {
      pushToast(getApiErrorMessage(error, 'CSV 다운로드에 실패했습니다.'), 'error');
    } finally {
      setQCostExporting(null);
    }
  }, [qCostMonth, qCostSummary, pushToast, trackPageChatEvent]);

  const handleDownloadQCostPdf = useCallback(async () => {
    if (!qCostSummary) {
      pushToast('다운로드할 Q-Cost 데이터가 없습니다.', 'error');
      return;
    }
    try {
      setQCostExporting('pdf');
      trackPageChatEvent({
        type: 'download',
        route: '/main',
        target: 'q-cost-download-pdf',
        entityId: qCostMonth,
        payload: { month: qCostMonth, summary: qCostSummary },
      });
      const blob = await buildQCostPdfBlob(qCostSummary, qCostMonth);
      downloadBlob(blob, `qcost_${qCostMonth}.pdf`);
      pushToast('Q-Cost PDF를 다운로드했습니다.', 'success');
    } catch (error) {
      pushToast(getApiErrorMessage(error, 'PDF 다운로드에 실패했습니다.'), 'error');
    } finally {
      setQCostExporting(null);
    }
  }, [qCostMonth, qCostSummary, pushToast, trackPageChatEvent]);

  const qCostResult = useMemo(
    () => (qCostSummary ? resultFromQCostSummary(qCostSummary) : null),
    [qCostSummary],
  );

  const qCostAppraisalMax = Math.max(
    qCostResult?.appraisalBreakdown.stable ?? 0,
    qCostResult?.appraisalBreakdown.warning ?? 0,
    qCostResult?.appraisalBreakdown.critical ?? 0,
    1,
  );

  const riskTopPageItems = useMemo(
    () => buildPaginationItems(riskTopPage, riskTopTotalPages),
    [riskTopPage, riskTopTotalPages],
  );

  const handleRiskTopPageChange = (next: number) => {
    const clamped = Math.min(riskTopTotalPages, Math.max(1, next));
    setRiskTopPage(clamped);
  };

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleOpenLotDetail = (lot: RiskLotView) => {
    setSelectedLot(lot);
    const slimRecord = {
      sintering_temp: lot.record.sintering_temp,
      humidity: lot.record.humidity,
      d50: lot.record.d50,
      d90: lot.record.d90,
      lithium_input: lot.record.lithium_input,
      additive_ratio: lot.record.additive_ratio,
      process_time: lot.record.process_time,
      metal_impurity: lot.record.metal_impurity,
    };
    trackPageChatEvent({
      type: 'row_click',
      route: '/main',
      target: 'risk-top-row',
      entityId: lot.id,
      payload: {
        lotId: lot.id,
        riskScore: lot.riskScore,
        status: lot.status,
        riskReason: lot.riskReason,
        spcStatus: null,
        spcGraph: 'none',
        record: slimRecord,
      },
    });
    setIssueAnalysis(null);
    setIssueAnalysisError(null);
    setIssueAnalysisLoading(true);
    const seq = ++issueDetailSeqRef.current;
    void (async () => {
      try {
        const { data: listData } = await issueApi.list({ lotId: lot.id });
        const first = listData.issues[0];
        if (!first) {
          if (seq !== issueDetailSeqRef.current) return;
          setIssueAnalysis(null);
          setIssueAnalysisError('해당 LOT의 이슈가 없습니다.');
          trackPageChatEvent({
            type: 'row_select',
            route: '/main',
            target: 'risk-top-detail',
            entityId: lot.id,
            payload: {
              lotId: lot.id,
              riskScore: lot.riskScore,
              status: lot.status,
              riskReason: lot.riskReason,
              spcStatus: '-',
              spcGraph: 'none',
              record: slimRecord,
              issueId: null,
            },
          });
          return;
        }
        const { data: detailData } = await issueApi.getById(first.issueId);
        if (seq !== issueDetailSeqRef.current) return;
        const analysis = issueDetailToAnalysisModel(detailData.issue);
        setIssueAnalysis(analysis);
        setIssueAnalysisError(null);
        const spcRaw =
          analysis.analysis?.spcStatus ?? analysis.listSpcStatus ?? null;
        const spcText = spcRaw != null ? String(spcRaw).trim() : '';
        const spcBlank = !spcText || spcText === '-' || spcText === '—';
        trackPageChatEvent({
          type: 'row_select',
          route: '/main',
          target: 'risk-top-detail',
          entityId: lot.id,
          payload: {
            lotId: lot.id,
            riskScore: lot.riskScore,
            status: lot.status,
            riskReason: lot.riskReason,
            record: slimRecord,
            issueId: analysis.issueId,
            issueContent: analysis.issueContent.slice(0, 300),
            riskLevel: analysis.riskLevel,
            spcStatus: spcRaw ?? '-',
            spcGraph: spcBlank ? 'none' : 'present',
            analysis: analysis.analysis
              ? {
                  probability: analysis.analysis.probability,
                  spcStatus: analysis.analysis.spcStatus,
                  riskLevel: analysis.analysis.riskLevel,
                  riskReason: analysis.analysis.riskReason,
                }
              : null,
          },
        });
      } catch (error) {
        if (seq !== issueDetailSeqRef.current) return;
        setIssueAnalysis(null);
        setIssueAnalysisError(getApiErrorMessage(error, '이슈 상세 분석을 불러오지 못했습니다.'));
      } finally {
        if (seq === issueDetailSeqRef.current) setIssueAnalysisLoading(false);
      }
    })();
  };

  const handleCloseLotDetail = () => {
    issueDetailSeqRef.current += 1;
    setSelectedLot(null);
    trackPageChatEvent({ type: 'clear', route: '/main', target: 'risk-top-row' });
    setIssueAnalysis(null);
    setIssueAnalysisError(null);
    setIssueAnalysisLoading(false);
  };
  const cardClass = isDark
    ? 'min-w-0 rounded-xl border border-slate-700 bg-slate-800 shadow-sm'
    : 'min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm';
  const subpanelClass = isDark
    ? 'rounded-xl border border-slate-700 bg-slate-900/70'
    : 'rounded-xl border border-slate-200/70 bg-slate-50/40';
  const detailLinkClass = isDark
    ? 'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'
    : 'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40';
  const tableDetailBtnClass = isDark
    ? 'inline-flex h-7 items-center justify-center rounded-md border border-slate-600 px-2.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'
    : 'inline-flex h-7 items-center justify-center rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40';
  const rowHoverClass = isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50';
  const tableBorderClass = isDark ? 'border-slate-700' : 'border-slate-100';

  return (
    <div
      className={`h-full overflow-y-auto ${
        isDark
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800'
          : 'bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50'
      }`}
    >
      <div className={`${SHELL_CONTENT_CLASS} space-y-5 py-6 pb-40`}>
        <header className="mb-1 min-w-0">
          <div className="mb-6 flex flex-col gap-1">
            <p
              className={`text-sm font-bold tracking-wide ${
                isDark ? 'text-blue-400' : 'text-blue-600'
              }`}
            >
              Process Monitoring
            </p>
            <h1
              className={`mt-1 text-3xl font-bold tracking-tight ${
                isDark ? 'text-slate-100' : 'text-gray-900'
              }`}
            >
              {language === 'en' ? 'Sintering Process Monitoring' : '소성 공정 모니터링'}
            </h1>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              {language === 'en'
                ? 'Monitor production progress and equipment status in real time.'
                : '생산 공정의 진행 현황과 설비 상태를 실시간으로 확인합니다.'}
            </p>
          </div>
        </header>

        <section
          className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200/80 bg-white'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {language === 'en' ? 'Sintering Process Forecast' : '소성 공정 예측 현황'}
            </h2>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              금일 00시 기준
            </span>
          </div>
          <div
            className={`mt-4 border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {summaryKpis.map((kpi) => (
                <button
                  key={kpi.id}
                  type="button"
                  className={`${subpanelClass} p-4 text-left md:p-5`}
                  onClick={() =>
                    trackPageChatEvent({
                      type: 'kpi_click',
                      route: '/main',
                      target: `kpi-${kpi.id}`,
                      entityId: kpi.id,
                      payload: { id: kpi.id, title: kpi.title, value: kpi.value },
                    })
                  }
                >
                  <div
                    className={`mb-3 text-sm font-medium ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {kpi.title}
                  </div>
                  <div
                    className={`text-xl font-bold tabular-nums tracking-tight sm:text-2xl lg:text-3xl ${
                      kpi.value === '—'
                        ? isDark
                          ? 'text-slate-500'
                          : 'text-slate-300'
                        : isDark
                          ? 'text-slate-100'
                          : 'text-slate-900'
                    }`}
                  >
                    {kpi.value}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{kpi.description}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 items-stretch gap-5 pb-8 xl:grid-cols-5">
          <section className={`${cardClass} flex h-full flex-col p-5 md:p-6 xl:col-span-3`} aria-labelledby="qcost-heading">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="qcost-heading"
                  className={`text-base font-semibold tracking-tight ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                  Q-Cost
                </h2>
                <p className={`mt-1 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Tier-based Quality Cost · 월 단위 집계
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleDownloadQCostCsv}
                    disabled={!qCostSummary || qCostLoading || qCostExporting !== null}
                    className={
                      isDark
                        ? 'inline-flex h-9 items-center rounded-lg border border-slate-600 bg-slate-900 px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'
                        : 'inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
                    }
                  >
                    {qCostExporting === 'csv' ? 'CSV…' : 'CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadQCostPdf()}
                    disabled={!qCostSummary || qCostLoading || qCostExporting !== null}
                    className={
                      isDark
                        ? 'inline-flex h-9 items-center rounded-lg border border-slate-600 bg-slate-900 px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'
                        : 'inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
                    }
                  >
                    {qCostExporting === 'pdf' ? 'PDF…' : 'PDF'}
                  </button>
                </div>
                <QCostMonthPicker
                  value={qCostMonth}
                  onChange={(month) => {
                    setQCostMonth(month);
                    trackPageChatEvent({
                      type: 'filter_apply',
                      route: '/main',
                      target: 'q-cost-month',
                      entityId: month,
                      payload: { month },
                    });
                  }}
                  isDark={isDark}
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              <div
                className={`rounded-xl border p-5 shadow-sm ${
                  isDark
                    ? 'border-slate-600 bg-gradient-to-br from-slate-800 to-slate-900'
                    : 'border-slate-200 bg-gradient-to-br from-white to-slate-50'
                }`}
              >
                <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  총 Q-Cost 발생 금액
                </p>
                <p
                  className={`mt-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                  {qCostLoading ? '…' : formatKRW(qCostResult?.totalQCost ?? 0)}
                </p>
                <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  평가 + 내부실패 + 외부실패 + 예방(월 고정)
                  {qCostSummary ? ` · ${qCostSummary.from} ~ ${qCostSummary.to}` : ''}
                </p>
                {qCostError ? (
                  <p className={`mt-2 text-xs font-medium ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                    {qCostError}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      id: 'appraisal',
                      label: '평가 비용',
                      amount: qCostResult?.appraisalCost ?? 0,
                      description: '등급별 LOT 검사·평가',
                      tone: isDark ? 'border-amber-700/50 bg-amber-950/30' : 'border-amber-200 bg-amber-50/60',
                      valueTone: isDark ? 'text-amber-300' : 'text-amber-800',
                    },
                    {
                      id: 'internal',
                      label: '내부 실패 비용',
                      amount: qCostResult?.internalCost ?? 0,
                      description: '불량 1건당 500,000원',
                      tone: isDark ? 'border-red-800/50 bg-red-950/30' : 'border-red-200 bg-red-50/60',
                      valueTone: isDark ? 'text-red-300' : 'text-red-700',
                    },
                    {
                      id: 'external',
                      label: '외부 실패 비용',
                      amount: qCostResult?.externalCost ?? 0,
                      description: '유출 1건당 3,000,000원',
                      tone: isDark ? 'border-red-700/60 bg-red-950/40' : 'border-red-300 bg-red-50',
                      valueTone: isDark ? 'text-red-200' : 'text-red-800',
                    },
                    {
                      id: 'prevention',
                      label: '예방 비용',
                      amount: qCostResult?.preventionCost ?? 0,
                      description: '월 고정 20,000,000원',
                      tone: isDark ? 'border-blue-800/50 bg-blue-950/30' : 'border-blue-200 bg-blue-50/60',
                      valueTone: isDark ? 'text-blue-300' : 'text-blue-700',
                    },
                  ] as const
                ).map((card) => (
                  <div key={card.id} className={`rounded-xl border p-4 shadow-sm ${card.tone}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {card.label}
                    </p>
                    <p className={`mt-2 text-xl font-bold tabular-nums ${card.valueTone}`}>
                      {qCostLoading ? '…' : formatKRW(card.amount)}
                    </p>
                    <p className={`mt-1 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {card.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className={`${subpanelClass} p-4`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  평가 비용(Appraisal) 상세
                </h3>
                <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  안정 5만 · 주의 10만 · 심각 25만 / LOT
                </p>
                <ul className="mt-4 space-y-3">
                  {(
                    [
                      {
                        id: 'stable',
                        label: '안정',
                        count: qCostSummary?.stableCount ?? 0,
                        unit: APPRAISAL_UNIT.stable,
                        amount: qCostResult?.appraisalBreakdown.stable ?? 0,
                        badge: isDark
                          ? 'bg-emerald-950/50 text-emerald-300 ring-1 ring-emerald-700/50'
                          : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
                        bar: 'bg-emerald-500',
                      },
                      {
                        id: 'warning',
                        label: '주의',
                        count: qCostSummary?.warningCount ?? 0,
                        unit: APPRAISAL_UNIT.warning,
                        amount: qCostResult?.appraisalBreakdown.warning ?? 0,
                        badge: isDark
                          ? 'bg-amber-950/50 text-amber-300 ring-1 ring-amber-700/50'
                          : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
                        bar: 'bg-amber-500',
                      },
                      {
                        id: 'critical',
                        label: '심각',
                        count: qCostSummary?.criticalCount ?? 0,
                        unit: APPRAISAL_UNIT.critical,
                        amount: qCostResult?.appraisalBreakdown.critical ?? 0,
                        badge: isDark
                          ? 'bg-red-950/50 text-red-300 ring-1 ring-red-700/50'
                          : 'bg-red-50 text-red-800 ring-1 ring-red-200',
                        bar: 'bg-red-500',
                      },
                    ] as const
                  ).map((row) => {
                    const pct = Math.round((row.amount / qCostAppraisalMax) * 100)
                    return (
                      <li key={row.id}>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.badge}`}
                            >
                              {row.label}
                            </span>
                            <span className={`text-xs tabular-nums ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {row.count.toLocaleString('ko-KR')} LOT · {formatKRW(row.unit)}/LOT
                            </span>
                          </div>
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              isDark ? 'text-slate-100' : 'text-slate-900'
                            }`}
                          >
                            {formatKRW(row.amount)}
                          </span>
                        </div>
                        <div
                          className={`h-2 overflow-hidden rounded-full ${
                            isDark ? 'bg-slate-800' : 'bg-slate-100'
                          }`}
                        >
                          <div
                            className={`h-full rounded-full transition-[width] ${row.bar}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <div
                  className={`mt-4 flex items-center justify-between border-t pt-3 text-sm ${
                    isDark ? 'border-slate-700' : 'border-slate-100'
                  }`}
                >
                  <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    평가 비용 합계
                  </span>
                  <span
                    className={`font-bold tabular-nums ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                  >
                    {formatKRW(qCostResult?.appraisalCost ?? 0)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section
            className={`${cardClass} flex h-full min-h-0 flex-col p-5 md:p-6 xl:col-span-2`}
            aria-labelledby="risk-lot-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id="risk-lot-heading"
                    className={`text-base font-semibold tracking-tight ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    위험 LOT Top
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      isDark
                        ? 'bg-slate-700/80 text-slate-300'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    전체 {riskTopTotal}건
                  </span>
                </div>
                <p className={`mt-1 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  최근 3일 · 위험등급 심각 LOT를 확인합니다.
                </p>
              </div>
              <Link href="/issue" className={detailLinkClass}>
                상세보기
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="mt-5 -mx-1 min-h-0 flex-1 overflow-x-auto overflow-y-auto px-1">
              <table className="w-full min-w-[400px] border-collapse text-left text-sm">
                <thead>
                  <tr className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>LOT</th>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>위험 원인</th>
                    <th className={`border-b pb-2.5 pl-1 text-right ${tableBorderClass}`}>상세보기</th>
                  </tr>
                </thead>
                <tbody>
                  {topRiskLots.map((lot) => (
                    <tr key={lot.id} className={`group transition-colors ${rowHoverClass}`}>
                      <td
                        className={`whitespace-nowrap border-b py-3 pr-3 text-xs font-medium ${tableBorderClass} ${
                          isDark ? 'text-slate-100' : 'text-slate-800'
                        }`}
                      >
                        {lot.id}
                      </td>
                      <td
                        className={`max-w-[160px] truncate border-b py-3 pr-3 text-xs ${tableBorderClass} ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                        title={lot.riskReason}
                      >
                        {lot.riskReason}
                      </td>
                      <td className={`border-b py-3 pl-1 text-right ${tableBorderClass}`}>
                        <button
                          type="button"
                          className={tableDetailBtnClass}
                          aria-label={`${lot.id} 이슈 상세 분석 보기`}
                          onClick={() => handleOpenLotDetail(lot)}
                        >
                          상세보기
                        </button>
                      </td>
                    </tr>
                  ))}
                  {riskLotsLoading && topRiskLots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className={`py-10 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        불러오는 중…
                      </td>
                    </tr>
                  ) : null}
                  {!riskLotsLoading && topRiskLots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className={`py-10 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        표시할 위험 LOT가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {riskTopTotalPages > 1 ? (
              <div
                className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  {riskTopTotal === 0
                    ? '0건'
                    : `${(riskTopPage - 1) * RISK_TOP_PAGE_SIZE + 1}–${Math.min(
                        riskTopPage * RISK_TOP_PAGE_SIZE,
                        riskTopTotal,
                      )} / ${riskTopTotal}건`}
                </span>
                <nav
                  aria-label="위험 LOT Top 페이지"
                  className="flex flex-wrap items-center justify-end gap-1"
                >
                  <button
                    type="button"
                    onClick={() => handleRiskTopPageChange(riskTopPage - 1)}
                    disabled={riskTopPage <= 1 || riskLotsLoading}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    이전
                  </button>
                  {riskTopPageItems.map((item, index) =>
                    item === 'ellipsis' ? (
                      <span
                        key={`risk-top-ellipsis-${index}`}
                        className={`inline-flex min-w-6 items-center justify-center px-0.5 text-[11px] ${
                          isDark ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        aria-current={item === riskTopPage ? 'page' : undefined}
                        disabled={riskLotsLoading}
                        onClick={() => handleRiskTopPageChange(item)}
                        className={`min-w-6 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                          item === riskTopPage
                            ? 'bg-blue-600 text-white'
                            : isDark
                              ? 'border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => handleRiskTopPageChange(riskTopPage + 1)}
                    disabled={riskTopPage >= riskTopTotalPages || riskLotsLoading}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    다음
                  </button>
                </nav>
              </div>
            ) : null}
          </section>
        </section>
      </div>

      <ToastStack toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <Modal open={!!selectedLot} title="이슈 상세 분석" onClose={handleCloseLotDetail} wide>
        {issueAnalysisLoading ? (
          <p className={`py-10 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            불러오는 중…
          </p>
        ) : issueAnalysisError ? (
          <p className={`py-10 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {issueAnalysisError}
          </p>
        ) : (
          <IssueDetailAnalysis
            issue={issueAnalysis}
            emptyMessage="해당 LOT의 이슈가 없습니다."
          />
        )}
      </Modal>

    </div>
  );
}
