import type { Request, Response, NextFunction } from 'express'
import * as managementService from '../services/management.service'
import { AppError } from '../middleware/errorHandler'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const getMails = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const mails = await managementService.getMails()
  res.status(200).json({ mails })
})

export const markMailRead = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const mail = await managementService.markMailRead(String(req.params.id))
  res.status(200).json({ mail, message: '메일을 읽음 처리했습니다.' })
})

export const getDefectRecords = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const records = await managementService.getDefectRecords()
  res.status(200).json({ records })
})

export const getDefectSettings = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const settings = await managementService.getDefectSettings()
  res.status(200).json({ settings })
})

export const updateDefectSettings = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const { threshold, n8nEnabled } = req.body
  const settings = await managementService.updateDefectSettings({
    threshold: threshold !== undefined ? Number(threshold) : undefined,
    n8nEnabled: n8nEnabled !== undefined ? Boolean(n8nEnabled) : undefined,
  })
  res.status(200).json({ settings, message: '불량률 모니터링 설정이 저장되었습니다.' })
})
