'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { FileText, Shield, X } from 'lucide-react'
import { useUiSettings } from '@/components/layout/AppShell'
import {
  formatSecurityChatFailure,
  getSecurityChatReadiness,
  deleteChatThread,
  getSecurityChatThreadId,
  listChatThreads,
  loadChatThreadMessages,
  newSecurityChatThreadId,
  postSecurityChatStream,
  setSecurityChatThreadId,
  type ChatThreadItem,
  type ChatThreadMessageItem,
  type SecurityChatErrorBody,
  type SecurityChatReadiness,
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

function monotonicNow(): number {
  return performance.now()
}

const WELCOME_SECURITY: ChatMessage = {
  id: 1,
  role: 'ai',
  text: '안녕하세요, YAHO입니다.\n\n보안·기밀 관련 질문을 도와드릴게요.',
  mode: 'template',
  provider: 'offline',
}

const THREAD_LIST_LIMIT = 20

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
  /** Fullscreen only: source chips, clickable [출처], and the document panel */
  showSources?: boolean
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

/** Latest assistant row after the matching user message (PC worker wrote it). */
function latestAssistantAfterUser(
  rows: ChatThreadMessageItem[],
  userText: string,
): ChatThreadMessageItem | null {
  const want = userText.trim()
  let lastUser = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].role === 'user' && (rows[i].content || '').trim() === want) {
      lastUser = i
    }
  }
  if (lastUser < 0) return null
  for (let i = lastUser + 1; i < rows.length; i++) {
    const r = rows[i]
    const role = (r.role || '').toLowerCase()
    if (role !== 'assistant' && role !== 'ai') continue
    if ((r.content || '').trim()) return r
  }
  return null
}

function SourcePanel({
  chunks,
  onClose,
  isDark,
}: {
  chunks: SecurityChatSource[]
  onClose: () => void
  isDark: boolean
}) {
  const head = chunks[0]
  if (!head) return null
  return (
    <aside
      className={`flex h-full min-h-0 w-full flex-col md:w-[min(100%,380px)] md:border-l ${
        isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
      }`}
    >
      <div
        className={`flex items-center gap-2 border-b px-3 py-2 ${
          isDark ? 'border-slate-700' : 'border-slate-200'
        }`}
      >
        <FileText
          size={16}
          className={`shrink-0 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}
        />
        <strong
          className={`min-w-0 flex-1 truncate text-sm ${
            isDark ? 'text-slate-100' : 'text-slate-800'
          }`}
        >
          {head.title}
        </strong>
        <button
          type="button"
          aria-label="출처 패널 닫기"
          onClick={onClose}
          className={`rounded-md p-1 ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <X size={14} />
        </button>
      </div>
      <div
        className={`space-y-2 overflow-y-auto p-3 text-[11px] ${
          isDark ? 'text-slate-300' : 'text-slate-600'
        }`}
      >
        <div>
          <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
            doc_id
          </span>
          : {head.doc_id}
        </div>
        {head.category ? (
          <div>
            <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              category
            </span>
            : {head.category}
          </div>
        ) : null}
        {head.process ? (
          <div>
            <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              process
            </span>
            : {head.process}
          </div>
        ) : null}
        {head.source_path ? (
          <div className="break-all">
            <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              path
            </span>
            : {head.source_path}
          </div>
        ) : null}
        <div>
          <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
            chunks
          </span>
          : {chunks.length}
        </div>
      </div>
      <div
        className={`min-h-0 flex-1 overflow-y-auto border-t p-3 ${
          isDark
            ? 'border-slate-700 bg-slate-950/60'
            : 'border-slate-100 bg-slate-50/80'
        }`}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          가져온 원문 청크
        </p>
        <div className="space-y-3">
          {chunks.map((c, idx) => (
            <div
              key={`${c.doc_id}-${c.chunk_index ?? idx}`}
              className={`rounded-lg border p-2.5 ${
                isDark
                  ? 'border-slate-600 bg-slate-800'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <p className="mb-1.5 text-[10px] font-medium text-slate-400">
                chunk
                {c.chunk_index != null ? ` #${c.chunk_index}` : ` ${idx + 1}`}
              </p>
              <pre
                className={`whitespace-pre-wrap break-words font-sans text-sm leading-relaxed ${
                  isDark ? 'text-slate-100' : 'text-slate-800'
                }`}
              >
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
 * Security-tab chatbot: AWS enqueues USER_SECURITY_MESSAGES; PC worker answers.
 * Display: SSE /security-chat/stream plus GET thread messages while pending.
 * Do not wire Groq / Gemini / general GlobalChatbot providers here.
 */
export default function SecurityChatbot({
  variant = 'page',
  className = '',
  hideHeader = false,
  newThreadNonce = 0,
  showSources = true,
}: Props) {
  const { isDark } = useUiSettings()
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  /** Active document panel: all chunks for one doc_id from the message sources. */
  const [activeDocChunks, setActiveDocChunks] = useState<SecurityChatSource[] | null>(
    null,
  )
  const [threads, setThreads] = useState<ChatThreadItem[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() =>
    getSecurityChatThreadId(),
  )
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_SECURITY])
  const [readiness, setReadiness] = useState<SecurityChatReadiness | null>(null)
  const idRef = useRef(2)
  const endRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const showSourcesRef = useRef(showSources)

  useEffect(() => {
    showSourcesRef.current = showSources
  }, [showSources])

  const openDocFromSources = (
    sources: SecurityChatSource[] | undefined,
    docId: string,
  ) => {
    if (!showSourcesRef.current) return
    if (!sources?.length || !docId) return
    const chunks = chunksForDocId(sources, docId)
    if (chunks.length) setActiveDocChunks(chunks)
  }

  const refreshReadiness = async () => {
    try {
      setReadiness(await getSecurityChatReadiness())
    } catch {
      setReadiness({
        ready: false,
        status: 'degraded',
        message: '보안 챗봇 준비 상태를 확인할 수 없습니다.',
        checks: {},
        checked_at: new Date().toISOString(),
      })
    }
  }

  const refreshThreads = async () => {
    let api: ChatThreadItem[] = []
    try {
      api = await listChatThreads({ channel: 'security' })
    } catch {
      /* soft-fail: list optional when logged out / DB down */
    }
    const merged = api
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    setThreads(merged.slice(0, THREAD_LIST_LIMIT))
  }

  const deleteThread = async (threadId: string) => {
    if (pending) return
    try {
      await deleteChatThread(threadId)
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
      if (activeThreadId === threadId || getSecurityChatThreadId() === threadId) {
        startNewThread()
        return
      }
      void refreshThreads()
    } catch (err) {
      console.warn('[security-chat] server delete failed', err)
      void refreshThreads()
    }
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
        void refreshThreads()
        return
      }
    } catch {
      /* server is the only persistence source for security chat */
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
    const timer = window.setTimeout(() => {
      const tid = getSecurityChatThreadId()
      void refreshThreads()
      if (tid) void hydrateThread(tid)
      void refreshReadiness()
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!showSources) {
        setActiveDocChunks(null)
        return
      }
      const lastAi = [...messages].reverse().find(
        (m) => m.role === 'ai' && Boolean(m.sources?.length),
      )
      if (!lastAi?.sources?.length) return
      if (uniqueDocIdCount(lastAi.sources) !== 1) return
      const docId = lastAi.sources[0].doc_id || lastAi.sources[0].title
      const chunks = chunksForDocId(lastAi.sources, docId)
      if (chunks.length) setActiveDocChunks(chunks)
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- expand/collapse only
  }, [showSources])

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
    if (m.role !== 'ai' || !m.sources?.length || !showSources) {
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
          className={`mx-0.5 inline rounded px-1 font-medium underline decoration-amber-600/60 ${
            isDark
              ? 'bg-amber-950/60 text-amber-200 hover:bg-amber-900'
              : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
          }`}
        >
          [출처: {title}]
        </button>
      )
    })
  }

  const send = async (raw: string) => {
    const text = raw.trim()
    if (!text || pending) return
    console.info('[security-chat] POST /api/security-chat/stream')

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
    const t0 = monotonicNow()

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
    let streamFailText: string | null = null
    let streamEndedAt: number | null = null
    const takeTerminal = (): boolean => {
      if (sawTerminal) return false
      sawTerminal = true
      return true
    }

    const fillAiBubble = (opts: {
      reply: string
      sources?: SecurityChatSource[] | null
      mode?: string | null
      provider?: string | null
      errorText?: string
    }) => {
      if (!takeTerminal()) return
      const sources = Array.isArray(opts.sources) ? opts.sources : []
      const elapsedMs = Math.round(monotonicNow() - t0)
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === aiId && m.role === 'ai'
            ? {
                ...m,
                text:
                  opts.errorText ||
                  opts.reply ||
                  m.text ||
                  '응답이 비어 있습니다.',
                sources: opts.errorText ? [] : sources,
                mode: opts.errorText ? 'template' : (opts.mode ?? m.mode),
                provider: opts.errorText
                  ? 'offline'
                  : (opts.provider ?? m.provider),
                elapsedMs,
              }
            : m,
        )
        queueMicrotask(() => void refreshThreads())
        return next
      })
      if (!opts.errorText && uniqueDocIdCount(sources) === 1) {
        const docId = sources[0].doc_id || sources[0].title
        openDocFromSources(sources, docId)
      } else if (showSourcesRef.current) {
        setActiveDocChunks(null)
      }
    }

    const pollDb = async () => {
      const deadline = t0 + 180_000
      while (!ac.signal.aborted && !sawTerminal && monotonicNow() < deadline) {
        if (streamEndedAt != null && monotonicNow() - streamEndedAt > 20_000) {
          return
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 400)
        })
        if (ac.signal.aborted || sawTerminal) return
        try {
          const rows = await loadChatThreadMessages({ thread_id: tid })
          const hit = latestAssistantAfterUser(rows, text)
          if (!hit) continue
          fillAiBubble({
            reply: hit.content || '',
            sources: hit.sources,
            mode: hit.mode,
            provider: hit.provider,
          })
          ac.abort()
          return
        } catch {
          /* display poll only; SSE may still complete */
        }
      }
    }

    const pollPromise = pollDb()

    try {
      await postSecurityChatStream(
        { message: text },
        {
          onDelta: (piece) => {
            if (ac.signal.aborted || sawTerminal) return
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId && m.role === 'ai'
                  ? { ...m, text: (m.text || '') + piece }
                  : m,
              ),
            )
          },
          onReplace: ({ reply, sources, mode, provider }) => {
            if (ac.signal.aborted && !sawTerminal) return
            fillAiBubble({ reply, sources, mode, provider })
          },
          onDone: (res) => {
            if (ac.signal.aborted && !sawTerminal) return
            fillAiBubble({
              reply: res.reply || '',
              sources: res.sources,
              mode: res.mode,
              provider: res.provider,
              errorText: res.error
                ? formatSecurityChatFailure({
                    data: { error: res.error, stage: res.stage },
                    message: readiness?.message,
                  })
                : undefined,
            })
          },
          onError: (data) => {
            if (ac.signal.aborted && !sawTerminal) return
            fillAiBubble({
              reply: '',
              errorText: formatSecurityChatFailure({
                data,
                message: data.error,
              }),
            })
          },
        },
        ac.signal,
      )
      if (!sawTerminal && !ac.signal.aborted) {
        fillAiBubble({
          reply: '',
          errorText: '응답이 비어 있습니다.',
        })
      }
    } catch (err) {
      if (!ac.signal.aborted) {
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
        streamFailText = formatSecurityChatFailure({
          status,
          data,
          message,
          code,
        })
        streamEndedAt = monotonicNow()
      }
    } finally {
      try {
        await pollPromise
      } catch {
        /* ignore */
      }
      if (!sawTerminal && streamFailText) {
        fillAiBubble({ reply: '', errorText: streamFailText })
      }
      if (abortRef.current === ac) setPending(false)
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
      ? `flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border shadow-sm ${
          isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        } ${className}`
      : `flex h-[min(560px,70vh)] flex-col overflow-hidden rounded-2xl border shadow-sm ${
          isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        } ${className}`

  return (
    <div className={shellClass}>
      {hideHeader ? null : (
        <div
          className={`flex flex-none items-center gap-3 border-b px-4 py-3 ${
            isDark ? 'border-amber-800' : 'border-amber-200'
          }`}
        >
          <div
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isDark ? 'bg-amber-900/60 text-amber-200' : 'bg-amber-100 text-amber-800'
            }`}
          >
            <Shield size={18} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <strong
                className={`truncate text-base font-bold ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                보안 전용 챗봇
              </strong>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isDark ? 'bg-amber-900/60 text-amber-200' : 'bg-amber-100 text-amber-800'
                }`}
              >
                보안 상담
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={startNewThread}
            disabled={pending}
            className={`inline-flex h-9 shrink-0 items-center rounded-lg border px-2.5 text-[11px] font-medium disabled:opacity-50 ${
              isDark
                ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            새 대화
          </button>
        </div>
      )}

      {readiness && !readiness.ready ? (
        <div
          className={`flex-none border-b px-3 py-2 text-xs ${
            isDark
              ? 'border-amber-800 bg-amber-950/50 text-amber-100'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span>{readiness.message}</span>
            <button
              type="button"
              onClick={() => void refreshReadiness()}
              className="shrink-0 rounded border border-current px-2 py-0.5 text-[11px]"
            >
              다시 확인
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={`flex min-h-0 flex-1 ${
          showSources && activeDocChunks ? 'flex-col md:flex-row' : 'flex-col'
        }`}
      >
        {hideHeader ? (
          <div
            className={`flex flex-none flex-col border-b ${
              isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-3 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                최근 대화
              </span>
              {threads.length > 0 ? (
                <span className="text-[10px] text-slate-400">{threads.length}개</span>
              ) : null}
            </div>
            {threads.length > 0 ? (
              <div className="flex max-h-24 gap-1.5 overflow-x-auto px-2 py-1.5">
                {threads.map((t) => {
                  const label = (t.title && t.title.trim()) || t.id.slice(0, 8)
                  const active = t.id === activeThreadId
                  return (
                    <div
                      key={t.id}
                      className={`inline-flex max-w-[168px] shrink-0 items-center gap-0.5 rounded-full pl-2.5 ${
                        active
                          ? 'bg-amber-500 text-white'
                          : isDark
                            ? 'bg-slate-800 text-slate-200'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void selectThread(t.id)}
                        className={`min-w-0 truncate py-1 text-[10px] ${
                          active
                            ? 'text-white'
                            : isDark
                              ? 'hover:text-white'
                              : 'hover:text-slate-900'
                        }`}
                        title={
                          t.updated_at
                            ? `${label} · ${formatThreadTime(t.updated_at)}`
                            : label
                        }
                      >
                        {label}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`${label} 대화 삭제`}
                        onClick={() => deleteThread(t.id)}
                        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          active
                            ? 'text-amber-100 hover:bg-amber-600 hover:text-white'
                            : isDark
                              ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'
                              : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        <X size={10} aria-hidden />
                      </button>
                    </div>
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
          <aside
            className={`flex max-h-[28%] min-h-[88px] w-full shrink-0 flex-col border-b md:max-h-none md:h-auto md:w-44 md:border-b-0 md:border-r ${
              isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
            }`}
          >
            <div
              className={`flex items-center gap-1 border-b px-2 py-1.5 ${
                isDark ? 'border-slate-700' : 'border-slate-100'
              }`}
            >
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                최근 대화
              </span>
              <button
                type="button"
                onClick={startNewThread}
                disabled={pending}
                className={`inline-flex h-7 shrink-0 items-center rounded-lg border px-2 text-[10px] font-medium disabled:opacity-50 ${
                  isDark
                    ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
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
                    <div
                      key={t.id}
                      className={`mb-0.5 flex items-start gap-1 rounded-md ${
                        active
                          ? isDark
                            ? 'bg-amber-950/50'
                            : 'bg-amber-50'
                          : isDark
                            ? 'hover:bg-slate-800'
                            : 'hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void selectThread(t.id)}
                        className={`min-w-0 flex-1 px-2 py-1.5 text-left text-[11px] leading-snug ${
                          active
                            ? isDark
                              ? 'font-medium text-amber-100'
                              : 'font-medium text-amber-950'
                            : isDark
                              ? 'text-slate-300'
                              : 'text-slate-600'
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
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`${label} 대화 삭제`}
                        onClick={() => deleteThread(t.id)}
                        className={`mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                          isDark
                            ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'
                            : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className={`flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto px-4 py-4 ${
              isDark ? 'bg-slate-950/60' : 'bg-slate-50/60'
            }`}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`break-words whitespace-pre-wrap px-3.5 py-3 text-sm leading-6 ${
                  m.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-amber-500 text-white'
                    : isDark
                      ? 'mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-amber-800 bg-amber-950/50 text-slate-100'
                      : 'mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-amber-200 bg-amber-50/70 text-slate-800'
                }`}
              >
                <div>{renderReplyText(m)}</div>
                {m.role === 'ai' && showSources && m.sources && m.sources.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {dedupeSourcesByDocId(m.sources).map((s) => {
                      const docId = s.doc_id || s.title
                      return (
                        <button
                          key={docId}
                          type="button"
                          onClick={() => openDocFromSources(m.sources, docId)}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            isDark
                              ? 'border-amber-800 bg-amber-950/60 text-amber-200 hover:bg-amber-900'
                              : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                          }`}
                        >
                          {s.title}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {m.role === 'ai' && m.elapsedMs != null ? (
                  <div className="mt-1 text-[10px] text-slate-400">
                    {formatWallElapsed(m.elapsedMs)}
                  </div>
                ) : null}
              </div>
            ))}
            {pending ? (
              <div
                className={`mr-auto max-w-[88%] rounded-2xl rounded-tl-md border px-3.5 py-3 text-sm ${
                  isDark
                    ? 'border-amber-800 bg-slate-800 text-slate-400'
                    : 'border-amber-200 bg-white text-slate-400'
                }`}
              >
                응답 생성 중…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={onSubmit}
            className={`flex min-w-0 flex-none items-center gap-2 border-t p-3 ${
              isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
            }`}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={pending}
              placeholder="보안 관련 질문을 입력하세요. 민감정보는 제외해 주세요."
              className={`h-11 min-h-[44px] min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm leading-5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 ${
                isDark
                  ? 'border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-500 disabled:bg-slate-800'
                  : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50'
              }`}
            />
            <button
              type="submit"
              aria-label="메시지 전송"
              disabled={pending || !input.trim()}
              className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-amber-500 px-3.5 text-sm font-bold text-white transition-colors hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              전송
            </button>
          </form>
        </div>

        {showSources && activeDocChunks ? (
          <div
            className={`h-[40%] min-h-[180px] border-t md:h-auto md:min-h-0 md:w-[min(42%,400px)] md:shrink-0 md:border-t-0 ${
              isDark ? 'border-slate-700' : 'border-slate-200'
            }`}
          >
            <SourcePanel
              chunks={activeDocChunks}
              onClose={() => setActiveDocChunks(null)}
              isDark={isDark}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
