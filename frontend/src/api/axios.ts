import axios from 'axios'
import { clearAuthSession, getAuthToken } from '@/lib/authStorage'

export const apiClient = axios.create({ baseURL: '/api' })

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? ''
      const isAuthRequest =
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/find-id') ||
        url.includes('/auth/reset-password') ||
        url.includes('/auth/verify-reset')

      if (!isAuthRequest && typeof window !== 'undefined') {
        clearAuthSession()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)
