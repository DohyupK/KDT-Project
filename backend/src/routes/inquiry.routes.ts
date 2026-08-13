import { Router } from 'express'
import * as inquiryController from '../controllers/inquiry.controller.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { inquiryUpload } from '../middleware/inquiryUpload.js'

const router = Router()

router.get('/', authMiddleware, inquiryController.listInquiries)
router.post('/', authMiddleware, inquiryUpload, inquiryController.createInquiry)
router.get(
  '/:id/attachments/:attachmentId',
  authMiddleware,
  inquiryController.downloadAttachment,
)
router.get('/:id', authMiddleware, inquiryController.getInquiry)
router.post('/:id/answer', authMiddleware, inquiryController.upsertAnswer)
router.patch('/:id/answer', authMiddleware, inquiryController.upsertAnswer)
router.put('/:id/answer', authMiddleware, inquiryController.upsertAnswer)

export default router
