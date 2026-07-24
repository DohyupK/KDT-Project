import cors from 'cors'
import express from 'express'
import { chatRouter } from './routes/chat.js'
import { controlRouter } from './routes/control.js'

export function createApp() {
  const app = express()

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
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
      chat: 'POST /api/chat',
      control_approve: 'POST /api/control/approve',
    })
  })

  app.use('/api', chatRouter)
  app.use('/api', controlRouter)

  return app
}
