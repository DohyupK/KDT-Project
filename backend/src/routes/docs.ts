import { createReadStream } from 'node:fs'
import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { AppError } from '../middleware/errorHandler.js'
import {
  assertReadableFile,
  listDocsTree,
  mimeForFile,
  resolveSafeDocPath,
} from '../services/docsStore.js'
import { extractDocxText, textToPreviewHtml } from '../services/docxPreview.js'

export const docsRouter = Router()

docsRouter.get('/docs/tree', authMiddleware, async (_req, res, next) => {
  try {
    const data = await listDocsTree()
    res.setHeader('Cache-Control', 'private, no-store')
    res.json(data)
  } catch (err) {
    next(err)
  }
})

docsRouter.get('/docs/file', authMiddleware, async (req, res, next) => {
  try {
    const q = typeof req.query.path === 'string' ? req.query.path : ''
    if (!q) {
      throw new AppError(400, 'path 쿼리가 필요합니다.')
    }
    const { absolute, clearance, relativePosix } = resolveSafeDocPath(q)
    await assertReadableFile(absolute)

    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Doc-Clearance', clearance)
    // Node HTTP headers are Latin-1 only — percent-encode Hangul paths
    res.setHeader('X-Doc-Path', encodeURIComponent(relativePosix))
    res.setHeader('Content-Type', mimeForFile(absolute))
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(relativePosix.split('/').pop() || 'file')}`,
    )

    const stream = createReadStream(absolute)
    stream.on('error', (err) => next(err))
    stream.pipe(res)
  } catch (err) {
    next(err)
  }
})

docsRouter.get('/docs/preview', authMiddleware, async (req, res, next) => {
  try {
    const q = typeof req.query.path === 'string' ? req.query.path : ''
    if (!q) {
      throw new AppError(400, 'path 쿼리가 필요합니다.')
    }
    const { absolute, clearance, relativePosix } = resolveSafeDocPath(q)
    await assertReadableFile(absolute)

    const ext = relativePosix.split('.').pop()?.toLowerCase()
    let html: string
    if (ext === 'docx') {
      const text = await extractDocxText(absolute)
      html = textToPreviewHtml(text)
    } else if (ext === 'md' || ext === 'txt') {
      const { readFile } = await import('node:fs/promises')
      const text = await readFile(absolute, 'utf-8')
      html = textToPreviewHtml(text)
    } else {
      throw new AppError(400, '미리보기를 지원하지 않는 형식입니다.')
    }

    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Doc-Clearance', clearance)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (err) {
    next(err)
  }
})
