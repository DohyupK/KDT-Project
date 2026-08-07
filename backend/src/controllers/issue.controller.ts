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

export const importLots = asyncHandler(async (req, res) => {
  const result = await lotService.importLotsFromCsv()
  const doScore = String(req.query.score ?? '0') === '1'
  let scoring: Awaited<ReturnType<typeof lotService.scoreAllLots>> | null = null
  let issuesCreated = 0
  if (doScore) {
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined
    scoring = await lotService.scoreAllLots({
      limit: Number.isFinite(limit) ? limit : undefined,
      concurrency: 4,
    })
    issuesCreated = await lotService.ensureIssuesForRiskLots()
  }
  res.status(200).json({
    message: doScore
      ? 'LOT 적재·AI/SPC 채점 완료'
      : 'LOT 공정값 적재 완료. 채점은 npm run score:lots 또는 ?score=1',
    imported: result.imported,
    csvPath: result.path,
    scoring,
    issuesCreated,
  })
})

export const scoreLots = asyncHandler(async (req, res) => {
  const limit = req.query.limit != null ? Number(req.query.limit) : undefined
  const offset = req.query.offset != null ? Number(req.query.offset) : 0
  const concurrency = req.query.concurrency != null ? Number(req.query.concurrency) : 4
  const scoring = await lotService.scoreAllLots({
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : 0,
    concurrency: Number.isFinite(concurrency) ? concurrency : 4,
  })
  const issuesCreated = await lotService.ensureIssuesForRiskLots()
  res.status(200).json({
    message: 'AI/SPC 채점 완료',
    scoring,
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
      handoverFrom: req.body?.handoverFrom,
      handoverTo: req.body?.handoverTo,
    },
    { userId: req.auth.userId, name: req.auth.name || req.auth.userId },
  )
  res.status(200).json({ issue, message: '이슈가 저장되었습니다.' })
})

export const listHandoverHistory = asyncHandler(async (req, res) => {
  const raw = req.query.status != null ? String(req.query.status) : 'completed'
  const status = raw === 'pending' ? 'pending' : 'completed'
  const result = await issueService.listHandoverHistory(status)
  res.status(200).json(result)
})

export const createHandover = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const item = await issueService.createHandoverNote(
    {
      category: req.body?.category,
      content: req.body?.content,
    },
    { userId: req.auth.userId, name: req.auth.name || req.auth.userId },
  )
  res.status(201).json({ item, message: '인수인계 사항이 등록되었습니다.' })
})

export const completeHandover = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const historyId = Number(req.params.historyId)
  const item = await issueService.completeHandoverNote(historyId, {
    userId: req.auth.userId,
    name: req.auth.name || req.auth.userId,
  })
  res.status(200).json({ item, message: '인수인계 사항이 완료 처리되었습니다.' })
})

export const listPastIssues = asyncHandler(async (_req, res) => {
  const result = await issueService.listPastIssues()
  res.status(200).json(result)
})

export const getPastIssue = asyncHandler(async (req, res) => {
  const item = await issueService.getPastIssueById(String(req.params.issueId))
  res.status(200).json({ item })
})
