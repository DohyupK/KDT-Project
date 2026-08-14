import { Router } from 'express'
import {
  countUserMessages,
  ensureSession,
  getChatStoreMode,
  insertMessage,
  loadRecentUserMessages,
} from '../services/chatStore.js'
import { proxyChat, proxyChatStream } from '../services/aiProxy.js'
import {
  SECURITY_REDIRECT_REPLY,
  hasSecurityKeyword,
  matchedSecurityKeyword,
} from '../services/securityGate.js'
import { countConsecutiveSimilar, needsGuideline } from '../services/similarity.js'
import { listLlmKeysWithSecrets } from '../services/llmKeyStore.js'

import { enrichPageContext } from '../services/pageChatContext.service.js'

type ChatBody = {
  message?: string
  thread_id?: string | null
  user_id?: string | null
  session_id?: string | null
  features?: Record<string, string | number | undefined> | null
  fillThreshold?: number | null
  llm_mode?: string | null
  page_context?: {
    route?: string
    focusId?: string | null
    focusPayload?: unknown
    pagePayload?: unknown
    supplementHints?: string[]
  } | null
  enable_api_llm?: boolean | null
}

function buildCredentials() {
  try {
    return listLlmKeysWithSecrets().map((k) => ({
      id: k.id,
      display_name: k.display_name,
      provider_kind: k.provider_kind,
      company: k.company,
      model: k.model,
      base_url: k.base_url,
      api_key: k.api_key,
      cost_score: k.cost_score,
    }))
  } catch (err) {
    console.warn(
      '[POST /api/chat] llm keys unavailable:',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

async function prepareChatContext(body: ChatBody) {
  const t0 = Date.now()
  const enriched = await enrichPageContext(body.page_context ?? null)
  const enrichMs = Date.now() - t0
  const page_context = enriched
    ? {
        route: enriched.route,
        focusId: enriched.focusId,
        focusPayload: enriched.focusPayload,
        pagePayload: enriched.pagePayload,
        supplement: enriched.supplement,
        supplementHints: body.page_context?.supplementHints ?? [],
      }
    : undefined
  // Learning models always on when features present (AI ignores enable for gating).
  const enableApiLlm = body.enable_api_llm === true || Boolean(body.features)
  return { page_context, enableApiLlm, enrichMs }
}

export const chatRouter = Router()

chatRouter.post('/chat', async (req, res) => {
  const tAll = Date.now()
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
    const llm_credentials = buildCredentials()

    let ai: Awaited<ReturnType<typeof proxyChat>>
    try {
      const { page_context, enableApiLlm, enrichMs } = await prepareChatContext(body)
      console.info('[page-chat-event]', {
        source: 'backend-chat',
        route: page_context?.route ?? null,
        focusId: page_context?.focusId ?? null,
        hasFocus: page_context?.focusPayload != null,
        hasPage: page_context?.pagePayload != null,
        enrich_ms: enrichMs,
      })
      const tProxy = Date.now()
      ai = await proxyChat({
        message,
        thread_id: threadId || sessionId,
        user_id: userId,
        features: body.features ?? undefined,
        fillThreshold: body.fillThreshold ?? undefined,
        need_guideline: guideline,
        llm_mode: body.llm_mode ?? 'auto',
        llm_credentials,
        page_context,
        enable_api_llm: enableApiLlm,
      })
      const proxyMs = Date.now() - tProxy
      console.info(
        `[chat-timing] session=${sessionId.slice(0, 8)} enrich_ms=${enrichMs} proxy_ms=${proxyMs} total_ms=${Date.now() - tAll}`,
        ai.timing ?? {},
      )
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
      timing: ai.timing ?? null,
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

chatRouter.post('/chat/stream', async (req, res) => {
  const tAll = Date.now()
  try {
    const body = req.body as ChatBody
    const message = (body.message || '').trim()
    if (!message) {
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
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.write(
        `event: done\ndata: ${JSON.stringify({
          reply,
          mode: 'security_redirect',
          provider: 'security_redirect',
          thread_id: sessionId,
          security_matched: matched,
          predict: null,
          recommendation: null,
          error: null,
        })}\n\n`,
      )
      res.end()
      return
    }

    const guideline = needsGuideline(message, previousUser)
    const llm_credentials = buildCredentials()
    const { page_context, enableApiLlm, enrichMs } = await prepareChatContext(body)
    console.info('[page-chat-event]', {
      source: 'backend-chat-stream',
      route: page_context?.route ?? null,
      focusId: page_context?.focusId ?? null,
      hasFocus: page_context?.focusPayload != null,
      hasPage: page_context?.pagePayload != null,
      enrich_ms: enrichMs,
    })

    const upstream = await proxyChatStream({
      message,
      thread_id: threadId || sessionId,
      user_id: userId,
      features: body.features ?? undefined,
      fillThreshold: body.fillThreshold ?? undefined,
      need_guideline: guideline,
      llm_mode: body.llm_mode ?? 'auto',
      llm_credentials,
      page_context,
      enable_api_llm: enableApiLlm,
    })

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      res.status(upstream.status || 502).json({
        error: text.slice(0, 400) || `upstream ${upstream.status}`,
      })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalReply = ''
    let finalMode = 'llm'
    let finalProvider = 'llm'

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk
      res.write(chunk)

      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      for (const block of parts) {
        const lines = block.split('\n')
        let ev = 'message'
        let dataLine = ''
        for (const line of lines) {
          if (line.startsWith('event:')) ev = line.slice(6).trim()
          if (line.startsWith('data:')) dataLine += line.slice(5).trim()
        }
        if (ev === 'done' && dataLine) {
          try {
            const data = JSON.parse(dataLine) as {
              reply?: string
              mode?: string
              provider?: string
            }
            finalReply = data.reply || finalReply
            finalMode = data.mode || finalMode
            finalProvider = data.provider || finalProvider
          } catch {
            /* ignore */
          }
        }
      }
    }

    if (finalReply) {
      await insertMessage(sessionId, 'assistant', finalReply, finalMode, finalProvider)
    }
    console.info(
      `[chat-timing] session=${sessionId.slice(0, 8)} stream=1 enrich_ms=${enrichMs} total_ms=${Date.now() - tAll}`,
    )
    res.end()
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/chat/stream]', detail)
    if (!res.headersSent) {
      res.status(500).json({ error: detail })
    } else {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: detail })}\n\n`)
        res.end()
      } catch {
        /* ignore */
      }
    }
  }
})

chatRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend',
    chat_store: getChatStoreMode(),
  })
})
