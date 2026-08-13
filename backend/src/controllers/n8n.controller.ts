import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../middleware/errorHandler.js'
import { applySendEmailResult, n8nCallbackSecret, secretsEqual } from '../services/issueReportN8n.js'

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

function bearerToken(req: Request): string {
  const header = String(req.headers.authorization || '')
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  return String(req.headers['x-n8n-secret'] || '').trim()
}

export const sendEmailResult = asyncHandler(async (req, res) => {
  const expected = n8nCallbackSecret()
  if (!expected || !secretsEqual(bearerToken(req), expected)) {
    throw new AppError(401, '인증이 필요합니다.')
  }

  const id = Number(req.body?.id)
  const sendRaw = String(req.body?.send ?? '').trim().toUpperCase()
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'id가 올바르지 않습니다.')
  }
  if (sendRaw !== 'O' && sendRaw !== 'X') {
    throw new AppError(400, 'send는 O 또는 X여야 합니다.')
  }

  const error = req.body?.error == null ? null : String(req.body.error)
  const ok = await applySendEmailResult({
    id,
    send: sendRaw,
    error,
  })
  if (!ok) throw new AppError(404, '발송 기록을 찾을 수 없습니다.')
  res.status(200).json({ ok: true, id, send: sendRaw })
})
