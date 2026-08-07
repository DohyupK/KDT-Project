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
  const numOrUndef = (v: unknown) => {
    if (v == null || v === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  const result = await dashboardService.getProductionDaily({
    page: req.query.page != null ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize != null ? Number(req.query.pageSize) : 7,
    operatorId: req.query.operatorId != null ? String(req.query.operatorId) : undefined,
    d50Min: numOrUndef(req.query.d50Min),
    d50Max: numOrUndef(req.query.d50Max),
    d90Min: numOrUndef(req.query.d90Min),
    d90Max: numOrUndef(req.query.d90Max),
  })
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
  const result = await dashboardService.getFeatureImportance({
    topK: req.query.topK != null ? Number(req.query.topK) : undefined,
    grain: req.query.grain != null ? String(req.query.grain) : undefined,
    from: req.query.from != null ? String(req.query.from) : undefined,
    to: req.query.to != null ? String(req.query.to) : undefined,
    bucket: req.query.bucket != null ? String(req.query.bucket) : undefined,
    mode: req.query.mode != null ? String(req.query.mode) : undefined,
  })
  res.status(200).json(result)
})
