import { Router } from 'express'
import * as issueController from '../controllers/issue.controller.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

router.get('/lots/risk-top', issueController.getRiskTop)
router.get('/lots/:lotId', issueController.getLot)
/** Admin/dev: reload CSV into lots + seed open issues for 높음/중간 */
router.post('/lots/import', authMiddleware, issueController.importLots)

router.get('/issues', issueController.listIssues)
router.get('/issues/:issueId', issueController.getIssue)
router.put('/issues/:issueId', authMiddleware, issueController.updateIssue)

router.get('/knowledge/past-issues', issueController.listPastIssues)
router.get('/knowledge/past-issues/:issueId', issueController.getPastIssue)
/** 인수인계: 등록 POST · 완료 PATCH · 목록 GET(?status=pending|completed) */
router.get('/knowledge/handover-history', issueController.listHandoverHistory)
router.post('/knowledge/handover', authMiddleware, issueController.createHandover)
router.patch(
  '/knowledge/handover/:historyId/complete',
  authMiddleware,
  issueController.completeHandover,
)

export const issueRouter = router
