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
import { listLlmKeysWithSecrets } from '../services/llmKeyStore.js'

type ChatBody = {
  message?: string
  thread_id?: string | null
  user_id?: string | null
  session_id?: string | null
  features?: Record<string, string | number | undefined> | null
  fillThreshold?: number | null
  llm_mode?: string | null
}

export const chatRouter = Router()

chatRouter.post('/chat', async (req, res) => {
  try {
    const body = req.body as ChatBody
    const message = (body.message || '').trim()
    if (!message) {
      console.warn('[POST /api/chat] missing_message')
      res.status(400).json({ error: 'message is required' })
      return
    }

    const threadId = (body.thread_id || body.session_id || undefined) ?? undefined
    const userId = (body.user_id || undefined) ?? undefined
    const sessionId = await ensureSession(threadId ?? body.session_id)
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
        thread_id: sessionId,
        reply,
        mode: 'security_redirect',
        provider: 'security_redirect',
        predict: null,
        capacity: null,
        residual: null,
        heads: null,
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

    let llm_credentials: Awaited<ReturnType<typeof listLlmKeysWithSecrets>> = []
    try {
      llm_credentials = listLlmKeysWithSecrets()
    } catch (err) {
      // Encryption key missing / empty DB — chat uses template (no .env API fallback)
      console.warn(
        '[POST /api/chat] llm keys unavailable:',
        err instanceof Error ? err.message : err,
      )
    }

    let ai: Awaited<ReturnType<typeof proxyChat>>
    try {
      ai = await proxyChat({
        message,
        thread_id: threadId || sessionId,
        user_id: userId,
        features: body.features ?? undefined,
        fillThreshold: body.fillThreshold ?? undefined,
        need_guideline: guideline,
        llm_mode: body.llm_mode ?? 'auto',
        llm_credentials: llm_credentials.map((k) => ({
          id: k.id,
          display_name: k.display_name,
          provider_kind: k.provider_kind,
          company: k.company,
          model: k.model,
          base_url: k.base_url,
          api_key: k.api_key,
          cost_score: k.cost_score,
        })),
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error('[POST /api/chat] proxy_failed:', detail)
      throw err
    }

    if (!ai.reply || ai.error) {
      console.warn(
        '[POST /api/chat] empty_or_ai_error:',
        `session=${sessionId.slice(0, 8)}`,
        `reply_len=${(ai.reply ?? '').length}`,
        `error=${ai.error ?? 'null'}`,
        `mode=${ai.mode ?? 'unknown'}`,
        `provider=${ai.provider ?? 'unknown'}`,
      )
    }

    await insertMessage(
      sessionId,
      'assistant',
      ai.reply,
      ai.mode,
      ai.provider ?? ai.mode,
    )

    const outThreadId = ai.thread_id || threadId || sessionId

    res.json({
      session_id: outThreadId,
      thread_id: outThreadId,
      reply: ai.reply,
      mode: ai.mode,
      provider: ai.provider ?? ai.mode,
      predict: ai.predict,
      capacity: ai.capacity ?? null,
      residual: ai.residual ?? null,
      heads: ai.heads ?? null,
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
