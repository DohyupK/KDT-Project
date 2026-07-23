import { apiClient } from './axios'
import type {
  FindUserIdRequest,
  FindUserIdResponse,
  LoginRequest,
  LoginResponse,
  MessageResponse,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyResetRequest,
  UpdateProfileRequest,
  AuthUser,
  CheckIdResponse,
} from '@/types'

export const authApi = {
  login: (payload: LoginRequest) => apiClient.post<LoginResponse>('/auth/login', payload),

  register: (payload: RegisterRequest) => apiClient.post<MessageResponse>('/auth/register', payload),

  checkDuplicateUserId: (userId: string) =>
    apiClient.get<CheckIdResponse>('/auth/check-id', { params: { userId } }),

  findUserId: (payload: FindUserIdRequest) =>
    apiClient.post<FindUserIdResponse>('/auth/find-id', payload),

  verifyResetIdentity: (payload: VerifyResetRequest) =>
    apiClient.post<{ verified: boolean; message: string }>('/auth/verify-reset', payload),

  resetPassword: (payload: ResetPasswordRequest) =>
    apiClient.post<MessageResponse>('/auth/reset-password', payload),

  logout: () => apiClient.post<MessageResponse>('/auth/logout'),

  getProfile: () => apiClient.get<{ user: AuthUser }>('/auth/profile'),

  updateProfile: (payload: UpdateProfileRequest) =>
    apiClient.put<{ user: AuthUser; message: string }>('/auth/profile', payload),

  withdrawAccount: (password: string) =>
    apiClient.delete<MessageResponse>('/auth/account', { data: { password } }),
}
