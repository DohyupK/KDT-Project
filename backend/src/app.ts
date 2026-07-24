import cors from 'cors'
import express from 'express'
import { chatRouter } from './routes/chat.js'

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
    })
  })

  app.use('/api', chatRouter)

  return app
}
