export interface AppData {
  fillThreshold: number
}

export interface LoginRequest {
  userId: string
  password: string
}

export interface RegisterRequest {
  name: string
  phone: string
  email: string
  userId: string
  password: string
}

export interface FindUserIdRequest {
  name: string
  phone: string
}

export interface VerifyResetRequest {
  name: string
  phone: string
  userId: string
}

export interface ResetPasswordRequest extends VerifyResetRequest {
  newPassword: string
}

export interface AuthUser {
  userId: string
  name: string
  phone: string
  email: string
}

export interface LoginResponse {
  user: AuthUser
  token: string
}

export interface CheckIdResponse {
  available: boolean
  duplicate?: boolean
}

export interface FindUserIdResponse {
  userId: string
}

export interface UpdateProfileRequest {
  email?: string
  phone?: string
  password?: string
  currentPassword?: string
}

export interface MessageResponse {
  message: string
}

/** Per-user Setting page prefs stored in MariaDB `USER_SETTINGS`. */
export interface UserSettingsDto {
  userId: string
  fontSize: number
  themeMode: 0 | 1
  language: 'ko' | 'en'
  autoRefreshEnabled: boolean
  refreshInterval: number
  n8nAlert: boolean
  /** USER_SETTINGS.email_check — O=수신, X=거부. n8nAlert is the boolean view. */
  emailCheck: 'O' | 'X'
  /** USER_SETTINGS.manage — O=사내 관리자, X=일반. Setting UI에서 바꾸지 않음. */
  manage: 'O' | 'X'
  updatedAt: string
}

export type UpdateUserSettingsRequest = Partial<Omit<UserSettingsDto, 'userId' | 'updatedAt'>>
