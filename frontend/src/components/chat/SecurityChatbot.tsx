'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { FileText, Shield, X } from 'lucide-react'
import {
  formatSecurityChatFailure,
  getSecurityChatThreadId,
  listChatThreads,
  loadChatThreadMessages,
  newSecurityChatThreadId,
  postSecurityChatStream,
  setSecurityChatThreadId,
  type ChatThreadItem,
  type SecurityChatErrorBody,
  type SecurityChatSource,
} from '@/api/securityChatApi'
import axios from 'axios'

type ChatRole = 'user' | 'ai'

type ChatMessage = {
  id: number
  role: ChatRole
  text: string
  mode?: string
  provider?: string
  /** Wall-clock ms from send click until reply (or error) is shown. */
  elapsedMs?: number
  sources?: SecurityChatSource[]
}

function formatWallElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const WELCOME_SECURITY: ChatMessage = {
  id: 1,
  role: 'ai',
  text:
    '보안·기밀 전용 챗봇입니다. 이 탭의 메시지는 외부 API(Groq/Gemini 등)로 전송되지 않으며, 로컬 vLLM(CHAT_VLLM_BASE_URL, 기본 :8001)과 보안 문서 RAG만 사용합니다. vLLM이 꺼져 있으면 오프라인 안내만 표시됩니다.',
  mode: 'template',
  provider: 'offline',
}

type Props = {
  /** page = fixed height card; embedded = fill parent (fullscreen overlay) */
  variant?: 'page' | 'embedded'
  className?: string
}

function dedupeSourcesByDocId(sources: SecurityChatSource[]): SecurityChatSource[] {
  const seen = new Set<string>()
  const out: SecurityChatSource[] = []
  for (const s of sources) {
    const key = (s.doc_id || s.title || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function chunksForDocId(
  sources: SecurityChatSource[],
  docId: string,
): SecurityChatSource[] {
  return sources.filter((s) => (s.doc_id || s.title || '') === docId)
}

function uniqueDocIdCount(sources: SecurityChatSource[]): number {
  return dedupeSourcesByDocId(sources).length
}

function SourcePanel({
  chunks,
  onClose,
}: {
  chunks: SecurityChatSource[]
  onClose: () => void
}) {
  const head = chunks[0]
  if (!head) return null
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-slate-200 bg-white md:w-[min(100%,380px)] md:border-l">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <FileText size={16} className="shrink-0 text-amber-700" />
        <strong className="min-w-0 flex-1 truncate text-sm text-slate-800">
          {head.title}
        </strong>
        <button
          type="button"
          aria-label="출처 패널 닫기"
          onClick={onClose}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
        >
          <X size={14} />
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto p-3 text-[11px] text-slate-600">
        <div>
          <span className="font-medium text-slate-800">doc_id</span>: {head.doc_id}
        </div>
        {head.category ? (
          <div>
            <span className="font-medium text-slate-800">category</span>: {head.category}
          </div>
        ) : null}
        {head.process ? (
          <div>
            <span className="font-medium text-slate-800">process</span>: {head.process}
          </div>
        ) : null}
        {head.source_path ? (
          <div className="break-all">
            <span className="font-medium text-slate-800">path</span>: {head.source_path}
          </div>
        ) : null}
        <div>
          <span className="font-medium text-slate-800">chunks</span>: {chunks.length}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50/80 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          가져온 원문 청크
        </p>
        <div className="space-y-3">
          {chunks.map((c, idx) => (
            <div
              key={`${c.doc_id}-${c.chunk_index ?? idx}`}
              className="rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <p className="mb-1.5 text-[10px] font-medium text-slate-500">
                chunk
                {c.chunk_index != null ? ` #${c.chunk_index}` : ` ${idx + 1}`}
              </p>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">
                {c.text}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

/**
 * Security-tab chatbot: local vLLM (+ secure RAG) via /api/security-chat/stream (SSE).
 * Do not wire Groq / Gemini / general GlobalChatbot providers here.
 */
export default function SecurityChatbot({
  variant = 'page',
  className = '',
}: Props) {
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  /** Active document panel: all chunks for one doc_id from the message sources. */
  const [activeDocChunks, setActiveDocChunks] = useState<SecurityChatSource[] | null>(
    null,
  )
  const [threads, setThreads] = useState<ChatThreadItem[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_SECURITY])
  const idRef = useRef(2)
  const endRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const openDocFromSources = (
    sources: SecurityChatSource[] | undefined,
    docId: string,
  ) => {
    if (!sources?.length || !docId) return
    const chunks = chunksForDocId(sources, docId)
    if (chunks.length) setActiveDocChunks(chunks)
  }

  const refreshThreads = async () => {
    try {
      const list = await listChatThreads({ channel: 'security' })
      setThreads(list)
    } catch {
      /* soft-fail: list optional when logged out / DB down */
    }
  }

  const hydrateThread = async (threadId: string) => {
    try {
      const rows = await loadChatThreadMessages({ thread_id: threadId })
      if (!rows.length) {
        setMessages([WELCOME_SECURITY])
        idRef.current = 2
        return
      }
      let n = 1
      const mapped: ChatMessage[] = rows.map((r) => {
        n += 1
        const role: ChatRole = r.role === 'user' ? 'user' : 'ai'
        const sources = Array.isArray(r.sources)
          ? (r.sources as SecurityChatSource[])
          : undefined
        return {
          id: n,
          role,
          text: r.content || '',
          mode: r.mode ?? undefined,
          provider: r.provider ?? undefined,
          sources,
        }
      })
      idRef.current = n + 1
      setMessages(mapped)
    } catch {
      setMessages([WELCOME_SECURITY])
      idRef.current = 2
    }
  }

  const startNewThread = () => {
    abortRef.current?.abort()
    const tid = newSecurityChatThreadId()
    setActiveThreadId(tid)
    setActiveDocChunks(null)
    setMessages([WELCOME_SECURITY])
    idRef.current = 2
    void refreshThreads()
  }

  const selectThread = async (threadId: string) => {
    if (pending) return
    abortRef.current?.abort()
    setActiveThreadId(threadId)
    setSecurityChatThreadId(threadId)
    setActiveDocChunks(null)
    await hydrateThread(threadId)
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pending, activeDocChunks])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const tid = getSecurityChatThreadId()
    setActiveThreadId(tid)
    void refreshThreads()
    if (tid) void hydrateThread(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  const openSourceByTitle = (sources: SecurityChatSource[] | undefined, title: string) => {
    if (!sources?.length) return
    const hit =
      sources.find((s) => s.title === title) ||
      sources.find((s) => title.includes(s.title) || s.title.includes(title))
    if (!hit) return
    const docId = hit.doc_id || hit.title
    openDocFromSources(sources, docId)
  }

  const renderReplyText = (m: ChatMessage) => {
    if (m.role !== 'ai' || !m.sources?.length) {
      return m.text
    }
    // Split on [출처: ...] markers so titles become clickable.
    const parts = m.text.split(/(\[출처:\s*[^\]]+\])/g)
    return parts.map((part, i) => {
      const match = part.match(/^\[출처:\s*([^\]]+)\]$/)
      if (!match) {
        return <span key={i}>{part}</span>
      }
      const title = match[1].trim()
      return (
        <button
          key={i}
          type="button"
          onClick={() => openSourceByTitle(m.sources, title)}
          className="mx-0.5 inline rounded bg-amber-50 px-1 font-medium text-amber-900 underline decoration-amber-600/60 hover:bg-amber-100"
        >
          [출처: {title}]
        </button>
      )
    })
  }

  const send = async (raw: string) => {
    const text = raw.trim()
    if (!text || pending) return

    // Capture ids BEFORE setState — reading idRef inside updaters races when
    // React batches user+ai appends (both got the same id → stream overwrote user bubble).
    const userId = ++idRef.current
    setMessages((prev) => [...prev, { id: userId, role: 'user', text }])
    setInput('')
    setPending(true)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const t0 = performance.now()

    const aiId = ++idRef.current
    setMessages((prev) => [
      ...prev,
      {
        id: aiId,
        role: 'ai',
        text: '',
        mode: 'security_rag',
        provider: 'vllm',
        sources: [],
      },
    ])

    let sawTerminal = false

    try {
      await postSecurityChatStream(
        { message: text },
        {
          onDelta: (piece) => {
            if (ac.signal.aborted) return
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId && m.role === 'ai'
                  ? { ...m, text: (m.text || '') + piece }
                  : m,
              ),
            )
          },
          onReplace: ({ reply, sources, mode, provider }) => {
            if (ac.signal.aborted) return
            sawTerminal = true
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId && m.role === 'ai'
                  ? {
                      ...m,
                      text: reply,
                      sources: sources ?? [],
                      mode: mode ?? m.mode,
                      provider: provider ?? m.provider,
                      elapsedMs: Math.round(performance.now() - t0),
                    }
                  : m,
              ),
            )
            setActiveDocChunks(null)
          },
          onDone: (res) => {
            if (ac.signal.aborted) return
            sawTerminal = true
            const sources = res.sources ?? []
            const elapsedMs = Math.round(performance.now() - t0)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId && m.role === 'ai'
                  ? {
                      ...m,
                      text:
                        res.reply ||
                        m.text ||
                        (res.error
                          ? `오류: ${res.error}`
                          : '응답이 비어 있습니다.'),
                      mode: res.mode ?? m.mode,
                      provider: res.provider ?? m.provider,
                      elapsedMs,
                      sources,
                    }
                  : m,
              ),
            )
            if (uniqueDocIdCount(sources) === 1) {
              const docId = sources[0].doc_id || sources[0].title
              openDocFromSources(sources, docId)
            }
            void refreshThreads()
          },
          onError: (data) => {
            if (ac.signal.aborted) return
            sawTerminal = true
            const elapsedMs = Math.round(performance.now() - t0)
            const failText = formatSecurityChatFailure({
              data,
              message: data.error,
            })
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId && m.role === 'ai'
                  ? {
                      ...m,
                      text: failText,
                      mode: 'template',
                      provider: 'offline',
                      elapsedMs,
                      sources: [],
                    }
                  : m,
              ),
            )
          },
        },
        ac.signal,
      )
      if (!sawTerminal && !ac.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId && m.role === 'ai' && !m.text
              ? {
                  ...m,
                  text: '응답이 비어 있습니다.',
                  mode: 'template',
                  provider: 'offline',
                  elapsedMs: Math.round(performance.now() - t0),
                }
              : m,
          ),
        )
      }
    } catch (err) {
      if (ac.signal.aborted) return
      const elapsedMs = Math.round(performance.now() - t0)
      let status: number | undefined
      let data: SecurityChatErrorBody | null = null
      let message = '요청에 실패했습니다.'
      let code: string | undefined
      if (axios.isAxiosError(err)) {
        status = err.response?.status
        const rawBody = err.response?.data
        if (rawBody && typeof rawBody === 'object') {
          data = rawBody as SecurityChatErrorBody
        }
        message = err.message || message
        code = err.code
      } else if (err && typeof err === 'object') {
        const e = err as {
          message?: string
          status?: number
          data?: SecurityChatErrorBody
        }
        message = e.message || message
        status = e.status
        data = e.data ?? null
      }
      console.warn('[security-chat] stream fail', { status, data, message, code })
      const failText = formatSecurityChatFailure({ status, data, message, code })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId && m.role === 'ai'
            ? {
                ...m,
                text: failText,
                mode: 'template',
                provider: 'offline',
                elapsedMs,
                sources: [],
              }
            : m,
        ),
      )
    } finally {
      if (!ac.signal.aborted) setPending(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  const shellClass =
    variant === 'embedded'
      ? `flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`
      : `flex h-[min(560px,70vh)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`

  return (
    <div className={shellClass}>
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <Shield size={18} className="text-amber-700" />
        <strong className="text-sm text-slate-800">보안 전용 챗봇</strong>
        <span className="ml-auto text-[10px] text-slate-400">
          vLLM + secure RAG · no cloud LLM
        </span>
      </div>

      <div
        className={`flex min-h-0 flex-1 ${
          activeDocChunks ? 'flex-col md:flex-row' : 'flex-col'
        }`}
      >
        <aside className="flex max-h-[28%] min-h-[88px] w-full shrink-0 flex-col border-b border-slate-200 bg-white md:max-h-none md:h-auto md:w-44 md:border-b-0 md:border-r">
          <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1.5">
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              대화
            </span>
            <button
              type="button"
              onClick={startNewThread}
              disabled={pending}
              className="rounded-md bg-amber-800 px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
            >
              새 대화
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {threads.length === 0 ? (
              <p className="px-2 py-2 text-[10px] text-slate-400">저장된 대화 없음</p>
            ) : (
              threads.map((t) => {
                const label =
                  (t.title && t.title.trim()) ||
                  `${t.id.slice(0, 8)}…`
                const active = t.id === activeThreadId
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={pending}
                    onClick={() => void selectThread(t.id)}
                    className={`mb-0.5 w-full rounded-md px-2 py-1.5 text-left text-[11px] leading-snug ${
                      active
                        ? 'bg-amber-50 font-medium text-amber-950'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                    title={t.id}
                  >
                    <span className="block truncate">{label}</span>
                    {t.updated_at ? (
                      <span className="block truncate text-[9px] text-slate-400">
                        {t.updated_at.replace('T', ' ').slice(0, 16)}
                      </span>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-slate-50/60 p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto rounded-br-md bg-amber-800 text-white'
                    : 'mr-auto rounded-bl-md border border-slate-200 bg-white text-slate-800'
                }`}
              >
                <div>{renderReplyText(m)}</div>
                {m.role === 'ai' && m.sources && m.sources.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {dedupeSourcesByDocId(m.sources).map((s) => {
                      const docId = s.doc_id || s.title
                      return (
                        <button
                          key={docId}
                          type="button"
                          onClick={() => openDocFromSources(m.sources, docId)}
                          className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
                        >
                          {s.title}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {m.role === 'ai' && m.mode ? (
                  <div className="mt-1 text-[10px] text-slate-400">
                    mode={m.mode}
                    {m.provider ? ` · provider=${m.provider}` : ''}
                    {m.elapsedMs != null
                      ? ` · ${formatWallElapsed(m.elapsedMs)}`
                      : ''}
                  </div>
                ) : null}
              </div>
            ))}
            {pending ? (
              <div className="mr-auto rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
                응답 생성 중…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="flex gap-2 border-t border-slate-200 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={pending}
              placeholder="기밀·보안 관련 질문을 입력하세요..."
              className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-amber-500 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="rounded-xl bg-amber-800 px-3 text-sm font-bold text-white disabled:opacity-50"
            >
              전송
            </button>
          </form>
        </div>

        {activeDocChunks ? (
          <div className="h-[40%] min-h-[180px] border-t border-slate-200 md:h-auto md:min-h-0 md:w-[min(42%,400px)] md:shrink-0 md:border-t-0">
            <SourcePanel
              chunks={activeDocChunks}
              onClose={() => setActiveDocChunks(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
