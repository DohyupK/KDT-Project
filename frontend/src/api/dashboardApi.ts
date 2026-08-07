import { apiClient } from './axios'

/** Dashboard API client — LOT risk / production / FI / CSV */

export type DashboardLotRiskItem = {
  lotId: string
  recordedAt: string
  defectProb: number | null
  residualLithium: number | null
  residualMargin: number | null
  spcStatus: string | null
  riskLevel: '심각' | '주의' | '안정' | null
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

  getProductionTrend(params: {
    from?: string
    to?: string
    grain?: 'day' | 'week' | 'month'
  } = {}) {
    return apiClient.get<{
      grain: 'day' | 'week' | 'month'
      from: string
      to: string
      points: Array<{
        date: string
        production: number
        goodCount: number
        defectCount: number
        defectRate: number | null
      }>
    }>('/dashboard/production-trend', { params })
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

  getFeatureImportance(params: {
    topK?: number
    grain?: 'day' | 'week' | 'month'
    from?: string
    to?: string
    bucket?: string
    mode?: 'default' | 'selected'
  } = {}) {
    return apiClient.get<{
      source: string
      grain?: string
      from?: string
      to?: string
      label?: string
      mode?: string
      defectCount?: number
      items: Array<{
        feature: string
        label: string
        importance: number
        primary?: boolean
      }>
    }>('/dashboard/feature-importance', { params })
  },
}
