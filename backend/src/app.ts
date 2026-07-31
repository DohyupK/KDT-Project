import cors from 'cors'
import express from 'express'
import authRoutes from './routes/auth.routes.js'
import { chatRouter } from './routes/chat.js'
import { controlRouter } from './routes/control.js'
import { settingsRouter } from './routes/settings.js'
import { securityChatRouter } from './routes/securityChat.js'
import { llmKeysRouter } from './routes/llmKeys.js'
import { issueRouter } from './routes/issue.routes.js'
import inquiryRoutes from './routes/inquiry.routes.js'
import { errorHandler } from './middleware/errorHandler.js'

export function createApp() {
  const app = express()

  const origins = (
    process.env.CORS_ORIGINS ||
    process.env.CORS_ORIGIN ||
    'http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  app.use(
    cors({
      origin: origins,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  app.get('/', (_req, res) => {
    res.json({
      service: 'backend',
      health: '/api/health',
      auth: '/api/auth',
      auth_settings: 'GET|PUT /api/auth/settings · POST /api/auth/settings/reset',
      lots: 'GET /api/lots/risk-top · GET /api/lots/:lotId · POST /api/lots/import',
      issues: 'GET /api/issues · GET|PUT /api/issues/:issueId',
      past_issues: 'GET /api/knowledge/past-issues · GET /api/knowledge/past-issues/:issueId',
      handover_history: 'GET /api/knowledge/handover-history (후속)',
      inquiries: 'GET|POST /api/inquiries · GET /api/inquiries/:id · POST|PATCH|PUT /api/inquiries/:id/answer',
      chat: 'POST /api/chat',
      security_chat: 'POST /api/security-chat',
      llm_keys: 'GET|POST /api/llm-keys · DELETE /api/llm-keys/:id',
      control_approve: 'POST /api/control/approve',
      control_revert: 'POST /api/control/approve/:id/revert',
      control_outcome: 'POST /api/control/approve/:id/outcome',
      control_bounds: 'GET|PUT /api/settings/control-bounds',
    })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/inquiries', inquiryRoutes)
  app.use('/api', issueRouter)
  app.use('/api', chatRouter)
  app.use('/api', securityChatRouter)
  app.use('/api', llmKeysRouter)
  app.use('/api', controlRouter)
  app.use('/api', settingsRouter)
  app.use(errorHandler)

  return app
}
