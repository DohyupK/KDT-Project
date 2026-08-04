import { Router } from 'express'
import {
  ensureSession,
  getChatStoreMode,
  insertMessage,
} from '../services/chatStore.js'

/**
 * Security-tab proxy only.
 * FE SecurityChatbot → POST /api/security-chat → ai-service POST /security-chat
 * → secure RAG + vLLM :8001. Never uses general /api/chat or Groq/Gemini.
 *
 * Multi-turn (B): FE sends message + thread_id + user_id only (no history array).
 * Express pass-through to ai-service; MariaDB history is loaded there.
 * Legacy chat_sessions store is kept in parallel (not removed).
 */

/** Keep in sync with frontend securityChatApi SECURITY_CHAT_TIMEOUT_MS. */
const SECURITY_CHAT_TIMEOUT_MS = 180_000

type SecurityChatBody = {
  message?: string
  thread_id?: string | null
  user_id?: string | null
  /** @deprecated alias — mapped to thread_id */
  session_id?: string | null
}

type AiSecuritySource = {
  doc_id?: string | null
  title?: string | null
  category?: string | null
  process?: string | null
  source_path?: string | null
  chunk_index?: number | null
  text?: string
}

type TraceEntry = {
  stage?: string
  ms?: number
  ok?: boolean
  detail?: string
}

type AiSecurityChatResponse = {
  reply: string
  mode: string
  provider?: string
  error: string | null
  thread_id?: string | null
  sources?: AiSecuritySource[]
  trace?: TraceEntry[]
  stage?: string
}

type StructuredErrorBody = {
  error: string
  stage?: string
  trace?: TraceEntry[]
  elapsed_ms?: number
}

function asErrorBody(raw: string): Partial<AiSecurityChatResponse> {
  try {
    return JSON.parse(raw) as Partial<AiSecurityChatResponse>
  } catch {
    return { error: raw.slice(0, 400) }
  }
}

async function proxySecurityChat(payload: {
  message: string
  thread_id?: string
  user_id?: string
}): Promise<{ ai: AiSecurityChatResponse; elapsed_ms: number }> {
  const base = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(
    /\/$/,
    '',
  )
  const t0 = Date.now()
    console.info('[security-chat] proxy_start', {
      base,
      timeout_ms: SECURITY_CHAT_TIMEOUT_MS,
      thread_id: payload.thread_id,
      message_len: payload.message.length,
    })
  try {
    const res = await fetch(`${base}/security-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: payload.message,
        thread_id: payload.thread_id,
        user_id: payload.user_id,
      }),
      signal: AbortSignal.timeout(SECURITY_CHAT_TIMEOUT_MS),
    })
    const elapsed_ms = Date.now() - t0
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      const parsed = asErrorBody(text)
      const err = new Error(
        parsed.error ||
          `ai-service /security-chat ${res.status}: ${text.slice(0, 200)}`,
      ) as Error & {
        status?: number
        stage?: string
        trace?: TraceEntry[]
        elapsed_ms?: number
      }
      err.status = res.status
      err.stage = parsed.stage || 'ai_http_error'
      err.trace = parsed.trace
      err.elapsed_ms = elapsed_ms
      throw err
    }
    const ai = JSON.parse(text || '{}') as AiSecurityChatResponse
    console.info('[security-chat] proxy_ok', {
      elapsed_ms,
      mode: ai.mode,
      n_sources: (ai.sources || []).length,
      stages: (ai.trace || []).map((t) => t.stage),
    })
    return { ai, elapsed_ms }
  } catch (err) {
    const elapsed_ms = Date.now() - t0
    if (err && typeof err === 'object' && 'elapsed_ms' in err) {
      throw err
    }
    const e = err as Error & {
      status?: number
      stage?: string
      trace?: TraceEntry[]
      elapsed_ms?: number
      cause?: unknown
    }
    e.elapsed_ms = elapsed_ms
    const msg = e.message || String(err)
    const name = e.name || ''
    if (
      name === 'TimeoutError' ||
      name === 'AbortError' ||
      /aborted|timeout/i.test(msg)
    ) {
      e.stage = 'proxy_timeout'
      e.status = 504
      e.message = `security-chat timed out after ${SECURITY_CHAT_TIMEOUT_MS}ms (local RAG + LLM). ${msg}`
    } else if (
      /ECONNREFUSED|ENOTFOUND|fetch failed|network|ECONNRESET|other side closed|socket hang up/i.test(
        msg,
      )
    ) {
      e.stage = 'ai_unreachable'
      e.status = 502
      e.message = `ai-service unreachable or connection reset after ${elapsed_ms}ms: ${msg}`
    } else if (!e.stage) {
      e.stage = 'proxy_error'
      e.status = e.status && e.status >= 400 ? e.status : 502
    }
    const cause =
      e.cause instanceof Error
        ? { name: e.cause.name, message: e.cause.message }
        : e.cause
    console.error('[security-chat] proxy_fail', {
      stage: e.stage,
      status: e.status,
      elapsed_ms,
      message: e.message,
      cause,
    })
    throw e
  }
}

export const securityChatRouter = Router()

securityChatRouter.post('/security-chat', async (req, res) => {
  const t0 = Date.now()
  try {
    const body = req.body as SecurityChatBody
    const message = (body.message || '').trim()
    if (!message) {
      res.status(400).json({
        error: 'message is required',
        stage: 'validation',
        elapsed_ms: Date.now() - t0,
      } satisfies StructuredErrorBody)
      return
    }

    const threadId = (body.thread_id || body.session_id || undefined) ?? undefined
    const userId = (body.user_id || undefined) ?? undefined

    // Legacy parallel store (sqlite/mariadb chat_sessions) — keep; do not remove.
    let sessionId: string
    try {
      sessionId = await ensureSession(threadId ?? body.session_id)
      await insertMessage(sessionId, 'user', message, 'security_user', 'security')
    } catch (storeErr) {
      const detail =
        storeErr instanceof Error ? storeErr.message : String(storeErr)
      console.error('[security-chat] chat_store', detail)
      res.status(500).json({
        error: detail,
        stage: 'chat_store',
        elapsed_ms: Date.now() - t0,
      } satisfies StructuredErrorBody)
      return
    }

    const { ai, elapsed_ms } = await proxySecurityChat({
      message,
      thread_id: threadId || sessionId,
      user_id: userId,
    })

    const outThreadId = ai.thread_id || threadId || sessionId

    try {
      await insertMessage(
        sessionId,
        'assistant',
        ai.reply,
        ai.mode || 'security_rag',
        ai.provider ?? 'vllm',
      )
    } catch (storeErr) {
      const detail =
        storeErr instanceof Error ? storeErr.message : String(storeErr)
      console.error('[security-chat] chat_store_assistant', detail)
      res.status(200).json({
        session_id: outThreadId,
        thread_id: outThreadId,
        reply: ai.reply,
        mode: ai.mode,
        provider: ai.provider ?? ai.mode,
        error: ai.error ?? `chat_store: ${detail}`,
        sources: ai.sources ?? [],
        trace: ai.trace ?? [],
        stage: 'chat_store_warn',
        elapsed_ms,
        chat_store: getChatStoreMode(),
        channel: 'security',
      })
      return
    }

    res.json({
      session_id: outThreadId,
      thread_id: outThreadId,
      reply: ai.reply,
      mode: ai.mode,
      provider: ai.provider ?? ai.mode,
      error: ai.error,
      sources: ai.sources ?? [],
      trace: ai.trace ?? [],
      elapsed_ms,
      chat_store: getChatStoreMode(),
      channel: 'security',
    })
  } catch (err) {
    const e = err as Error & {
      status?: number
      stage?: string
      trace?: TraceEntry[]
      elapsed_ms?: number
    }
    const detail = e.message || String(err)
    const stage = e.stage || 'unknown'
    const status =
      typeof e.status === 'number' && e.status >= 400 ? e.status : 500
    const elapsed_ms = e.elapsed_ms ?? Date.now() - t0
    console.error('[POST /api/security-chat]', { stage, status, elapsed_ms, detail })
    res.status(status).json({
      error: detail,
      stage,
      trace: e.trace,
      elapsed_ms,
    } satisfies StructuredErrorBody)
  }
})

securityChatRouter.post('/security-chat/stream', async (req, res) => {
  const t0 = Date.now()
  const body = req.body as SecurityChatBody
  const message = (body.message || '').trim()
  if (!message) {
    res.status(400).json({
      error: 'message is required',
      stage: 'validation',
      elapsed_ms: Date.now() - t0,
    } satisfies StructuredErrorBody)
    return
  }

  const threadId = (body.thread_id || body.session_id || undefined) ?? undefined
  const userId = (body.user_id || undefined) ?? undefined

  let sessionId: string
  try {
    sessionId = await ensureSession(threadId ?? body.session_id)
    await insertMessage(sessionId, 'user', message, 'security_user', 'security')
  } catch (storeErr) {
    const detail =
      storeErr instanceof Error ? storeErr.message : String(storeErr)
    console.error('[security-chat/stream] chat_store', detail)
    res.status(500).json({
      error: detail,
      stage: 'chat_store',
      elapsed_ms: Date.now() - t0,
    } satisfies StructuredErrorBody)
    return
  }

  const base = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(
    /\/$/,
    '',
  )
  const ac = new AbortController()
  const onClose = () => {
    try {
      ac.abort()
    } catch {
      /* ignore */
    }
  }
  req.on('close', onClose)

  let legacyAssistantSaved = false
  let sseAcc = ''

  const tryParseAndLegacySave = async (block: string) => {
    const lines = block.split(/\r?\n/)
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }
    if (!dataLines.length) return
    if (eventName !== 'done' && eventName !== 'replace') return
    if (legacyAssistantSaved) return
    try {
      const data = JSON.parse(dataLines.join('\n')) as {
        reply?: string
        mode?: string
        provider?: string
      }
      const reply = data.reply ?? ''
      await insertMessage(
        sessionId,
        'assistant',
        reply,
        data.mode || 'security_rag',
        data.provider ?? 'vllm',
      )
      legacyAssistantSaved = true
    } catch (e) {
      console.error('[security-chat/stream] legacy parse/save', e)
    }
  }

  try {
    console.info('[security-chat/stream] proxy_start', {
      base,
      thread_id: threadId || sessionId,
      message_len: message.length,
    })
    const upstream = await fetch(`${base}/security-chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message,
        thread_id: threadId || sessionId,
        user_id: userId,
      }),
      signal: ac.signal,
    })

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      req.off('close', onClose)
      res.status(upstream.status || 502).json({
        error: text.slice(0, 400) || `upstream ${upstream.status}`,
        stage: 'ai_http_error',
        elapsed_ms: Date.now() - t0,
      } satisfies StructuredErrorBody)
      return
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof (res as { flushHeaders?: () => void }).flushHeaders === 'function') {
      ;(res as { flushHeaders: () => void }).flushHeaders()
    }

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      res.write(chunk)

      sseAcc += chunk
      let sep: number
      while ((sep = sseAcc.indexOf('\n\n')) >= 0) {
        const block = sseAcc.slice(0, sep)
        sseAcc = sseAcc.slice(sep + 2)
        await tryParseAndLegacySave(block)
      }
    }

    if (sseAcc.trim()) {
      await tryParseAndLegacySave(sseAcc)
    }
    res.end()
    console.info('[security-chat/stream] proxy_ok', {
      elapsed_ms: Date.now() - t0,
      legacy_assistant_saved: legacyAssistantSaved,
    })
  } catch (err) {
    const e = err as Error & { name?: string }
    const aborted =
      e.name === 'AbortError' || /aborted/i.test(e.message || String(err))
    if (!res.headersSent) {
      res.status(aborted ? 499 : 502).json({
        error: e.message || String(err),
        stage: aborted ? 'client_disconnect' : 'proxy_stream_error',
        elapsed_ms: Date.now() - t0,
      } satisfies StructuredErrorBody)
    } else {
      try {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            error: e.message || String(err),
            stage: aborted ? 'client_disconnect' : 'proxy_stream_error',
          })}\n\n`,
        )
      } catch {
        /* ignore */
      }
      try {
        res.end()
      } catch {
        /* ignore */
      }
    }
    console.error('[security-chat/stream] proxy_fail', {
      aborted,
      elapsed_ms: Date.now() - t0,
      message: e.message || String(err),
    })
  } finally {
    req.off('close', onClose)
  }
})
