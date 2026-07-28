import type { NextFunction, Request, Response } from 'express'
import * as inquiryService from '../services/inquiry.service.js'
import { AppError } from '../middleware/errorHandler.js'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const listInquiries = asyncHandler(async (_req, res) => {
  const items = await inquiryService.listInquiries()
  res.status(200).json({ items })
})

export const createInquiry = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const { category, title, content, visibility } = req.body ?? {}
  const item = await inquiryService.createInquiry({
    category: String(category ?? ''),
    title: String(title ?? ''),
    content: String(content ?? ''),
    visibility: visibility === '비공개' ? '비공개' : '공개',
    author: req.auth.name,
    authorUserId: req.auth.userId,
  })
  res.status(201).json({ item })
})
