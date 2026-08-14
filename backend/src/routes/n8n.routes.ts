import { Router } from 'express'
import * as n8nController from '../controllers/n8n.controller.js'

const router = Router()

router.post('/internal/n8n/send-email-result', n8nController.sendEmailResult)

export const n8nRouter = router
