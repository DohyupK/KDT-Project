import type { Request, Response, NextFunction } from 'express'
import * as inquiryService from '../services/inquiry.service'
import { AppError } from '../middleware/errorHandler'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export const createInquiry = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const { category, title, content, isPrivate, attachments, authorName, email, phone } = req.body

  const inquiry = await inquiryService.createInquiry({
    userId: req.auth.userId,
    authorName: authorName ?? req.auth.name,
    email: email ?? '',
    phone: phone ?? '',
    category: String(category ?? ''),
    title: String(title ?? ''),
    content: String(content ?? ''),
    isPrivate: Boolean(isPrivate),
    attachments: Array.isArray(attachments) ? attachments.map(String) : [],
  })

  res.status(201).json({
    inquiry,
    message: inquiry.isPrivate
      ? '비공개 문의가 정상적으로 접수되었습니다.'
      : '문의가 정상적으로 접수되었습니다.',
  })
})

export const getMyInquiries = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const inquiries = await inquiryService.getInquiriesByUser(req.auth.userId)
  res.status(200).json({ inquiries })
})

export const getAllInquiries = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const inquiries = await inquiryService.getAllInquiries()
  res.status(200).json({ inquiries })
})

export const getInquiryById = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const inquiry = await inquiryService.getInquiryById(String(req.params.id))
  res.status(200).json({ inquiry })
})

export const updateInquiryStatus = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')
  const { status } = req.body
  if (!status) throw new AppError(400, '상태 값이 필요합니다.')

  const inquiry = await inquiryService.updateInquiryStatus(String(req.params.id), String(status))
  res.status(200).json({ inquiry, message: '문의 상태가 변경되었습니다.' })
})

export const submitInquiryReply = asyncHandler(async (req, res) => {
  if (!req.auth) throw new AppError(401, '인증이 필요합니다.')

  const { content, assignee, priority, internalMemo, adminConfirmed } = req.body
  const inquiry = await inquiryService.submitInquiryReply(String(req.params.id), {
    content: String(content ?? ''),
    assignee: String(assignee ?? ''),
    priority: String(priority ?? '보통'),
    internalMemo: internalMemo ? String(internalMemo) : undefined,
    adminConfirmed: Boolean(adminConfirmed),
  })

  res.status(200).json({ inquiry, message: '답변이 등록되었습니다.' })
})
