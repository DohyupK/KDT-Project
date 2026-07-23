import type { Request, Response, NextFunction } from 'express'
import * as issueService from '../services/issue.service'
import { AppError } from '../middleware/errorHandler'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const getIssues = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const { search, date, lot, risk, status } = req.query
  const issues = await issueService.getIssues({
    search: search ? String(search) : undefined,
    date: date ? String(date) : undefined,
    lot: lot ? String(lot) : undefined,
    risk: risk ? String(risk) : undefined,
    status: status ? String(status) : undefined,
  })

  res.status(200).json({ issues })
})

export const getHandoverSummary = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const summary = await issueService.getHandoverSummary()
  res.status(200).json({ summary })
})

export const getIssueById = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const issue = await issueService.getIssueById(String(req.params.id))
  res.status(200).json({ issue })
})

export const updateIssue = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const { assignee, status, action, completed } = req.body
  if (status === undefined || completed === undefined) {
    throw new AppError(400, '상태와 완료 여부가 필요합니다.')
  }

  const issue = await issueService.updateIssue(String(req.params.id), {
    assignee: String(assignee ?? ''),
    status: String(status),
    action: String(action ?? ''),
    completed: Boolean(completed),
  })

  res.status(200).json({ issue, message: '이슈 처리 정보가 저장되었습니다.' })
})
