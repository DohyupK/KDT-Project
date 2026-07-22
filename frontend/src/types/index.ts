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

export interface ResetPasswordRequest {
  name: string
  phone: string
  userId: string
}

export interface AuthUser {
  userId: string
  name: string
  phone: string
  email: string
}
