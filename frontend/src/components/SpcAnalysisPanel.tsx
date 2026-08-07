'use client'

import { useUiSettings } from '@/components/layout/AppShell'

export type SpcMetricKey =
  | 'd50'
  | 'd90'
  | 'metal_impurity'
  | 'lithium_input'
  | 'additive_ratio'
  | 'process_time'
  | 'sintering_temp'
  | 'humidity'
  | 'tank_pressure'

export type SpcStatus = '이상' | '주의' | '안정'

export type SpcDataPoint = {
  timestamp: string
  value: number
}

export type SpcMetric = {
  key: SpcMetricKey
  label: string
  unit: string
  status: SpcStatus
  currentValue: number
  centerLine: number
  upperControlLimit: number
  lowerControlLimit: number
  data: SpcDataPoint[]
}

const SPC_METRIC_KEYS: SpcMetricKey[] = [
  'd50',
  'd90',
  'metal_impurity',
  'lithium_input',
  'additive_ratio',
  'process_time',
  'sintering_temp',
  'humidity',
  'tank_pressure',
]

const SPC_METRIC_META: Record<
  SpcMetricKey,
  { label: string; unit: string; centerLine: number; upperControlLimit: number; lowerControlLimit: number }
> = {
  d50: { label: 'D50', unit: 'μm', centerLine: 12.0, upperControlLimit: 13.5, lowerControlLimit: 10.5 },
  d90: { label: 'D90', unit: 'μm', centerLine: 28.0, upperControlLimit: 32.0, lowerControlLimit: 24.0 },
  metal_impurity: {
    label: '금속 불순물',
    unit: '%',
    centerLine: 0.015,
    upperControlLimit: 0.025,
    lowerControlLimit: 0.005,
  },
  lithium_input: {
    label: '리튬 투입량',
    unit: 'eq',
    centerLine: 1.05,
    upperControlLimit: 1.12,
    lowerControlLimit: 0.98,
  },
  additive_ratio: {
    label: '첨가제 비율',
    unit: '%',
    centerLine: 2.5,
    upperControlLimit: 3.0,
    lowerControlLimit: 2.0,
  },
  process_time: {
    label: '공정 시간',
    unit: 'min',
    centerLine: 120,
    upperControlLimit: 135,
    lowerControlLimit: 105,
  },
  sintering_temp: {
    label: '소결 온도',
    unit: '°C',
    centerLine: 742,
    upperControlLimit: 750,
    lowerControlLimit: 730,
  },
  humidity: { label: '습도', unit: '%', centerLine: 45, upperControlLimit: 55, lowerControlLimit: 35 },
  tank_pressure: {
    label: '탱크 압력',
    unit: 'bar',
    centerLine: 2.0,
    upperControlLimit: 2.4,
    lowerControlLimit: 1.6,
  },
}

const SPC_TIMESTAMPS = ['0h', '2h', '4h', '6h', '8h', '10h'] as const

export function getOverallSpcStatus(metrics: SpcMetric[]): SpcStatus {
  if (metrics.some((metric) => metric.status === '이상')) return '이상'
  if (metrics.some((metric) => metric.status === '주의')) return '주의'
  return '안정'
}

export function countSpcByStatus(metrics: SpcMetric[]) {
  return {
    이상: metrics.filter((m) => m.status === '이상').length,
    주의: metrics.filter((m) => m.status === '주의').length,
    안정: metrics.filter((m) => m.status === '안정').length,
  }
}

export function formatSpcValue(key: SpcMetricKey, value: number) {
  if (key === 'metal_impurity' || key === 'lithium_input') return value.toFixed(3)
  if (key === 'd50' || key === 'd90' || key === 'additive_ratio' || key === 'tank_pressure') {
    return value.toFixed(1)
  }
  return String(Math.round(value * 10) / 10)
}

export function spcStatusBadgeClass(status: SpcStatus, isDark = false) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold'
  if (status === '이상') {
    return isDark ? `${base} bg-rose-950/50 text-rose-300` : `${base} bg-rose-100 text-rose-700`
  }
  if (status === '주의') {
    return isDark ? `${base} bg-amber-950/50 text-amber-300` : `${base} bg-amber-100 text-amber-700`
  }
  return isDark
    ? `${base} bg-emerald-950/50 text-emerald-300`
    : `${base} bg-emerald-100 text-emerald-700`
}

/** Mock SPC 9항목 생성 (고정값) */
export function buildSpcMetrics(
  statusOverrides: Partial<Record<SpcMetricKey, SpcStatus>> = {},
  valuesOverrides: Partial<Record<SpcMetricKey, number[]>> = {},
): SpcMetric[] {
  return SPC_METRIC_KEYS.map((key) => {
    const meta = SPC_METRIC_META[key]
    const status = statusOverrides[key] ?? '안정'
    const defaultStable = SPC_TIMESTAMPS.map((_, i) => {
      const wobble = ((i % 3) - 1) * (meta.upperControlLimit - meta.centerLine) * 0.08
      return Math.round((meta.centerLine + wobble) * 1000) / 1000
    })
    const values = valuesOverrides[key] ?? defaultStable
    const data: SpcDataPoint[] = SPC_TIMESTAMPS.map((timestamp, index) => ({
      timestamp,
      value: values[index] ?? meta.centerLine,
    }))
    return {
      key,
      label: meta.label,
      unit: meta.unit,
      status,
      currentValue: data[data.length - 1]?.value ?? meta.centerLine,
      centerLine: meta.centerLine,
      upperControlLimit: meta.upperControlLimit,
      lowerControlLimit: meta.lowerControlLimit,
      data,
    }
  })
}

function SpcControlChart({ metric }: { metric: SpcMetric }) {
  const { isDark } = useUiSettings()
  const width = 560
  const height = 240
  const pad = { top: 28, right: 16, bottom: 36, left: 48 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const values = metric.data.map((d) => d.value)
  const minVal =
    Math.min(metric.lowerControlLimit, ...values) -
    (metric.upperControlLimit - metric.lowerControlLimit) * 0.1
  const maxVal =
    Math.max(metric.upperControlLimit, ...values) +
    (metric.upperControlLimit - metric.lowerControlLimit) * 0.1
  const range = Math.max(maxVal - minVal, 0.0001)
  const toX = (index: number) => pad.left + (index * innerW) / Math.max(metric.data.length - 1, 1)
  const toY = (value: number) => pad.top + innerH - ((value - minVal) / range) * innerH
  const linePoints = metric.data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ')
  const gridStroke = isDark ? '#334155' : '#eef2f7'
  const tickFill = '#94a3b8'

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-h-[260px] min-h-[220px]"
      role="img"
      aria-label={`${metric.label} SPC 관리도`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const value = minVal + range * (1 - ratio)
        const y = pad.top + innerH * ratio
        return (
          <g key={ratio}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={gridStroke} />
            <text x={pad.left - 8} y={y + 3} textAnchor="end" fill={tickFill} fontSize="10">
              {formatSpcValue(metric.key, value)}
            </text>
          </g>
        )
      })}
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={toY(metric.upperControlLimit)}
        y2={toY(metric.upperControlLimit)}
        stroke="#ef4444"
        strokeDasharray="5 4"
        strokeWidth="1.5"
      />
      <text
        x={width - pad.right}
        y={toY(metric.upperControlLimit) - 4}
        textAnchor="end"
        fill="#ef4444"
        fontSize="10"
      >
        UCL
      </text>
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={toY(metric.centerLine)}
        y2={toY(metric.centerLine)}
        stroke="#94a3b8"
        strokeDasharray="4 4"
        strokeWidth="1.5"
      />
      <text
        x={width - pad.right}
        y={toY(metric.centerLine) - 4}
        textAnchor="end"
        fill="#64748b"
        fontSize="10"
      >
        CL
      </text>
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={toY(metric.lowerControlLimit)}
        y2={toY(metric.lowerControlLimit)}
        stroke="#f59e0b"
        strokeDasharray="5 4"
        strokeWidth="1.5"
      />
      <text
        x={width - pad.right}
        y={toY(metric.lowerControlLimit) - 4}
        textAnchor="end"
        fill="#d97706"
        fontSize="10"
      >
        LCL
      </text>
      <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={linePoints} />
      {metric.data.map((point, index) => {
        const outOfControl =
          point.value > metric.upperControlLimit || point.value < metric.lowerControlLimit
        return (
          <g key={`${metric.key}-${point.timestamp}`}>
            <circle
              cx={toX(index)}
              cy={toY(point.value)}
              r={outOfControl ? 4 : 3}
              fill={outOfControl ? '#ef4444' : '#3b82f6'}
            >
              <title>
                {`${point.timestamp}: ${formatSpcValue(metric.key, point.value)}${metric.unit}`}
              </title>
            </circle>
            <text x={toX(index)} y={height - 12} textAnchor="middle" fill={tickFill} fontSize="10">
              {point.timestamp}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function SpcChartCard({ metric, isDark }: { metric: SpcMetric; isDark: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h4 className={`m-0 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
          {metric.label}
        </h4>
        <span className={spcStatusBadgeClass(metric.status, isDark)}>{metric.status}</span>
      </div>
      <p className={`m-0 mb-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        현재 {formatSpcValue(metric.key, metric.currentValue)}
        {metric.unit} · UCL {formatSpcValue(metric.key, metric.upperControlLimit)}
        {metric.unit} · CL {formatSpcValue(metric.key, metric.centerLine)}
        {metric.unit} · LCL {formatSpcValue(metric.key, metric.lowerControlLimit)}
        {metric.unit}
      </p>
      <SpcControlChart metric={metric} />
      <p className={`mt-1 text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        관리 한계 초과 포인트는 빨간색으로 표시됩니다.
      </p>
    </div>
  )
}

export type SpcAnalysisPanelProps = {
  anomaly: string
  spcMetrics: SpcMetric[]
  residualLiMargin: number
  defectProbability: number
  isDark?: boolean
}

/** 이슈 상세 분석과 동일한 SPC·KPI 본문 */
export default function SpcAnalysisPanel({
  anomaly,
  spcMetrics,
  residualLiMargin,
  defectProbability,
  isDark: isDarkProp,
}: SpcAnalysisPanelProps) {
  const { isDark: isDarkSetting } = useUiSettings()
  const isDark = isDarkProp ?? isDarkSetting
  const spcCounts = countSpcByStatus(spcMetrics)
  const abnormalSpcMetrics = spcMetrics.filter((metric) => metric.status === '이상')
  // Mock KPI 색상 임계값 (업무 규칙 아님)
  const residualTone =
    residualLiMargin < 0.12 ? '위험' : residualLiMargin < 0.2 ? '주의' : '양호'
  const defectTone =
    defectProbability >= 60 ? '위험' : defectProbability >= 35 ? '주의' : '양호'

  return (
    <div className="space-y-4">
      {anomaly ? (
        <div
          className={`rounded-xl border-l-4 px-4 py-3 text-sm leading-relaxed ${
            isDark
              ? 'border-amber-500 bg-amber-950/30 text-amber-200'
              : 'border-amber-400 bg-amber-50 text-amber-900'
          }`}
        >
          <strong>이상 징후 요약</strong>
          <div className="mt-1">{anomaly}</div>
        </div>
      ) : null}

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          isDark
            ? 'border-slate-700 bg-slate-900/50 text-slate-300'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
      >
        <strong className={isDark ? 'text-slate-100' : 'text-slate-800'}>SPC 상태 요약</strong>
        <div className="mt-1">
          이상 {spcCounts.이상} · 주의 {spcCounts.주의} · 안정 {spcCounts.안정}
          <span className={`ml-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            (합계 {spcCounts.이상 + spcCounts.주의 + spcCounts.안정}개)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl border p-4 ${
            isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white'
          }`}
        >
          <div className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            잔류 Li 여유
          </div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${
              residualTone === '위험'
                ? 'text-rose-600'
                : residualTone === '주의'
                  ? 'text-amber-600'
                  : 'text-emerald-600'
            }`}
          >
            {residualLiMargin.toFixed(2)}%
          </div>
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            기준 하한까지 남은 여유
          </p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white'
          }`}
        >
          <div className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            불량 확률
          </div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${
              defectTone === '위험'
                ? 'text-rose-600'
                : defectTone === '주의'
                  ? 'text-amber-600'
                  : 'text-emerald-600'
            }`}
          >
            {defectProbability.toFixed(1)}%
          </div>
          <div
            className={`mt-2 h-1.5 overflow-hidden rounded-full ${
              isDark ? 'bg-slate-800' : 'bg-slate-100'
            }`}
          >
            <div
              className={`h-full rounded-full ${
                defectTone === '위험'
                  ? 'bg-rose-500'
                  : defectTone === '주의'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, defectProbability))}%` }}
            />
          </div>
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {defectTone === '위험'
              ? '높은 불량 가능성'
              : defectTone === '주의'
                ? '중간 수준의 불량 가능성'
                : '낮은 불량 가능성'}
          </p>
        </div>
      </div>
      <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        현재 값은 화면 검증을 위한 Mock 데이터입니다.
      </p>

      <div>
        <div className="mb-3">
          <h3 className={`m-0 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            SPC 이상 항목 분석
          </h3>
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            9개 항목 중 {abnormalSpcMetrics.length}개 이상 감지
          </p>
        </div>
        {abnormalSpcMetrics.length === 0 ? (
          <div
            className={`rounded-xl border px-4 py-8 text-center text-sm ${
              isDark
                ? 'border-slate-700 bg-slate-900/40 text-slate-400'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            <p className="m-0 font-medium">이 이슈에서 관리 한계를 벗어난 SPC 항목이 없습니다.</p>
            {spcCounts.주의 > 0 ? (
              <p className="mt-2 mb-0 text-xs">
                주의 항목은 존재하지만, 현재 화면은 이상 항목만 표시합니다.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {abnormalSpcMetrics.map((metric) => (
              <SpcChartCard key={metric.key} metric={metric} isDark={isDark} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
