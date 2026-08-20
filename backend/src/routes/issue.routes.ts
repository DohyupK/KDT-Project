import { Router } from 'express'
import * as issueController from '../controllers/issue.controller.js'
import { authMiddleware, requireManage } from '../middleware/auth.middleware.js'

const router = Router()

router.get('/lots/risk-top', issueController.getRiskTop)
router.get('/lots/daily-kpi', issueController.getDailyKpi)
router.get('/lots/q-cost', issueController.getQCost)
router.get('/lots/:lotId', issueController.getLot)
/** Admin/dev: reload CSV features into LOTS. Optional ?score=1&limit=N for AI/SPC scoring. */
router.post('/lots/import', authMiddleware, issueController.importLots)
/** Admin/dev: re-score existing LOTS via ai-service + Phase I SPC */
router.post('/lots/score', authMiddleware, issueController.scoreLots)

router.get('/issues/managers', authMiddleware, issueController.listIssueManagers)
router.get('/issues', issueController.listIssues)
router.get('/issues/:issueId', issueController.getIssue)
router.put('/issues/:issueId', authMiddleware, issueController.updateIssue)

router.get('/knowledge/past-issues', authMiddleware, requireManage, issueController.listPastIssues)
router.get(
  '/knowledge/past-issues/:issueId',
  authMiddleware,
  requireManage,
  issueController.getPastIssue,
)
/** Knowledge 선택 항목 AI 분석 (보안 게이트·chatStore 미사용, 답변만 AI_LIBRARY_ANALYSIS 저장) */
router.post('/knowledge/analyze', authMiddleware, requireManage, issueController.analyzeKnowledge)

export const issueRouter = router
