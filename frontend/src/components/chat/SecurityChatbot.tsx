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

const LOCAL_THREADS_KEY = 'kdt_security_chat_recent_threads'
const LOCAL_THREADS_MAX = 20

type LocalStoredMsg = {
  role: ChatRole
  text: string
  mode?: string
  provider?: string
  sources?: SecurityChatSource[]
  elapsedMs?: number
}

type LocalThreadStore = {
  id: string
  title: string
  updated_at: string
  messages: LocalStoredMsg[]
}

function readLocalThreads(): LocalThreadStore[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOCAL_THREADS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as LocalThreadStore[]) : []
  } catch {
    return []
  }
}

function writeLocalThreads(list: LocalThreadStore[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    LOCAL_THREADS_KEY,
    JSON.stringify(list.slice(0, LOCAL_THREADS_MAX)),
  )
}

function titleFromMessages(msgs: { role: string; text: string }[]): string {
  const firstUser = msgs.find((m) => m.role === 'user' && m.text.trim())
  if (!firstUser) return '새 대화'
  const t = firstUser.text.trim().replace(/\s+/g, ' ')
  return t.length > 28 ? `${t.slice(0, 28)}…` : t
}

function upsertLocalThread(thread: LocalThreadStore) {
  const prev = readLocalThreads().filter((t) => t.id !== thread.id)
  writeLocalThreads([thread, ...prev])
}

function getLocalThread(id: string): LocalThreadStore | null {
  return readLocalThreads().find((t) => t.id === id) ?? null
}

function formatThreadTime(iso?: string | null): string {
  if (!iso) return ''
  return iso.replace('T', ' ').slice(0, 16)
}

type Props = {
  /** page = fixed height card; embedded = fill parent (popup or fullscreen shell) */
  variant?: 'page' | 'embedded'
  className?: string
  /** Parent shell already shows title / mode toggle */
  hideHeader?: boolean
  /** Increment from parent to start a new security thread */
  newThreadNonce?: number
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
  hideHeader = false,
  newThreadNonce = 0,
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
    let api: ChatThreadItem[] = []
    try {
      api = await listChatThreads({ channel: 'security' })
    } catch {
      /* soft-fail: list optional when logged out / DB down */
    }
    const byId = new Map<string, ChatThreadItem>()
    for (const t of api) byId.set(t.id, t)
    for (const t of readLocalThreads()) {
      const existing = byId.get(t.id)
      if (
        !existing ||
        (t.updated_at &&
          (!existing.updated_at || t.updated_at > existing.updated_at))
      ) {
        byId.set(t.id, {
          id: t.id,
          user_id: existing?.user_id ?? 'local',
          channel: 'security',
          title: t.title || existing?.title,
          updated_at: t.updated_at || existing?.updated_at,
          created_at: existing?.created_at ?? t.updated_at,
        })
      } else if (existing && !existing.title && t.title) {
        byId.set(t.id, { ...existing, title: t.title })
      }
    }
    const merged = Array.from(byId.values()).sort((a, b) =>
      (b.updated_at || '').localeCompare(a.updated_at || ''),
    )
    setThreads(merged.slice(0, LOCAL_THREADS_MAX))
  }

  const applyStoredMessages = (rows: LocalStoredMsg[]) => {
    let n = 1
    const mapped: ChatMessage[] = rows.map((r) => {
      n += 1
      return {
        id: n,
        role: r.role === 'user' ? 'user' : 'ai',
        text: r.text || '',
        mode: r.mode,
        provider: r.provider,
        sources: r.sources,
        elapsedMs: r.elapsedMs,
      }
    })
    idRef.current = n + 1
    setMessages(mapped.length ? mapped : [WELCOME_SECURITY])
  }

  const persistCurrentThread = (msgs: ChatMessage[], threadId?: string | null) => {
    const tid = threadId ?? getSecurityChatThreadId() ?? activeThreadId
    if (!tid) return
    const meaningful = msgs.filter((m) => m.text.trim())
    if (!meaningful.some((m) => m.role === 'user')) return
    upsertLocalThread({
      id: tid,
      title: titleFromMessages(meaningful),
      updated_at: new Date().toISOString(),
      messages: meaningful.map((m) => ({
        role: m.role,
        text: m.text,
        mode: m.mode,
        provider: m.provider,
        sources: m.sources,
        elapsedMs: m.elapsedMs,
      })),
    })
    void refreshThreads()
  }

  const hydrateThread = async (threadId: string) => {
    try {
      const rows = await loadChatThreadMessages({ thread_id: threadId })
      if (rows.length) {
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
        upsertLocalThread({
          id: threadId,
          title: titleFromMessages(
            mapped.map((m) => ({ role: m.role, text: m.text })),
          ),
          updated_at: new Date().toISOString(),
          messages: mapped.map((m) => ({
            role: m.role,
            text: m.text,
            mode: m.mode,
            provider: m.provider,
            sources: m.sources,
          })),
        })
        void refreshThreads()
        return
      }
    } catch {
      /* fall through to local */
    }
    const local = getLocalThread(threadId)
    if (local?.messages?.length) {
      applyStoredMessages(local.messages)
      return
    }
    setMessages([WELCOME_SECURITY])
    idRef.current = 2
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

  useEffect(() => {
    if (!newThreadNonce) return
    startNewThread()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parent-driven new chat only
  }, [newThreadNonce])

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

    let tid = getSecurityChatThreadId()
    if (!tid) tid = newSecurityChatThreadId()
    setActiveThreadId(tid)

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
            setMessages((prev) => {
              const next = prev.map((m) =>
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
              )
              queueMicrotask(() =>
                persistCurrentThread(next, getSecurityChatThreadId() ?? tid),
              )
              return next
            })
            setActiveDocChunks(null)
          },
          onDone: (res) => {
            if (ac.signal.aborted) return
            sawTerminal = true
            const sources = res.sources ?? []
            const elapsedMs = Math.round(performance.now() - t0)
            setMessages((prev) => {
              const next = prev.map((m) =>
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
              )
              queueMicrotask(() =>
                persistCurrentThread(next, getSecurityChatThreadId() ?? tid),
              )
              return next
            })
            if (uniqueDocIdCount(sources) === 1) {
              const docId = sources[0].doc_id || sources[0].title
              openDocFromSources(sources, docId)
            }
          },
          onError: (data) => {
            if (ac.signal.aborted) return
            sawTerminal = true
            const elapsedMs = Math.round(performance.now() - t0)
            const failText = formatSecurityChatFailure({
              data,
              message: data.error,
            })
            setMessages((prev) => {
              const next = prev.map((m) =>
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
              )
              queueMicrotask(() => persistCurrentThread(next, tid))
              return next
            })
          },
        },
        ac.signal,
      )
      if (!sawTerminal && !ac.signal.aborted) {
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === aiId && m.role === 'ai' && !m.text
              ? {
                  ...m,
                  text: '응답이 비어 있습니다.',
                  mode: 'template',
                  provider: 'offline',
                  elapsedMs: Math.round(performance.now() - t0),
                }
              : m,
          )
          queueMicrotask(() => persistCurrentThread(next, tid))
          return next
        })
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
      setMessages((prev) => {
        const next = prev.map((m) =>
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
        )
        queueMicrotask(() => persistCurrentThread(next, tid))
        return next
      })
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
      {hideHeader ? null : (
        <div className="flex flex-none items-center gap-3 border-b border-amber-200 px-4 py-3">
          <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <Shield size={18} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <strong className="truncate text-base font-bold text-slate-900">
                보안 전용 챗봇
              </strong>
              <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                보안 상담
              </span>
            </div>
            <p className="truncate text-xs text-slate-500">보안 문서 · 로컬 vLLM</p>
          </div>
          <button
            type="button"
            onClick={startNewThread}
            disabled={pending}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            새 대화
          </button>
        </div>
      )}

      <div
        className={`flex min-h-0 flex-1 ${
          activeDocChunks ? 'flex-col md:flex-row' : 'flex-col'
        }`}
      >
        {hideHeader ? (
          <div className="flex flex-none flex-col border-b border-slate-100 bg-white">
            <div className="flex items-center justify-between gap-2 px-3 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                최근 대화
              </span>
              {threads.length > 0 ? (
                <span className="text-[10px] text-slate-400">{threads.length}개</span>
              ) : null}
            </div>
            {threads.length > 0 ? (
              <div className="flex max-h-24 gap-1 overflow-x-auto px-2 py-1.5">
                {threads.map((t) => {
                  const label = (t.title && t.title.trim()) || t.id.slice(0, 8)
                  const active = t.id === activeThreadId
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={pending}
                      onClick={() => void selectThread(t.id)}
                      className={`max-w-[140px] shrink-0 truncate rounded-full px-2.5 py-1 text-[10px] ${
                        active
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={
                        t.updated_at
                          ? `${label} · ${formatThreadTime(t.updated_at)}`
                          : label
                      }
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="px-3 pb-2 text-[10px] text-slate-400">
                메시지를 보내면 여기에 저장됩니다
              </p>
            )}
          </div>
        ) : (
          <aside className="flex max-h-[28%] min-h-[88px] w-full shrink-0 flex-col border-b border-slate-200 bg-white md:max-h-none md:h-auto md:w-44 md:border-b-0 md:border-r">
            <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1.5">
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                최근 대화
              </span>
              <button
                type="button"
                onClick={startNewThread}
                disabled={pending}
                className="inline-flex h-7 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                새 대화
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {threads.length === 0 ? (
                <p className="px-2 py-2 text-[10px] text-slate-400">
                  저장된 대화 없음 · 전송 시 자동 저장
                </p>
              ) : (
                threads.map((t) => {
                  const label =
                    (t.title && t.title.trim()) || `${t.id.slice(0, 8)}…`
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
                          {formatThreadTime(t.updated_at)}
                        </span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto bg-slate-50/60 px-4 py-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`break-words whitespace-pre-wrap px-3.5 py-3 text-sm leading-6 ${
                  m.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-amber-500 text-white'
                    : 'mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-amber-200 bg-amber-50/70 text-slate-800'
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
              <div className="mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-amber-200 bg-white px-3.5 py-3 text-sm text-slate-400">
                응답 생성 중…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={onSubmit}
            className="flex flex-none items-end gap-2 border-t border-slate-200 bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={pending}
              placeholder="보안 관련 질문을 입력하세요. 민감정보는 제외해 주세요."
              className="h-11 min-h-[44px] flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50"
            />
            <button
              type="submit"
              aria-label="메시지 전송"
              disabled={pending || !input.trim()}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-sm font-bold text-white transition-colors hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
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
