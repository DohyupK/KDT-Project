import cors from 'cors'
import express from 'express'
import authRoutes from './routes/auth.routes.js'
import { chatRouter } from './routes/chat.js'
import { chatThreadsRouter } from './routes/chatThreads.js'
import { controlRouter } from './routes/control.js'
import { settingsRouter } from './routes/settings.js'
import { securityChatRouter } from './routes/securityChat.js'
import { llmKeysRouter } from './routes/llmKeys.js'
import { issueRouter } from './routes/issue.routes.js'
import { dashboardRouter } from './routes/dashboard.routes.js'
import inquiryRoutes from './routes/inquiry.routes.js'
import { docsRouter } from './routes/docs.js'
import { n8nRouter } from './routes/n8n.routes.js'
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
      auth_notifications:
        'GET /api/auth/notifications/state · POST /api/auth/notifications/read · POST /api/auth/notifications/dismiss',
      lots: 'GET /api/lots/risk-top · GET /api/lots/daily-kpi · GET /api/lots/q-cost · GET /api/lots/:lotId · POST /api/lots/import · POST /api/lots/score',
      dashboard:
        'GET /api/dashboard/lot-risks · /lot-risks/:lotId · /production-trend · /production-daily · /lots.csv · /feature-importance',
      issues: 'GET /api/issues · GET|PUT /api/issues/:issueId',
      past_issues: 'GET /api/knowledge/past-issues · GET /api/knowledge/past-issues/:issueId',
      knowledge_analyze: 'POST /api/knowledge/analyze (auth) → AI_Library_analysis',
      handover_history:
        'GET /api/knowledge/handover-history?status=pending|completed · POST /api/knowledge/handover (auth)',
      docs: 'GET /api/docs/tree · GET /api/docs/file?path= (READ-ONLY, auth)',
      inquiries: 'GET|POST /api/inquiries · GET /api/inquiries/:id · GET /api/inquiries/:id/attachments/:attachmentId · POST|PATCH|PUT /api/inquiries/:id/answer',
      chat: 'POST /api/chat',
      chat_stream: 'POST /api/chat/stream',
      chat_threads: 'GET /api/chat/threads · GET /api/chat/threads/:id/messages',
      security_chat: 'POST /api/security-chat',
      security_chat_stream: 'POST /api/security-chat/stream',
      llm_keys: 'GET|POST /api/llm-keys · DELETE /api/llm-keys/:id',
      control_approve: 'POST /api/control/approve',
      control_revert: 'POST /api/control/approve/:id/revert',
      control_outcome: 'POST /api/control/approve/:id/outcome',
      control_bounds: 'GET|PUT /api/settings/control-bounds',
      n8n_send_email: 'POST /api/internal/n8n/send-email-result',
    })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/inquiries', inquiryRoutes)
  app.use('/api', issueRouter)
  app.use('/api', dashboardRouter)
  app.use('/api', docsRouter)
  app.use('/api', chatThreadsRouter)
  app.use('/api', chatRouter)
  app.use('/api', securityChatRouter)
  app.use('/api', llmKeysRouter)
  app.use('/api', controlRouter)
  app.use('/api', settingsRouter)
  app.use('/api', n8nRouter)
  app.use(errorHandler)

  return app
}
