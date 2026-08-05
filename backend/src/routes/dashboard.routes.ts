import { Router } from 'express'
import * as dashboardController from '../controllers/dashboard.controller.js'

const router = Router()

router.get('/dashboard/lot-risks', dashboardController.listLotRisks)
router.get('/dashboard/lot-risks/:lotId', dashboardController.getLotRiskDetail)
router.get('/dashboard/production-trend', dashboardController.getProductionTrend)
router.get('/dashboard/production-daily', dashboardController.getProductionDaily)
router.get('/dashboard/lots.csv', dashboardController.exportLotsCsv)
router.get('/dashboard/feature-importance', dashboardController.getFeatureImportance)

export const dashboardRouter = router
