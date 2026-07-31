import axios from 'axios'
import { clearAuthSession, getAuthToken } from '@/lib/authStorage'

/**
 * Security-tab chat only → POST /api/security-chat → ai-service /security-chat → vLLM :8001 (+ secure RAG).
 * Never uses general /api/chat (Groq/Gemini).
 *
 * Timeout is longer than general chat (60s): local RAG + LM Studio often exceeds 100s.
 */

const SESSION_KEY = 'kdt_security_chat_session_id'

/** Must stay aligned with backend securityChat AbortSignal (180s). */
const SECURITY_CHAT_TIMEOUT_MS = 180_000

const securityApiClient = axios.create({
  baseURL: '/api',
  timeout: SECURITY_CHAT_TIMEOUT_MS,
})

securityApiClient.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

securityApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? ''
      const isAuthRequest =
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/find-id') ||
        url.includes('/auth/reset-password') ||
        url.includes('/auth/verify-reset')

      if (!isAuthRequest && typeof window !== 'undefined') {
        clearAuthSession()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

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

export type SecurityChatSource = {
  doc_id: string
  title: string
  category?: string | null
  process?: string | null
  source_path?: string | null
  chunk_index?: number | null
  text: string
}

export type SecurityChatTraceEntry = {
  stage?: string
  ms?: number
  ok?: boolean
  detail?: string
}

export type SecurityChatResponse = {
  session_id: string
  reply: string
  mode: string
  provider: string
  error: string | null
  sources?: SecurityChatSource[]
  trace?: SecurityChatTraceEntry[]
  elapsed_ms?: number
  stage?: string
}

export type SecurityChatErrorBody = {
  error?: string
  stage?: string
  trace?: SecurityChatTraceEntry[]
  elapsed_ms?: number
}

export function formatSecurityChatFailure(opts: {
  status?: number
  data?: SecurityChatErrorBody | null
  message?: string
}): string {
  const status = opts.status
  const data = opts.data || {}
  const lines: string[] = ['보안 챗 실패']
  const head = [
    status != null ? `HTTP ${status}` : null,
    data.stage ? `stage=${data.stage}` : null,
    data.elapsed_ms != null ? `elapsed=${data.elapsed_ms}ms` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  if (head) lines.push(head)
  const trace = data.trace || []
  for (const t of trace) {
    const bit = [
      t.stage || '?',
      t.ok === false ? 'FAIL' : t.ok === true ? 'ok' : '',
      t.ms != null ? `${t.ms}ms` : '',
      t.detail || '',
    ]
      .filter(Boolean)
      .join(' ')
    lines.push(`- ${bit}`)
  }
  const errText =
    (typeof data.error === 'string' && data.error) ||
    (typeof (data as { detail?: unknown }).detail === 'string'
      ? String((data as { detail: string }).detail)
      : '') ||
    (Array.isArray((data as { detail?: unknown }).detail)
      ? JSON.stringify((data as { detail: unknown }).detail).slice(0, 400)
      : '') ||
    opts.message ||
    '요청에 실패했습니다.'
  lines.push(`error: ${errText}`)
  lines.push('(backend:3001 → ai:8800 → vLLM:8001 / Qdrant:6333)')
  return lines.join('\n')
}

export async function postSecurityChat(
  body: SecurityChatRequest,
): Promise<SecurityChatResponse> {
  const session_id = body.session_id ?? getSecurityChatSessionId()
  const { data } = await securityApiClient.post<SecurityChatResponse>(
    '/security-chat',
    {
      message: body.message,
      session_id: session_id ?? undefined,
    },
  )
  if (data.session_id) setSecurityChatSessionId(data.session_id)
  if (data.trace?.length) {
    console.debug('[security-chat] ok trace', data.trace, 'elapsed_ms', data.elapsed_ms)
  }
  return data
}
