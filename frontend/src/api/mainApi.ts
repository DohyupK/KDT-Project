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
}
