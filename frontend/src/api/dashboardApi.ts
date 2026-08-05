import { apiClient } from './axios'

/** Dashboard API client — LOT risk / production / FI / CSV */

export type DashboardLotRiskItem = {
  lotId: string
  recordedAt: string
  defectProb: number | null
  residualLithium: number | null
  residualMargin: number | null
  spcStatus: string | null
  riskLevel: '심각' | '주의' | '안정'
  riskReason: string | null
}

export const dashboardApi = {
  listLotRisks(params: {
    page?: number
    pageSize?: number
    search?: string
    riskLevel?: string
    spc?: string
    minProb?: number
    maxProb?: number
    marginLevel?: 'low' | 'caution' | 'sufficient'
  } = {}) {
    return apiClient.get<{
      items: DashboardLotRiskItem[]
      total: number
      page: number
      pageSize: number
      totalPages: number
      residualUsl: number
    }>('/dashboard/lot-risks', { params })
  },

  getLotRiskDetail(lotId: string) {
    return apiClient.get<{ item: Record<string, unknown> }>(
      `/dashboard/lot-risks/${encodeURIComponent(lotId)}`,
    )
  },

  getProductionTrend() {
    return apiClient.get<{
      actualPoints: Array<{
        date: string
        production: number
        goodCount: number
        defectCount: number
        defectRate: number | null
        aiDefectRate: number | null
      }>
      forecastPoints: Array<{
        date: string
        defectRate: number
      }>
    }>('/dashboard/production-trend')
  },

  getProductionDaily(page = 1, pageSize = 5) {
    return apiClient.get<{
      items: Array<Record<string, unknown>>
      total: number
      page: number
      pageSize: number
      totalPages: number
      columns: Array<{ key: string; label: string }>
    }>('/dashboard/production-daily', { params: { page, pageSize } })
  },

  /** Relative path for CSV download (use with window.open or <a href>). */
  lotsCsvPath(date: string) {
    return `/api/dashboard/lots.csv?date=${encodeURIComponent(date)}`
  },

  getFeatureImportance(topK = 4) {
    return apiClient.get<{
      source: string
      items: Array<{ feature: string; label: string; importance: number }>
    }>('/dashboard/feature-importance', { params: { topK } })
  },
}
