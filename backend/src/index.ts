import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import authRoutes from './routes/auth.routes'
import settingsRoutes from './routes/settings.routes'
import inquiryRoutes from './routes/inquiry.routes'
import mainRoutes from './routes/main.routes'
import dashboardRoutes from './routes/dashboard.routes'
import issueRoutes from './routes/issue.routes'
import knowledgeRoutes from './routes/knowledge.routes'
import managementRoutes from './routes/management.routes'
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
app.use('/api/settings', settingsRoutes)
app.use('/api/inquiries', inquiryRoutes)
app.use('/api/main', mainRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/issues', issueRoutes)
app.use('/api/knowledge', knowledgeRoutes)
app.use('/api/management', managementRoutes)

app.use(errorHandler)

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`)
})
