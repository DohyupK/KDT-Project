import { Router } from 'express'
import * as authController from '../controllers/auth.controller.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

router.get('/check-id', authController.checkDuplicateUserId)
router.post('/register', authController.register)
router.post('/login', authController.login)
router.post('/find-id', authController.findUserId)
router.post('/verify-reset', authController.verifyResetIdentity)
router.post('/reset-password', authController.resetPassword)
router.post('/logout', authMiddleware, authController.logout)
router.get('/profile', authMiddleware, authController.getProfile)
router.put('/profile', authMiddleware, authController.updateProfile)
router.delete('/account', authMiddleware, authController.withdrawAccount)

export default router
