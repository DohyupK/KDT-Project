import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import authRoutes from './routes/auth.routes'
import { errorHandler } from './middleware/errorHandler'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000'

app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)

app.use(errorHandler)

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`)
})
