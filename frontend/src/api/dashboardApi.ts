import { apiClient } from './axios'
import type { DashboardSummaryResponse } from '@/types'

export interface DashboardSummaryParams {
  startDate?: string
  endDate?: string
  product?: string
  line?: string
}

export const dashboardApi = {
  getSummary: (params: DashboardSummaryParams = {}) =>
    apiClient.get<DashboardSummaryResponse>('/dashboard/summary', { params }),
}
