import { Router } from 'express'
import * as n8nController from '../controllers/n8n.controller.js'
import * as gmailOauthController from '../controllers/gmailOauth.controller.js'

const router = Router()

router.post('/internal/n8n/send-email-result', n8nController.sendEmailResult)
router.get('/internal/gmail-oauth/start', gmailOauthController.start)
router.get('/internal/gmail-oauth/callback', gmailOauthController.callback)

export const n8nRouter = router
