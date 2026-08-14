import type { Request, Response, NextFunction } from 'express'
import * as authService from '../services/auth.service.js'
import * as userSettingsService from '../services/userSettings.service.js'
import * as headerNotifStateService from '../services/headerNotifState.service.js'
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

export const verifyCurrentPassword = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const password = String(req.body?.password ?? '')
  const result = await authService.verifyCurrentPassword(req.auth.userId, password)
  res.status(200).json(result)
})

export const withdrawAccount = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const { password } = req.body
  if (!password) throw new AppError(400, '비밀번호를 입력해주세요.')

  const result = await authService.withdrawAccount(req.auth.userId, password)
  res.status(200).json(result)
})

export const getSettings = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const settings = await userSettingsService.getUserSettings(req.auth.userId)
  res.status(200).json({ settings })
})

export const updateSettings = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const settings = await userSettingsService.updateUserSettings(req.auth.userId, req.body ?? {})
  res.status(200).json({ settings, message: '설정이 저장되었습니다.' })
})

export const resetSettings = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const settings = await userSettingsService.resetUserSettings(req.auth.userId)
  res.status(200).json({ settings, message: '설정이 기본값으로 초기화되었습니다.' })
})

export const getHeaderNotifState = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const state = await headerNotifStateService.getHeaderNotifState(req.auth.userId)
  res.status(200).json(state)
})

export const markHeaderNotifsRead = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const state = await headerNotifStateService.markHeaderNotifsRead(
    req.auth.userId,
    req.body?.ids,
  )
  res.status(200).json(state)
})

export const dismissHeaderNotifs = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const state = await headerNotifStateService.dismissHeaderNotifs(
    req.auth.userId,
    req.body?.ids,
  )
  res.status(200).json(state)
})
