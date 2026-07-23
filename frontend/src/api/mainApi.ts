import { apiClient } from './axios'
import type { MainOverviewResponse } from '@/types'

export const mainApi = {
  getOverview: () => apiClient.get<MainOverviewResponse>('/main/overview'),
}
