import type { Request, Response, NextFunction } from 'express'
import * as mainService from '../services/main.service'
import { AppError } from '../middleware/errorHandler'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const getOverview = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const overview = await mainService.getMainOverview()
  res.status(200).json({ overview })
})
