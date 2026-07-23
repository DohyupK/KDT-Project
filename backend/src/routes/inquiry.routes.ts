import { Router } from 'express'
import * as inquiryController from '../controllers/inquiry.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.post('/', authMiddleware, inquiryController.createInquiry)
router.get('/mine', authMiddleware, inquiryController.getMyInquiries)
router.get('/', authMiddleware, inquiryController.getAllInquiries)
router.get('/:id', authMiddleware, inquiryController.getInquiryById)
router.patch('/:id/status', authMiddleware, inquiryController.updateInquiryStatus)
router.put('/:id/reply', authMiddleware, inquiryController.submitInquiryReply)

export default router
