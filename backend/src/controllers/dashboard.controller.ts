import type { Request, Response, NextFunction } from 'express'
import * as dashboardService from '../services/dashboard.service.js'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const listLotRisks = asyncHandler(async (req, res) => {
  const result = await dashboardService.listLotRisks({
    page: req.query.page != null ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize != null ? Number(req.query.pageSize) : 5,
    search: req.query.search != null ? String(req.query.search) : undefined,
    riskLevel: req.query.riskLevel != null ? String(req.query.riskLevel) : undefined,
    spc: req.query.spc != null ? String(req.query.spc) : undefined,
    minProb: req.query.minProb != null ? Number(req.query.minProb) : undefined,
    maxProb: req.query.maxProb != null ? Number(req.query.maxProb) : undefined,
    marginLevel: req.query.marginLevel != null ? String(req.query.marginLevel) : undefined,
  })
  res.status(200).json(result)
})

export const getLotRiskDetail = asyncHandler(async (req, res) => {
  const detail = await dashboardService.getLotRiskDetail(String(req.params.lotId))
  res.status(200).json({ item: detail })
})

export const getProductionTrend = asyncHandler(async (req, res) => {
  const result = await dashboardService.getProductionTrend({
    from: req.query.from != null ? String(req.query.from) : undefined,
    to: req.query.to != null ? String(req.query.to) : undefined,
    grain: req.query.grain != null ? String(req.query.grain) : undefined,
  })
  res.status(200).json(result)
})

export const getProductionDaily = asyncHandler(async (req, res) => {
  const page = req.query.page != null ? Number(req.query.page) : 1
  const pageSize = req.query.pageSize != null ? Number(req.query.pageSize) : 5
  const result = await dashboardService.getProductionDaily(page, pageSize)
  res.status(200).json(result)
})

export const exportLotsCsv = asyncHandler(async (req, res) => {
  const date = String(req.query.date || '')
  const csv = await dashboardService.exportLotsCsvByDate(date)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="lots_${date}.csv"`)
  res.status(200).send(csv)
})

export const getFeatureImportance = asyncHandler(async (req, res) => {
  const topK = req.query.topK != null ? Number(req.query.topK) : 4
  const result = dashboardService.getFeatureImportance(Number.isFinite(topK) ? topK : 4)
  res.status(200).json(result)
})
