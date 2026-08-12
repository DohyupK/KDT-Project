'use client'

import { useEffect, useMemo, useState } from 'react'
import { mainApi } from '@/api/mainApi'
import {
  APPRAISAL_UNIT,
  calculateQCost,
  formatKRW,
  normalizeCount,
  type QCostInput,
} from '@/lib/qCost'

const EMPTY_INPUT: QCostInput = {
  stableCount: 0,
  warningCount: 0,
  criticalCount: 0,
  internalDefectCount: 0,
  externalLeakCount: 0,
}

type Props = {
  isDark?: boolean
  className?: string
}

function parseCountInput(raw: string): number {
  if (raw.trim() === '') return 0
  return normalizeCount(Number(raw))
}

export default function QCostDashboard({ isDark = false, className = '' }: Props) {
  const [input, setInput] = useState<QCostInput>(EMPTY_INPUT)
  const [periodLabel, setPeriodLabel] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const { data } = await mainApi.getQCost()
        if (cancelled) return
        setInput({
          stableCount: data.stableCount,
          warningCount: data.warningCount,
          criticalCount: data.criticalCount,
          internalDefectCount: data.internalDefectCount,
          externalLeakCount: data.externalLeakCount,
        })
        setPeriodLabel(`${data.from} ~ ${data.to}`)
      } catch {
        if (cancelled) return
        setLoadError('Q-Cost 데이터를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const result = useMemo(() => calculateQCost(input), [input])

  const appraisalMax = Math.max(
    result.appraisalBreakdown.stable,
    result.appraisalBreakdown.warning,
    result.appraisalBreakdown.critical,
    1,
  )

  const cardClass = isDark
    ? 'rounded-xl border border-slate-700 bg-slate-900/60 shadow-sm'
    : 'rounded-xl border border-slate-200 bg-white shadow-sm'

  const muted = isDark ? 'text-slate-400' : 'text-slate-500'
  const title = isDark ? 'text-slate-100' : 'text-slate-900'
  const inputClass = isDark
    ? 'h-9 w-full rounded-lg border border-slate-600 bg-slate-800 px-2.5 text-sm tabular-nums text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
    : 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm tabular-nums text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

  const setField = (key: keyof QCostInput, raw: string) => {
    setInput((prev) => ({ ...prev, [key]: parseCountInput(raw) }))
  }

  const summaryCards = [
    {
      id: 'appraisal',
      label: '평가 비용',
      amount: result.appraisalCost,
      description: '등급별 LOT 검사·평가',
      tone: isDark ? 'border-amber-700/50 bg-amber-950/30' : 'border-amber-200 bg-amber-50/60',
      valueTone: isDark ? 'text-amber-300' : 'text-amber-800',
    },
    {
      id: 'internal',
      label: '내부 실패 비용',
      amount: result.internalCost,
      description: '불량 1건당 500,000원',
      tone: isDark ? 'border-red-800/50 bg-red-950/30' : 'border-red-200 bg-red-50/60',
      valueTone: isDark ? 'text-red-300' : 'text-red-700',
    },
    {
      id: 'external',
      label: '외부 실패 비용',
      amount: result.externalCost,
      description: '유출 1건당 3,000,000원',
      tone: isDark ? 'border-red-700/60 bg-red-950/40' : 'border-red-300 bg-red-50',
      valueTone: isDark ? 'text-red-200' : 'text-red-800',
    },
    {
      id: 'prevention',
      label: '예방 비용',
      amount: result.preventionCost,
      description: '월 고정 20,000,000원',
      tone: isDark ? 'border-blue-800/50 bg-blue-950/30' : 'border-blue-200 bg-blue-50/60',
      valueTone: isDark ? 'text-blue-300' : 'text-blue-700',
    },
  ] as const

  const tierRows = [
    {
      id: 'stable',
      label: '안정',
      count: input.stableCount,
      unit: APPRAISAL_UNIT.stable,
      amount: result.appraisalBreakdown.stable,
      bar: isDark ? 'bg-emerald-500' : 'bg-emerald-500',
      badge: isDark
        ? 'bg-emerald-950/50 text-emerald-300 ring-1 ring-emerald-700/50'
        : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
    },
    {
      id: 'warning',
      label: '주의',
      count: input.warningCount,
      unit: APPRAISAL_UNIT.warning,
      amount: result.appraisalBreakdown.warning,
      bar: isDark ? 'bg-amber-500' : 'bg-amber-500',
      badge: isDark
        ? 'bg-amber-950/50 text-amber-300 ring-1 ring-amber-700/50'
        : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
    },
    {
      id: 'critical',
      label: '심각',
      count: input.criticalCount,
      unit: APPRAISAL_UNIT.critical,
      amount: result.appraisalBreakdown.critical,
      bar: isDark ? 'bg-red-500' : 'bg-red-500',
      badge: isDark
        ? 'bg-red-950/50 text-red-300 ring-1 ring-red-700/50'
        : 'bg-red-50 text-red-800 ring-1 ring-red-200',
    },
  ] as const

  const mockFields: Array<{ key: keyof QCostInput; label: string }> = [
    { key: 'stableCount', label: '안정 LOT 수' },
    { key: 'warningCount', label: '주의 LOT 수' },
    { key: 'criticalCount', label: '심각 LOT 수' },
    { key: 'internalDefectCount', label: '내부 불량 건수' },
    { key: 'externalLeakCount', label: '외부 유출 건수' },
  ]

  return (
    <div className={`flex min-h-0 flex-col gap-4 ${className}`}>
      {/* Total Q-Cost */}
      <div
        className={`rounded-xl border p-5 shadow-sm ${
          isDark
            ? 'border-slate-600 bg-gradient-to-br from-slate-800 to-slate-900'
            : 'border-slate-200 bg-gradient-to-br from-white to-slate-50'
        }`}
      >
        <p className={`text-sm font-medium ${muted}`}>총 Q-Cost 발생 금액</p>
        <p
          className={`mt-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl ${title}`}
        >
          {loading ? '…' : formatKRW(result.totalQCost)}
        </p>
        <p className={`mt-2 text-xs ${muted}`}>
          평가 + 내부실패 + 외부실패 + 예방(월 고정)
          {periodLabel ? ` · ${periodLabel}` : ''}
        </p>
        {loadError ? (
          <p className={`mt-2 text-xs font-medium ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
            {loadError}
          </p>
        ) : null}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {summaryCards.map((card) => (
          <div key={card.id} className={`rounded-xl border p-4 shadow-sm ${card.tone}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
              {card.label}
            </p>
            <p className={`mt-2 text-xl font-bold tabular-nums ${card.valueTone}`}>
              {loading ? '…' : formatKRW(card.amount)}
            </p>
            <p className={`mt-1 text-[11px] ${muted}`}>{card.description}</p>
          </div>
        ))}
      </div>

      {/* Appraisal breakdown */}
      <div className={`${cardClass} p-4`}>
        <h3 className={`text-sm font-semibold ${title}`}>평가 비용(Appraisal) 상세</h3>
        <p className={`mt-1 text-xs ${muted}`}>
          안정 5만 · 주의 10만 · 심각 15만 / LOT
        </p>
        <ul className="mt-4 space-y-3">
          {tierRows.map((row) => {
            const pct = Math.round((row.amount / appraisalMax) * 100)
            return (
              <li key={row.id}>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.badge}`}
                    >
                      {row.label}
                    </span>
                    <span className={`text-xs tabular-nums ${muted}`}>
                      {row.count.toLocaleString('ko-KR')} LOT ·{' '}
                      {formatKRW(row.unit)}/LOT
                    </span>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${title}`}>
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
          <span className={`font-medium ${muted}`}>평가 비용 합계</span>
          <span className={`font-bold tabular-nums ${title}`}>
            {formatKRW(result.appraisalCost)}
          </span>
        </div>
      </div>

      {/* What-if overrides (seeded from API) */}
      <div className={`${cardClass} p-4`}>
        <h3 className={`text-sm font-semibold ${title}`}>입력 조정 (What-if)</h3>
        <p className={`mt-1 text-xs ${muted}`}>
          DB 집계값으로 채운 뒤, 숫자를 바꾸면 즉시 재계산됩니다.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mockFields.map((field) => (
            <label key={field.key} className="block min-w-0">
              <span className={`mb-1 block text-xs font-medium ${muted}`}>
                {field.label}
              </span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={loading}
                value={input[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                onBlur={(e) => setField(field.key, e.target.value)}
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
