import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from './errorHandler.js'
import { isManageUser } from '../services/userSettings.service.js'

export interface AuthPayload {
  userId: string
  name: string
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, '인증이 필요합니다.'))
    return
  }

  const token = header.slice(7)
  const secret = process.env.JWT_SECRET
  if (!secret) {
    next(new AppError(500, 'JWT 설정이 없습니다.'))
    return
  }

  try {
    const payload = jwt.verify(token, secret) as AuthPayload
    req.auth = payload
    next()
  } catch {
    next(new AppError(401, '유효하지 않은 토큰입니다.'))
  }
}

export async function requireManage(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    next(new AppError(401, '인증이 필요합니다.'))
    return
  }
  try {
    const ok = await isManageUser(req.auth.userId)
    if (!ok) {
      next(new AppError(403, '관리자만 접근할 수 있습니다.'))
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}
