import { apiClient } from './axios'
import type {
  FindUserIdRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from '@/types'

export const authApi = {
  login: (payload: LoginRequest) => apiClient.post('/auth/login', payload),

  register: (payload: RegisterRequest) => apiClient.post('/auth/register', payload),

  checkDuplicateUserId: (userId: string) =>
    apiClient.get('/auth/check-id', { params: { userId } }),

  findUserId: (payload: FindUserIdRequest) => apiClient.post('/auth/find-id', payload),

  resetPassword: (payload: ResetPasswordRequest) =>
    apiClient.post('/auth/reset-password', payload),

  logout: () => apiClient.post('/auth/logout'),
}
