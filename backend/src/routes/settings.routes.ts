import { Router } from 'express'
import * as settingsController from '../controllers/settings.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.get('/', authMiddleware, settingsController.getSettings)
router.put('/', authMiddleware, settingsController.updateSettings)

export default router
