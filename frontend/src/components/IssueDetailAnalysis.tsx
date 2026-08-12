'use client'

import type { CSSProperties } from 'react'
import {
  normalizeIssueRiskLevel,
  type IssueAnalysis,
  type IssueDetail,
  type IssueRiskLevel,
} from '@/api/issueApi'
import { useUiSettings } from '@/components/layout/AppShell'

type SpcFilterStatus = '이상' | '주의' | '안정'

const colors = {
  background: '#f1f5f9',
  panel: '#ffffff',
  navy: '#0f172a',
  slate: '#475569',
  muted: '#94a3b8',
  line: '#e2e8f0',
  blue: '#2563eb',
  blueSoft: '#eff6ff',
  cyan: '#06b6d4',
  green: '#16a34a',
  greenSoft: '#f0fdf4',
  red: '#dc2626',
  redSoft: '#fef2f2',
  amber: '#d97706',
  amberSoft: '#fffbeb',
}

type UiColors = typeof colors

const darkColors: UiColors = {
  background: '#0f172a',
  panel: '#1e293b',
  navy: '#f1f5f9',
  slate: '#94a3b8',
  muted: '#94a3b8',
  line: '#334155',
  blue: '#60a5fa',
  blueSoft: 'rgba(23, 37, 84, 0.4)',
  cyan: '#22d3ee',
  green: '#34d399',
  greenSoft: 'rgba(6, 78, 59, 0.4)',
  red: '#fb7185',
  redSoft: 'rgba(76, 5, 25, 0.4)',
  amber: '#fbbf24',
  amberSoft: 'rgba(69, 26, 3, 0.4)',
}

const getUiColors = (isDark: boolean): UiColors => (isDark ? darkColors : colors)

const getPanelStyle = (c: UiColors): CSSProperties => ({
  background: c.panel,
  border: `1px solid ${c.line}`,
  borderRadius: 18,
  boxShadow:
    c.panel === darkColors.panel
      ? '0 8px 24px rgba(0, 0, 0, 0.35)'
      : '0 8px 24px rgba(15, 23, 42, 0.06)',
  padding: 24,
})

const badgeBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

function riskStyle(risk: IssueRiskLevel, isDark = false): CSSProperties {
  if (risk === '심각') {
    return isDark
      ? {
          background: 'rgba(76, 5, 25, 0.4)',
          color: '#fda4af',
          border: '1px solid #9f1239',
          fontWeight: 700,
        }
      : {
          background: '#fff1f2',
          color: '#be123c',
          border: '1px solid #fecdd3',
          fontWeight: 700,
        }
  }
  if (risk === '주의') {
    return isDark
      ? {
          background: 'rgba(69, 26, 3, 0.4)',
          color: '#fcd34d',
          border: '1px solid #b45309',
          fontWeight: 700,
        }
      : {
          background: '#fffbeb',
          color: '#b45309',
          border: '1px solid #fde68a',
          fontWeight: 700,
        }
  }
  return isDark
    ? {
        background: 'rgba(6, 78, 59, 0.4)',
        color: '#6ee7b7',
        border: '1px solid #047857',
        fontWeight: 700,
      }
    : {
        background: '#ecfdf5',
        color: '#047857',
        border: '1px solid #a7f3d0',
        fontWeight: 700,
      }
}

function spcStatusBadgeClass(status: SpcFilterStatus, isDark = false) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold'
  if (status === '이상') {
    return isDark
      ? `${base} bg-rose-950/50 text-rose-300`
      : `${base} bg-rose-100 text-rose-700`
  }
  if (status === '주의') {
    return isDark
      ? `${base} bg-amber-950/50 text-amber-300`
      : `${base} bg-amber-100 text-amber-700`
  }
  return isDark
    ? `${base} bg-emerald-950/50 text-emerald-300`
    : `${base} bg-emerald-100 text-emerald-700`
}

function mapAnalysisSpcToFilter(spcStatus: string | null | undefined): SpcFilterStatus {
  const raw = (spcStatus || '').trim()
  if (!raw) return '안정'
  if (raw.includes('이탈') || raw.includes('이상')) return '이상'
  if (raw.includes('주의')) return '주의'
  return '안정'
}

function formatAnalysisProbability(probability: number | null | undefined): {
  pct: number
  label: string
} {
  if (probability == null || Number.isNaN(Number(probability))) {
    return { pct: 0, label: '—' }
  }
  const n = Number(probability)
  const pct = n <= 1 ? n * 100 : n
  const clamped = Math.max(0, Math.min(100, pct))
  return { pct: clamped, label: `${pct.toFixed(1)}%` }
}

export type IssueDetailAnalysisModel = {
  issueId: string
  lotId: string
  createdAt: string
  issueContent: string
  riskLevel: IssueRiskLevel
  listSpcStatus: string | null
  analysis: IssueAnalysis | null
}

export function issueDetailToAnalysisModel(detail: IssueDetail): IssueDetailAnalysisModel {
  return {
    issueId: detail.issueId,
    lotId: detail.lotId,
    createdAt: detail.createdAt,
    issueContent: detail.issueContent,
    riskLevel: normalizeIssueRiskLevel(detail.analysis?.riskLevel ?? detail.riskLevel),
    listSpcStatus: detail.analysis?.spcStatus ?? detail.spcStatus ?? null,
    analysis: detail.analysis
      ? {
          ...detail.analysis,
          riskLevel: normalizeIssueRiskLevel(detail.analysis.riskLevel),
        }
      : null,
  }
}

export function IssueDetailAnalysis({
  issue,
  emptyMessage = '목록에서 이슈를 선택하면 상세 분석 데이터가 표시됩니다.',
}: {
  issue: IssueDetailAnalysisModel | null
  emptyMessage?: string
}) {
  const { isDark } = useUiSettings()
  const c = getUiColors(isDark)

  if (!issue) {
    return (
      <section
        id="issue-detail-analysis"
        style={{
          ...getPanelStyle(c),
          height: '100%',
          minHeight: 220,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div style={{ textAlign: 'center', color: c.slate }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>⌁</div>
          <strong>{emptyMessage}</strong>
        </div>
      </section>
    )
  }

  const analysis = issue.analysis
  const spcFilter = mapAnalysisSpcToFilter(analysis?.spcStatus ?? issue.listSpcStatus)
  const risk = analysis?.riskLevel ?? issue.riskLevel
  const { pct: probPct, label: probLabel } = formatAnalysisProbability(analysis?.probability ?? null)
  const defectTone =
    !analysis || analysis.probability == null
      ? '미정'
      : probPct >= 80
        ? '위험'
        : probPct >= 40
          ? '주의'
          : '양호'
  const reason = analysis?.riskReason?.trim() || ''

  const fieldRows: Array<{ key: string; label: string; value: string }> = [
    { key: 'lot_id', label: 'lot_id', value: analysis?.lotId || issue.lotId || '—' },
    { key: 'risk_level', label: 'risk_level', value: risk },
    {
      key: 'spc_status',
      label: 'spc_status',
      value: analysis?.spcStatus?.trim() || issue.listSpcStatus?.trim() || '—',
    },
    {
      key: 'probability',
      label: 'probability',
      value: analysis?.probability == null ? '—' : `${analysis.probability} (${probLabel})`,
    },
    {
      key: 'risk_reason',
      label: 'risk_reason',
      value: reason || '—',
    },
    {
      key: 'created_at',
      label: 'created_at',
      value: analysis?.createdAt || '—',
    },
  ]

  const cardClass = isDark
    ? 'rounded-xl border border-slate-700 bg-slate-900/40 p-4'
    : 'rounded-xl border border-slate-200 bg-white p-4'
  const muted = isDark ? 'text-slate-400' : 'text-slate-500'
  const strong = isDark ? 'text-slate-100' : 'text-slate-900'

  return (
    <section id="issue-detail-analysis" style={{ ...getPanelStyle(c), height: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: c.navy, fontSize: 19 }}>이슈 상세 분석</h2>
          <div style={{ marginTop: 6, color: c.slate, fontSize: 13 }}>
            {issue.issueId} · {issue.lotId} · {issue.createdAt}
          </div>
          <div style={{ marginTop: 8, color: c.navy, fontSize: 14, fontWeight: 600 }}>
            {issue.issueContent}
          </div>
          <div style={{ marginTop: 6, color: c.slate, fontSize: 11 }}>
            소스: analysis_lots (시각화 초안 · 상세 목적은 후속 정의)
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...badgeBase, ...riskStyle(risk, isDark) }}>위험도 {risk}</span>
          <span className={spcStatusBadgeClass(spcFilter, isDark)}>
            SPC {analysis?.spcStatus?.trim() || spcFilter}
          </span>
        </div>
      </div>

      {!analysis ? (
        <div
          className={`rounded-xl border px-4 py-10 text-center text-sm ${
            isDark
              ? 'border-slate-700 bg-slate-900/40 text-slate-400'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
        >
          <p className="m-0 font-medium">analysis_lots 행이 없거나 아직 불러오는 중입니다.</p>
          <p className="mt-2 mb-0 text-xs">이슈를 다시 선택하거나 LOT 채점 데이터를 확인하세요.</p>
        </div>
      ) : (
        <>
          <div
            style={{
              border: isDark ? '1px solid #b45309' : '1px solid #fed7aa',
              borderLeft: `4px solid ${c.amber}`,
              borderRadius: 12,
              background: c.amberSoft,
              padding: 15,
              color: isDark ? '#fcd34d' : '#92400e',
              fontSize: 14,
              lineHeight: 1.65,
              marginBottom: 16,
            }}
          >
            <strong>risk_reason</strong>
            <div style={{ marginTop: 4 }}>
              {reason || '위험 원인 문구가 비어 있습니다.'}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={cardClass}>
              <div className={`text-xs font-semibold ${muted}`}>probability</div>
              <div
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  defectTone === '위험'
                    ? 'text-rose-600'
                    : defectTone === '주의'
                      ? 'text-amber-600'
                      : defectTone === '양호'
                        ? 'text-emerald-600'
                        : strong
                }`}
              >
                {probLabel}
              </div>
              <div
                className={`mt-2 h-2 overflow-hidden rounded-full ${
                  isDark ? 'bg-slate-800' : 'bg-slate-100'
                }`}
              >
                <div
                  className={`h-full rounded-full transition-[width] ${
                    defectTone === '위험'
                      ? 'bg-rose-500'
                      : defectTone === '주의'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${probPct}%` }}
                />
              </div>
              <p className={`mt-1 text-xs ${muted}`}>불량 확률(0~1 → %)</p>
            </div>

            <div className={cardClass}>
              <div className={`text-xs font-semibold ${muted}`}>risk_level</div>
              <div className="mt-2">
                <span style={{ ...badgeBase, ...riskStyle(risk, isDark), fontSize: 14 }}>
                  {risk}
                </span>
              </div>
              <p className={`mt-3 text-xs ${muted}`}>analysis_lots.risk_level</p>
            </div>

            <div className={cardClass}>
              <div className={`text-xs font-semibold ${muted}`}>spc_status</div>
              <div className="mt-2">
                <span className={spcStatusBadgeClass(spcFilter, isDark)}>
                  {analysis.spcStatus?.trim() || '—'}
                </span>
              </div>
              <p className={`mt-3 text-xs ${muted}`}>analysis_lots.spc_status</p>
            </div>
          </div>

          <div
            className={`overflow-hidden rounded-xl border ${
              isDark ? 'border-slate-700' : 'border-slate-200'
            }`}
          >
            <div
              className={`border-b px-4 py-2.5 text-sm font-semibold ${
                isDark
                  ? 'border-slate-700 bg-slate-900/70 text-slate-200'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              analysis_lots 필드
            </div>
            <dl className="m-0">
              {fieldRows.map((row, index) => (
                <div
                  key={row.key}
                  className={`grid grid-cols-[140px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm ${
                    index > 0
                      ? isDark
                        ? 'border-t border-slate-700'
                        : 'border-t border-slate-200'
                      : ''
                  }`}
                >
                  <dt className={`font-mono text-xs font-semibold ${muted}`}>{row.label}</dt>
                  <dd className={`m-0 break-words ${strong}`}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </section>
  )
}
