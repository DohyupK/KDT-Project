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
 */

/** Keep in sync with frontend securityChatApi SECURITY_CHAT_TIMEOUT_MS. */
const SECURITY_CHAT_TIMEOUT_MS = 180_000

type SecurityChatBody = {
  message?: string
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

async function proxySecurityChat(
  message: string,
): Promise<{ ai: AiSecurityChatResponse; elapsed_ms: number }> {
  const base = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(
    /\/$/,
    '',
  )
  const t0 = Date.now()
  console.info('[security-chat] proxy_start', { base, timeout_ms: SECURITY_CHAT_TIMEOUT_MS })
  try {
    const res = await fetch(`${base}/security-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
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
    } else if (/ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(msg)) {
      e.stage = 'ai_unreachable'
      e.status = 502
    } else if (!e.stage) {
      e.stage = 'proxy_error'
    }
    console.error('[security-chat] proxy_fail', {
      stage: e.stage,
      status: e.status,
      elapsed_ms,
      message: e.message,
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

    let sessionId: string
    try {
      sessionId = await ensureSession(body.session_id)
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

    const { ai, elapsed_ms } = await proxySecurityChat(message)

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
      // Still return AI payload; store failure is secondary
      res.status(200).json({
        session_id: sessionId,
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
      session_id: sessionId,
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
