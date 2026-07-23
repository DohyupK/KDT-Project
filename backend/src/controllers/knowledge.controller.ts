import type { Request, Response, NextFunction } from 'express'
import * as knowledgeService from '../services/knowledge.service'
import { AppError } from '../middleware/errorHandler'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const getDocuments = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const { manager, date, keyword } = req.query
  const result = await knowledgeService.getDocuments({
    manager: manager ? String(manager) : undefined,
    date: date ? String(date) : undefined,
    keyword: keyword ? String(keyword) : undefined,
  })
  res.status(200).json(result)
})

export const getDocumentById = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const document = await knowledgeService.getDocumentById(String(req.params.id))
  res.status(200).json({ document })
})

export const getActions = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const actions = await knowledgeService.getActions()
  res.status(200).json({ actions })
})

export const createAction = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const { situation, action, cause, manager, date } = req.body
  const created = await knowledgeService.createAction({
    situation: String(situation ?? ''),
    action: String(action ?? ''),
    cause: String(cause ?? ''),
    manager: String(manager ?? ''),
    date: String(date ?? ''),
  })
  res.status(201).json({ action: created, message: '상황 대처 이력이 등록되었습니다.' })
})

export const updateAction = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const { situation, action, cause, manager, date } = req.body
  const updated = await knowledgeService.updateAction(Number(req.params.id), {
    situation: String(situation ?? ''),
    action: String(action ?? ''),
    cause: String(cause ?? ''),
    manager: String(manager ?? ''),
    date: String(date ?? ''),
  })
  res.status(200).json({ action: updated, message: '상황 대처 이력이 수정되었습니다.' })
})

export const deleteAction = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  await knowledgeService.deleteAction(Number(req.params.id))
  res.status(200).json({ message: '상황 대처 이력이 삭제되었습니다.' })
})

export const getReport = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const report = await knowledgeService.getReport()
  res.status(200).json({ report })
})

export const refreshReport = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const report = await knowledgeService.refreshReport()
  res.status(200).json({ report, message: '데일리 레포트가 최신 과거 데이터 기준으로 재갱신되었습니다.' })
})
