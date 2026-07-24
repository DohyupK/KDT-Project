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
  phone?: string
  password?: string
  currentPassword?: string
}

export interface MessageResponse {
  message: string
}
