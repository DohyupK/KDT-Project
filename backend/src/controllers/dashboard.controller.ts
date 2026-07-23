import type { Request, Response, NextFunction } from 'express'
import * as dashboardService from '../services/dashboard.service'
import { AppError } from '../middleware/errorHandler'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const getSummary = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const { startDate, endDate, product, line } = req.query
  const summary = await dashboardService.getDashboardSummary({
    startDate: startDate ? String(startDate) : undefined,
    endDate: endDate ? String(endDate) : undefined,
    product: product ? String(product) : undefined,
    line: line ? String(line) : undefined,
  })

  res.status(200).json(summary)
})
