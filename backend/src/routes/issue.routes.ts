import { Router } from 'express'
import * as issueController from '../controllers/issue.controller.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

router.get('/lots/risk-top', issueController.getRiskTop)
router.get('/lots/:lotId', issueController.getLot)
/** Admin/dev: reload CSV features into lots. Optional ?score=1&limit=N for AI/SPC scoring. */
router.post('/lots/import', authMiddleware, issueController.importLots)
/** Admin/dev: re-score existing lots via ai-service + Phase I SPC */
router.post('/lots/score', authMiddleware, issueController.scoreLots)

router.get('/issues', issueController.listIssues)
router.get('/issues/:issueId', issueController.getIssue)
router.put('/issues/:issueId', authMiddleware, issueController.updateIssue)

router.get('/knowledge/past-issues', issueController.listPastIssues)
router.get('/knowledge/past-issues/:issueId', issueController.getPastIssue)
/** 인수인계 이력 — 후속(이슈 완료와 무관) */
router.get('/knowledge/handover-history', issueController.listHandoverHistory)

export const issueRouter = router
