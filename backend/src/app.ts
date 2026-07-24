import cors from 'cors'
import express from 'express'
import authRoutes from './routes/auth.routes.js'
import { chatRouter } from './routes/chat.js'
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
    })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api', chatRouter)
  app.use(errorHandler)

  return app
}
