import { Router } from 'express'
import * as dashboardController from '../controllers/dashboard.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.get('/summary', authMiddleware, dashboardController.getSummary)

export default router
