import { Router } from 'express'
import * as managementController from '../controllers/management.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.get('/mails', authMiddleware, managementController.getMails)
router.patch('/mails/:id/read', authMiddleware, managementController.markMailRead)
router.get('/defects', authMiddleware, managementController.getDefectRecords)
router.get('/defect-settings', authMiddleware, managementController.getDefectSettings)
router.put('/defect-settings', authMiddleware, managementController.updateDefectSettings)

export default router
