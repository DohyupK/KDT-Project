import type { Request, Response, NextFunction } from 'express'
import * as lotService from '../services/lot.service.js'
import * as issueService from '../services/issue.service.js'
import { AppError } from '../middleware/errorHandler.js'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const getRiskTop = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit ?? 10)
  const lots = await lotService.getRiskTop(limit)
  res.status(200).json({ lots, total: lots.length })
})

export const getLot = asyncHandler(async (req, res) => {
  const lot = await lotService.getLotById(String(req.params.lotId))
  res.status(200).json({ lot })
})

export const importLots = asyncHandler(async (_req, res) => {
  const result = await lotService.importLotsFromCsv()
  const issuesCreated = await lotService.ensureIssuesForRiskLots()
  res.status(200).json({
    message: 'LOT 적재·채점 완료',
    imported: result.imported,
    csvPath: result.path,
    issuesCreated,
  })
})

export const listIssues = asyncHandler(async (req, res) => {
  const result = await issueService.listOpenIssues({
    search: req.query.search != null ? String(req.query.search) : undefined,
    date: req.query.date != null ? String(req.query.date) : undefined,
    lotId: req.query.lotId != null ? String(req.query.lotId) : undefined,
    riskLevel: req.query.riskLevel != null ? String(req.query.riskLevel) : undefined,
    status: req.query.status != null ? String(req.query.status) : undefined,
  })
  res.status(200).json(result)
})

export const getIssue = asyncHandler(async (req, res) => {
  const issue = await issueService.getIssueById(String(req.params.issueId))
  res.status(200).json({ issue })
})

export const updateIssue = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const issue = await issueService.updateIssue(
    String(req.params.issueId),
    {
      status: req.body?.status,
      actionContent: req.body?.actionContent,
      completed: req.body?.completed,
    },
    { userId: req.auth.userId, name: req.auth.name || req.auth.userId },
  )
  res.status(200).json({ issue, message: '이슈가 저장되었습니다.' })
})

export const listHandoverHistory = asyncHandler(async (_req, res) => {
  const result = await issueService.listHandoverHistory()
  res.status(200).json(result)
})
