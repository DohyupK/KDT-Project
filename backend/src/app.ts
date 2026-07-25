import cors from 'cors'
import express from 'express'
import authRoutes from './routes/auth.routes.js'
import { chatRouter } from './routes/chat.js'
import { controlRouter } from './routes/control.js'
import { settingsRouter } from './routes/settings.js'
import { securityChatRouter } from './routes/securityChat.js'
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
      chat: 'POST /api/chat',
      security_chat: 'POST /api/security-chat',
      control_approve: 'POST /api/control/approve',
      control_revert: 'POST /api/control/approve/:id/revert',
      control_bounds: 'GET|PUT /api/settings/control-bounds',
    })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api', chatRouter)
  app.use('/api', securityChatRouter)
  app.use('/api', controlRouter)
  app.use('/api', settingsRouter)
  app.use(errorHandler)

  return app
}
