import axios from 'axios'
import { clearAuthSession, getAuthToken } from '@/lib/authStorage'

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 60_000,
})

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
      const method = (error.config?.method ?? 'get').toLowerCase()
      const isAuthCredentialRequest =
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/find-id') ||
        url.includes('/auth/reset-password') ||
        url.includes('/auth/verify-reset')
      // 프로필·비밀번호 확인 요청의 비즈니스 오류는 UI에서 처리 (강제 로그아웃 금지)
      const isProfileMutation =
        (url.includes('/auth/profile') && method === 'put') ||
        url.includes('/auth/verify-password')

      if (!isAuthCredentialRequest && !isProfileMutation && typeof window !== 'undefined') {
        clearAuthSession()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)
