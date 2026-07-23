import { Router } from 'express'
import * as mainController from '../controllers/main.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.get('/overview', authMiddleware, mainController.getOverview)

export default router
