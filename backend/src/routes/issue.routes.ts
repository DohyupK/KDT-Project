import { Router } from 'express'
import * as issueController from '../controllers/issue.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.get('/handover/summary', authMiddleware, issueController.getHandoverSummary)
router.get('/', authMiddleware, issueController.getIssues)
router.get('/:id', authMiddleware, issueController.getIssueById)
router.put('/:id', authMiddleware, issueController.updateIssue)

export default router
