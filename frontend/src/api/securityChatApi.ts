import axios from 'axios'
import { clearAuthSession, getAuthToken, getAuthUser } from '@/lib/authStorage'

/**
 * Security-tab chat → POST /api/security-chat/stream (SSE) → ai-service /security-chat/stream.
 * Backend JSON POST /api/security-chat remains for smoke/compat (FE uses stream only).
 * Never uses general /api/chat (Groq/Gemini).
 *
 * Multi-turn (B): send message + thread_id + user_id only — never the history array.
 * Timeout is longer than general chat (60s): local RAG + LM Studio often exceeds 100s.
 */

const THREAD_KEY = 'kdt_security_chat_thread_id'
/** Legacy key — migrated on read */
const LEGACY_SESSION_KEY = 'kdt_security_chat_session_id'

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

export function getSecurityChatThreadId(): string | null {
  if (typeof window === 'undefined') return null
  const modern = window.localStorage.getItem(THREAD_KEY)
  if (modern) return modern
  const legacy = window.localStorage.getItem(LEGACY_SESSION_KEY)
  if (legacy) {
    window.localStorage.setItem(THREAD_KEY, legacy)
    return legacy
  }
  return null
}

export function setSecurityChatThreadId(id: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THREAD_KEY, id)
  window.localStorage.setItem(LEGACY_SESSION_KEY, id)
}

export function clearSecurityChatThreadId(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(THREAD_KEY)
  window.localStorage.removeItem(LEGACY_SESSION_KEY)
}

export function newSecurityChatThreadId(): string {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `sec-${Date.now()}`
  setSecurityChatThreadId(id)
  return id
}

/** @deprecated use getSecurityChatThreadId */
export function getSecurityChatSessionId(): string | null {
  return getSecurityChatThreadId()
}

/** @deprecated use setSecurityChatThreadId */
export function setSecurityChatSessionId(id: string): void {
  setSecurityChatThreadId(id)
}

export type SecurityChatRequest = {
  message: string
  thread_id?: string | null
  user_id?: string | null
  /** @deprecated alias for thread_id */
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
  thread_id?: string
  session_id?: string
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
  code?: string
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
  const isFetchFail =
    /fetch failed/i.test(errText) || data.stage === 'proxy_stream_error'
  if (isFetchFail) {
    lines.push(
      'error: AWS가 ai-service(:8800)에 연결하지 못했습니다. 보안 답은 이 PC 워커가 USER_SECURITY_MESSAGES에 씁니다.',
    )
  } else {
    lines.push(`error: ${errText}`)
  }

  const msg = `${opts.message || ''} ${errText}`.toLowerCase()
  const noBody = !opts.data || (Object.keys(data).length === 0 && !data.error)
  if (
    noBody ||
    /socket hang up|econnreset|network error|failed to fetch/i.test(msg) ||
    opts.code === 'ECONNABORTED'
  ) {
    lines.push(
      '힌트: Next→Express 연결이 끊겼을 수 있습니다 (proxyTimeout / backend 재시작 / 장시간 LLM).',
    )
    lines.push(
      'backend(:3001)·ai-service(:8800) 콘솔의 [security-chat] proxy_* / generate_* elapsed_ms를 확인하세요.',
    )
  }
  lines.push('(backend:3001 → ai:8800 → vLLM:8001 / Qdrant:6333)')
  return lines.join('\n')
}

export type SecurityChatStreamHandlers = {
  onMeta?: (data: Record<string, unknown>) => void
  onDelta?: (text: string) => void
  onReplace?: (data: {
    reply: string
    sources: SecurityChatSource[]
    mode?: string
    provider?: string
  }) => void
  onDone?: (data: SecurityChatResponse) => void
  onError?: (data: SecurityChatErrorBody) => void
}

function parseSseBlocks(buffer: string): {
  frames: { event: string; data: string }[]
  rest: string
} {
  const frames: { event: string; data: string }[] = []
  let rest = buffer
  let sep: number
  while ((sep = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, sep)
    rest = rest.slice(sep + 2)
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (dataLines.length) {
      frames.push({ event: eventName, data: dataLines.join('\n') })
    }
  }
  return { frames, rest }
}

export async function postSecurityChatStream(
  body: SecurityChatRequest,
  handlers: SecurityChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const thread_id =
    body.thread_id ?? body.session_id ?? getSecurityChatThreadId()
  const user_id = body.user_id ?? getAuthUser()?.userId ?? undefined
  const token = getAuthToken()

  const res = await fetch('/api/security-chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message: body.message,
      thread_id: thread_id ?? undefined,
      user_id: user_id ?? undefined,
    }),
    signal,
  })

  if (!res.ok || !res.body) {
    let data: SecurityChatErrorBody | null = null
    try {
      data = (await res.json()) as SecurityChatErrorBody
    } catch {
      /* ignore */
    }
    const err = new Error(data?.error || `HTTP ${res.status}`) as Error & {
      status?: number
      data?: SecurityChatErrorBody
    }
    err.status = res.status
    err.data = data ?? undefined
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let acc = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    acc += decoder.decode(value, { stream: true })
    const parsed = parseSseBlocks(acc)
    acc = parsed.rest
    for (const frame of parsed.frames) {
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(frame.data) as Record<string, unknown>
      } catch {
        continue
      }
      if (frame.event === 'meta') {
        handlers.onMeta?.(data)
        const tid = data.thread_id
        if (typeof tid === 'string' && tid) setSecurityChatThreadId(tid)
      } else if (frame.event === 'delta') {
        const t = typeof data.text === 'string' ? data.text : ''
        if (t) handlers.onDelta?.(t)
      } else if (frame.event === 'replace') {
        handlers.onReplace?.({
          reply: String(data.reply ?? ''),
          sources: Array.isArray(data.sources)
            ? (data.sources as SecurityChatSource[])
            : [],
          mode: typeof data.mode === 'string' ? data.mode : undefined,
          provider:
            typeof data.provider === 'string' ? data.provider : undefined,
        })
      } else if (frame.event === 'done') {
        const doneBody = data as unknown as SecurityChatResponse
        const tid = doneBody.thread_id || doneBody.session_id
        if (tid) setSecurityChatThreadId(tid)
        handlers.onDone?.(doneBody)
      } else if (frame.event === 'error') {
        handlers.onError?.(data as SecurityChatErrorBody)
      }
    }
  }
}

export type ChatThreadItem = {
  id: string
  user_id: string
  channel: string
  title?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type ChatThreadMessageItem = {
  role: string
  content: string
  mode?: string | null
  provider?: string | null
  sources?: SecurityChatSource[] | null
  created_at?: string | null
}

export async function listChatThreads(opts: {
  channel: 'security' | 'general'
  user_id?: string
  limit?: number
}): Promise<ChatThreadItem[]> {
  const user_id = opts.user_id ?? getAuthUser()?.userId
  if (!user_id) return []
  const { data } = await securityApiClient.get<{ threads: ChatThreadItem[] }>(
    '/chat/threads',
    {
      params: {
        user_id,
        channel: opts.channel,
        limit: opts.limit ?? 50,
      },
    },
  )
  return data.threads ?? []
}

export async function loadChatThreadMessages(opts: {
  thread_id: string
  user_id?: string
  limit?: number
}): Promise<ChatThreadMessageItem[]> {
  const user_id = opts.user_id ?? getAuthUser()?.userId
  if (!user_id) return []
  const { data } = await securityApiClient.get<{
    thread_id: string
    messages: ChatThreadMessageItem[]
  }>(`/chat/threads/${encodeURIComponent(opts.thread_id)}/messages`, {
    params: { user_id, limit: opts.limit ?? 200 },
  })
  return data.messages ?? []
}
