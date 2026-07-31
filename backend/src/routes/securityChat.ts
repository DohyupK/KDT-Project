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

type AiSecurityChatResponse = {
  reply: string
  mode: string
  provider?: string
  error: string | null
  sources?: AiSecuritySource[]
}

async function proxySecurityChat(message: string): Promise<AiSecurityChatResponse> {
  const base = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')
  const res = await fetch(`${base}/security-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ai-service /security-chat ${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as AiSecurityChatResponse
}

export const securityChatRouter = Router()

securityChatRouter.post('/security-chat', async (req, res) => {
  try {
    const body = req.body as SecurityChatBody
    const message = (body.message || '').trim()
    if (!message) {
      res.status(400).json({ error: 'message is required' })
      return
    }

    const sessionId = await ensureSession(body.session_id)
    await insertMessage(sessionId, 'user', message, 'security_user', 'security')

    const ai = await proxySecurityChat(message)

    await insertMessage(
      sessionId,
      'assistant',
      ai.reply,
      ai.mode || 'security_rag',
      ai.provider ?? 'vllm',
    )

    res.json({
      session_id: sessionId,
      reply: ai.reply,
      mode: ai.mode,
      provider: ai.provider ?? ai.mode,
      error: ai.error,
      sources: ai.sources ?? [],
      chat_store: getChatStoreMode(),
      channel: 'security',
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/security-chat]', detail)
    res.status(500).json({ error: detail })
  }
})
