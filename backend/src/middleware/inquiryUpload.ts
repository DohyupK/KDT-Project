import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { AppError } from './errorHandler.js'
import {
  isAllowedInquiryFile,
  MAX_INQUIRY_FILE_BYTES,
  MAX_INQUIRY_FILES,
} from '../services/inquiryFiles.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_INQUIRY_FILE_BYTES,
    files: MAX_INQUIRY_FILES,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedInquiryFile(file.originalname)) {
      cb(new AppError(400, '허용되지 않는 파일 형식입니다.'))
      return
    }
    cb(null, true)
  },
})

export function inquiryUpload(req: Request, res: Response, next: NextFunction) {
  upload.array('files', MAX_INQUIRY_FILES)(req, res, (err: unknown) => {
    if (!err) {
      next()
      return
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(400, '파일은 10MB 이하여야 합니다.'))
        return
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        next(new AppError(400, '파일은 최대 5개까지 첨부할 수 있습니다.'))
        return
      }
      next(new AppError(400, '파일 업로드에 실패했습니다.'))
      return
    }
    next(err)
  })
}
