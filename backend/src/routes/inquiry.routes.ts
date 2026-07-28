import { Router } from 'express'
import * as inquiryController from '../controllers/inquiry.controller.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

router.get('/', inquiryController.listInquiries)
router.post('/', authMiddleware, inquiryController.createInquiry)

export default router
