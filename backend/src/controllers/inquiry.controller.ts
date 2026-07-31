import type { Request, Response, NextFunction } from 'express'
import * as inquiryService from '../services/inquiry.service.js'
import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

async function loadAuthorEmail(userId: string): Promise<string> {
  const rows = await query<{ email: string }[]>(
    'SELECT email FROM users WHERE user_id = ? LIMIT 1',
    [userId],
  )
  const email = rows[0]?.email
  if (!email) throw new AppError(400, '작성자 이메일을 확인할 수 없습니다.')
  return email
}

export const listInquiries = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const result = await inquiryService.listInquiries(
    {
      category: req.query.category != null ? String(req.query.category) : undefined,
      status: req.query.status != null ? String(req.query.status) : undefined,
      startDate: req.query.startDate != null ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate != null ? String(req.query.endDate) : undefined,
      q: req.query.q != null ? String(req.query.q) : undefined,
      page: req.query.page != null ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize != null ? Number(req.query.pageSize) : undefined,
    },
    req.auth.userId,
  )
  res.status(200).json(result)
})

export const getInquiry = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const result = await inquiryService.getInquiryByCode(String(req.params.id), req.auth.userId)
  res.status(200).json(result)
})

export const createInquiry = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const email = await loadAuthorEmail(req.auth.userId)
  const result = await inquiryService.createInquiry(
    {
      category: req.body?.category,
      visibility: req.body?.visibility,
      title: req.body?.title,
      content: req.body?.content,
    },
    {
      userId: req.auth.userId,
      name: req.auth.name || req.auth.userId,
      email,
    },
  )
  res.status(201).json({ ...result, message: '문의가 접수되었습니다.' })
})

export const upsertAnswer = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const result = await inquiryService.upsertAnswer(
    String(req.params.id),
    req.body?.content ?? req.body?.answer,
    req.auth.userId,
  )
  res.status(200).json({ ...result, message: '답변이 등록되었습니다.' })
})
