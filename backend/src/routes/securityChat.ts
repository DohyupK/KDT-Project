import { Router } from 'express'
import {
  ensureSession,
  getChatStoreMode,
  insertMessage,
} from '../services/chatStore.js'

/**
 * Security-tab proxy only.
 * FE SecurityChatbot → POST /api/security-chat → ai-service POST /security-chat → vLLM :8001
 * Never uses general /api/chat or Groq/Gemini.
 */

type SecurityChatBody = {
  message?: string
  session_id?: string | null
}

type AiSecurityChatResponse = {
  reply: string
  mode: string
  provider?: string
  error: string | null
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

    // Separate from general chat sessions via FE localStorage key;
    // mode=security_vllm on stored rows for audit distinction.
    const sessionId = await ensureSession(body.session_id)
    await insertMessage(sessionId, 'user', message, 'security_user', 'security')

    const ai = await proxySecurityChat(message)

    await insertMessage(
      sessionId,
      'assistant',
      ai.reply,
      ai.mode || 'security_vllm',
      ai.provider ?? 'vllm',
    )

    res.json({
      session_id: sessionId,
      reply: ai.reply,
      mode: ai.mode,
      provider: ai.provider ?? ai.mode,
      error: ai.error,
      chat_store: getChatStoreMode(),
      channel: 'security',
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/security-chat]', detail)
    res.status(500).json({ error: detail })
  }
})
