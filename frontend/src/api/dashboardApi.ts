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
    residualLevel?: 'low' | 'mid' | 'high'
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

  getProductionDaily(
    page = 1,
    pageSize = 7,
    filters: {
      operatorId?: string
      d50Min?: number
      d50Max?: number
      d90Min?: number
      d90Max?: number
    } = {},
  ) {
    return apiClient.get<{
      items: Array<{
        date: string
        production: number
        goodCount: number
        defectCount: number
        defectRate: number | null
        metalImpurity: number | null
        sinteringTemp: number | null
        humidity: number | null
        lithiumInput: number | null
        additiveRatio: number | null
        tankPressure: number | null
        processTime: number | null
      }>
      total: number
      page: number
      pageSize: number
      totalPages: number
      from?: string
      to?: string
      threshold?: number
      operators?: string[]
      columns: Array<{ key: string; label: string }>
    }>('/dashboard/production-daily', {
      params: {
        page,
        pageSize,
        ...(filters.operatorId ? { operatorId: filters.operatorId } : {}),
        ...(filters.d50Min != null ? { d50Min: filters.d50Min } : {}),
        ...(filters.d50Max != null ? { d50Max: filters.d50Max } : {}),
        ...(filters.d90Min != null ? { d90Min: filters.d90Min } : {}),
        ...(filters.d90Max != null ? { d90Max: filters.d90Max } : {}),
      },
    })
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
