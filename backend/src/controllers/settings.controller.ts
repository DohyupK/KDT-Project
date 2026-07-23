import type { Request, Response, NextFunction } from 'express'
import * as settingsService from '../services/settings.service'
import { AppError } from '../middleware/errorHandler'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const getSettings = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const settings = await settingsService.getUserSettings(req.auth.userId)
  res.status(200).json({ settings })
})

export const updateSettings = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const { fontSize, themeMode, language, refreshInterval } = req.body
  if (
    fontSize === undefined ||
    themeMode === undefined ||
    language === undefined ||
    refreshInterval === undefined
  ) {
    throw new AppError(400, '설정 값이 누락되었습니다.')
  }

  const settings = await settingsService.saveUserSettings(req.auth.userId, {
    fontSize: Number(fontSize),
    themeMode: Number(themeMode),
    language: String(language),
    refreshInterval: Number(refreshInterval),
  })

  res.status(200).json({ settings, message: '설정이 저장되었습니다.' })
})
