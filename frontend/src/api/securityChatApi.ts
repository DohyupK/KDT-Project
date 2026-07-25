import { apiClient } from '@/api/axios'

/**
 * Security-tab chat only → POST /api/security-chat → ai-service /security-chat → vLLM :8001.
 * Never uses general /api/chat (Groq/Gemini).
 */

const SESSION_KEY = 'kdt_security_chat_session_id'

export function getSecurityChatSessionId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(SESSION_KEY)
}

export function setSecurityChatSessionId(id: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SESSION_KEY, id)
}

export type SecurityChatRequest = {
  message: string
  session_id?: string | null
}

export type SecurityChatResponse = {
  session_id: string
  reply: string
  mode: string
  provider: string
  error: string | null
}

export async function postSecurityChat(
  body: SecurityChatRequest,
): Promise<SecurityChatResponse> {
  const session_id = body.session_id ?? getSecurityChatSessionId()
  const { data } = await apiClient.post<SecurityChatResponse>('/security-chat', {
    message: body.message,
    session_id: session_id ?? undefined,
  })
  if (data.session_id) setSecurityChatSessionId(data.session_id)
  return data
}
