import { Router } from 'express'
import {
  countUserMessages,
  ensureSession,
  getChatStoreMode,
  insertMessage,
  loadRecentUserMessages,
} from '../services/chatStore.js'
import { proxyChat } from '../services/aiProxy.js'
import {
  SECURITY_REDIRECT_REPLY,
  hasSecurityKeyword,
  matchedSecurityKeyword,
} from '../services/securityGate.js'
import { countConsecutiveSimilar, needsGuideline } from '../services/similarity.js'

type ChatBody = {
  message?: string
  session_id?: string | null
  features?: Record<string, string | number | undefined> | null
  fillThreshold?: number | null
}

export const chatRouter = Router()

chatRouter.post('/chat', async (req, res) => {
  try {
    const body = req.body as ChatBody
    const message = (body.message || '').trim()
    if (!message) {
      res.status(400).json({ error: 'message is required' })
      return
    }

    const sessionId = await ensureSession(body.session_id)
    const previousUser = await loadRecentUserMessages(sessionId)
    await insertMessage(sessionId, 'user', message)

    if (hasSecurityKeyword(message)) {
      const reply = SECURITY_REDIRECT_REPLY
      const matched = matchedSecurityKeyword(message)
      await insertMessage(sessionId, 'assistant', reply, 'security_redirect', 'security_redirect')
      console.info(
        `[security_gate] session=${sessionId.slice(0, 8)} matched=${matched} ai_proxied=false`,
      )
      res.json({
        session_id: sessionId,
        reply,
        mode: 'security_redirect',
        provider: 'security_redirect',
        predict: null,
        recommendation: null,
        error: null,
        ai_proxied: false,
        security_matched: matched,
        chat_store: getChatStoreMode(),
      })
      return
    }

    const similarStreak = countConsecutiveSimilar(message, previousUser)
    const guideline = needsGuideline(message, previousUser)
    const ai = await proxyChat({
      message,
      features: body.features ?? undefined,
      fillThreshold: body.fillThreshold ?? undefined,
      need_guideline: guideline,
    })

    await insertMessage(
      sessionId,
      'assistant',
      ai.reply,
      ai.mode,
      ai.provider ?? ai.mode,
    )

    res.json({
      session_id: sessionId,
      reply: ai.reply,
      mode: ai.mode,
      provider: ai.provider ?? ai.mode,
      predict: ai.predict,
      recommendation: ai.recommendation ?? null,
      error: ai.error,
      need_guideline: guideline,
      similar_streak: similarStreak,
      ai_proxied: true,
      chat_store: getChatStoreMode(),
      stored_user_messages: await countUserMessages(sessionId),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/chat]', detail)
    res.status(500).json({ error: detail })
  }
})

chatRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend',
    chat_store: getChatStoreMode(),
  })
})
