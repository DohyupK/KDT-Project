import { Router } from 'express'
import * as knowledgeController from '../controllers/knowledge.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.get('/documents', authMiddleware, knowledgeController.getDocuments)
router.get('/documents/:id', authMiddleware, knowledgeController.getDocumentById)
router.get('/actions', authMiddleware, knowledgeController.getActions)
router.post('/actions', authMiddleware, knowledgeController.createAction)
router.put('/actions/:id', authMiddleware, knowledgeController.updateAction)
router.delete('/actions/:id', authMiddleware, knowledgeController.deleteAction)
router.get('/report', authMiddleware, knowledgeController.getReport)
router.post('/report/refresh', authMiddleware, knowledgeController.refreshReport)

export default router
