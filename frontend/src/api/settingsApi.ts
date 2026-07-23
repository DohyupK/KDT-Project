import { apiClient } from './axios'
import type { UserSettingsResponse } from '@/types'

export interface SaveSettingsPayload {
  fontSize: number
  themeMode: number
  language: string
  refreshInterval: number
}

export const settingsApi = {
  getSettings: () => apiClient.get<UserSettingsResponse>('/settings'),

  saveSettings: (payload: SaveSettingsPayload) =>
    apiClient.put<UserSettingsResponse & { message: string }>('/settings', payload),
}
