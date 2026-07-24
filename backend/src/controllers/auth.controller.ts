import type { Request, Response, NextFunction } from 'express'
import * as authService from '../services/auth.service.js'
import { AppError } from '../middleware/errorHandler.js'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const checkDuplicateUserId = asyncHandler(async (req, res) => {
  const userId = String(req.query.userId ?? '').trim()
  if (!userId) throw new AppError(400, '아이디를 입력해주세요.')

  const available = await authService.checkDuplicateUserId(userId)
  if (!available) {
    res.status(409).json({ available: false, duplicate: true })
    return
  }

  res.status(200).json({ available: true })
})

export const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body)
  res.status(201).json(result)
})

export const login = asyncHandler(async (req, res) => {
  const { userId, password } = req.body
  if (!userId?.trim() || !password) {
    throw new AppError(400, '아이디와 비밀번호를 입력해주세요.')
  }

  const result = await authService.loginUser(userId, password)
  res.status(200).json(result)
})

export const findUserId = asyncHandler(async (req, res) => {
  const { name, phone } = req.body
  const result = await authService.findUserId(name, phone)
  res.status(200).json(result)
})

export const verifyResetIdentity = asyncHandler(async (req, res) => {
  const { name, phone, userId } = req.body
  const result = await authService.verifyResetIdentity(name, phone, userId)
  res.status(200).json(result)
})

export const resetPassword = asyncHandler(async (req, res) => {
  const { name, phone, userId, newPassword } = req.body
  if (!newPassword) {
    throw new AppError(400, '새 비밀번호를 입력해주세요.')
  }
  const result = await authService.resetPassword(name, phone, userId, newPassword)
  res.status(200).json(result)
})

export const logout = asyncHandler(async (_req, res) => {
  res.status(200).json({ message: '로그아웃되었습니다.' })
})

export const getProfile = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const result = await authService.getUserProfile(req.auth.userId)
  res.status(200).json(result)
})

export const updateProfile = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const result = await authService.updateProfile(req.auth.userId, req.body)
  res.status(200).json(result)
})

export const withdrawAccount = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const { password } = req.body
  if (!password) throw new AppError(400, '비밀번호를 입력해주세요.')

  const result = await authService.withdrawAccount(req.auth.userId, password)
  res.status(200).json(result)
})
