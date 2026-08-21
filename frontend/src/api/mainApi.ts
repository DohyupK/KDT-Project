import { apiClient } from './axios'

/** Matches backend LotDto from GET /api/lots/risk-top */
export type RiskTopLot = {
  lotId: string
  recordedAt: string
  d50: number | null
  d90: number | null
  metalImpurity: number | null
  lithiumInput: number | null
  additiveRatio: number | null
  processTime: number | null
  sinteringTemp: number | null
  humidity: number | null
  tankPressure: number | null
  operatorId: string | null
  qualityDefect: boolean
  defectProb: number | null
  residualLithium: number | null
  residualMargin: number | null
  spcStatus: string | null
  riskLevel: '심각' | '주의' | '안정'
  riskReason: string | null
}

export type RiskTopResponse = {
  lots: RiskTopLot[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Matches backend getDailyProbabilityKpi */
export type DailyKpiResponse = {
  threshold: number
  total: number
  goodCount: number
  defectCount: number
  goodRate: number | null
  defectRate: number | null
}

/** Matches backend getQCostSummary */
export type QCostSummaryResponse = {
  from: string
  to: string
  stableCount: number
  warningCount: number
  criticalCount: number
  internalDefectCount: number
  externalLeakCount: number
  appraisalCost: number
  appraisalBreakdown: {
    stable: number
    warning: number
    critical: number
  }
  internalCost: number
  externalCost: number
  preventionCost: number
  totalQCost: number
}

export const RISK_TOP_PAGE_SIZE = 8

export const mainApi = {
  getRiskTop(params: { page?: number; pageSize?: number } = {}) {
    return apiClient.get<RiskTopResponse>('/lots/risk-top', {
      params: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? RISK_TOP_PAGE_SIZE,
      },
    })
  },

  getDailyKpi() {
    return apiClient.get<DailyKpiResponse>('/lots/daily-kpi')
  },

  getQCost(params: { from?: string; to?: string } = {}) {
    return apiClient.get<QCostSummaryResponse>('/lots/q-cost', {
      params: {
        ...(params.from ? { from: params.from } : {}),
        ...(params.to ? { to: params.to } : {}),
      },
    })
  },

  mailQCost(body: { from?: string; to?: string; yearMonth?: string }) {
    return apiClient.post<{
      ok: boolean
      channel: 'n8n' | 'gmail'
      to: string
      from: string
      totalQCost: number
      period: { from: string; to: string }
    }>('/lots/q-cost/mail', body)
  },
}
