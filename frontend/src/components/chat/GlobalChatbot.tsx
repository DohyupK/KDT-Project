'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import Link from 'next/link'
import { Maximize2, MessageCircle, Minimize2, Shield, X } from 'lucide-react'
import { useUiSettings } from '@/components/layout/AppShell'
import SecurityChatbot from '@/components/chat/SecurityChatbot'
import {
  postApproveControl,
  postOutcomeControl,
  postRevertControl,
  postChatStream,
  getChatThreadId,
  listChatThreads,
  loadChatThreadMessages,
  newChatThreadId,
  setChatThreadId,
  type ChatFeatures,
  type ChatRecommendation,
  type ChatThreadItem,
} from '@/api/aiApi'
import { usePageChatOptional } from '@/context/PageChatContext'
import {
  parseOutcomeCapacityInput,
  parseOutcomeResidualLiInput,
} from '@/lib/outcomeBounds'
import {
  readLlmProvidersCache,
  type LlmKeyPublic,
} from '@/api/llmKeysApi'

type ChatRole = 'user' | 'ai'

type ChatMessage = {
  id: number
  role: ChatRole
  text: string
  mode?: string
  recommendation?: ChatRecommendation | null
  approved?: boolean
  approving?: boolean
  /** After approve: event id for outcome form */
  eventId?: number | string | null
  /** Undo window finished without revert */
  outcomeEligible?: boolean
  /** Undo applied — no outcome form */
  reverted?: boolean
  outcomeSaved?: boolean
  outcomeSaving?: boolean
}

type UndoSnack = {
  eventId: number | string
  msgId: number
  secondsLeft: number
}

const UNDO_SECONDS = 5

const USAGE_GUIDE_TEXT =
  '사용 안내입니다.\n\n' +
  '1. 지금 보고 있는 화면(Main·Dashboard·Issue·Knowledge·SPC) 데이터를 기준으로 질문하세요.\n' +
  '2. 목록·카드·버튼을 누른 뒤 질문하면 그 항목을 우선 참조합니다.\n' +
  '3. 공개·대외비 문서는 RAG로 검색됩니다. 기밀은 보안 탭을 이용하세요.\n' +
  '4. 추가 질문으로 모델 진단·What-if를 요청할 수 있습니다.\n' +
  '5. 보안·기밀은 /security 탭을 이용해 주세요.'

const WELCOME_GENERAL: ChatMessage = {
  id: 1,
  role: 'ai',
  text:
    '안녕하세요, YAHO입니다.\n\n지금 보고 있는 화면에 대해 질문해 주세요. 화면 데이터와 문서를 참고해 답합니다.',
}

type ChatMode = 'general' | 'secure'

const LOCAL_THREADS_KEY = 'kdt_general_chat_recent_threads'
const DELETED_THREADS_KEY = 'kdt_general_chat_deleted_threads'
const LOCAL_THREADS_MAX = 20

type LocalStoredMsg = {
  role: ChatRole
  text: string
  mode?: string
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

function readDeletedThreadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(DELETED_THREADS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function markThreadDeleted(id: string) {
  if (typeof window === 'undefined') return
  const next = readDeletedThreadIds()
  next.add(id)
  window.localStorage.setItem(
    DELETED_THREADS_KEY,
    JSON.stringify(Array.from(next).slice(-100)),
  )
}

function deleteLocalThread(id: string) {
  writeLocalThreads(readLocalThreads().filter((t) => t.id !== id))
}

function formatThreadTime(iso?: string | null): string {
  if (!iso) return ''
  return iso.replace('T', ' ').slice(0, 16)
}

function pushChatPath(path: string) {
  if (typeof window === 'undefined') return
  if (window.location.pathname === path) return
  window.history.pushState(null, '', path)
}

export default function GlobalChatbot() {
  const returnPathRef = useRef('/main')
  const { isDark } = useUiSettings()
  const pageChat = usePageChatOptional()
  const [chatOpen, setChatOpen] = useState(false)

  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [llmMode, setLlmMode] = useState('auto')
  const [llmOptions, setLlmOptions] = useState<LlmKeyPublic[]>([])
  const [undoSnack, setUndoSnack] = useState<UndoSnack | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [outcomeDefect, setOutcomeDefect] = useState<'0' | '1' | ''>('')
  const [outcomeCapacity, setOutcomeCapacity] = useState('')
  const [outcomeResidual, setOutcomeResidual] = useState('')
  /** Popup vs fullscreen — independent of general/secure mode. */
  const [isExpanded, setIsExpanded] = useState(false)
  const [chatMode, setChatMode] = useState<ChatMode>('general')
  const [secureNewThreadNonce, setSecureNewThreadNonce] = useState(0)
  const [threads, setThreads] = useState<ChatThreadItem[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_GENERAL])
  const idRef = useRef(2)
  const endRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshThreads = async () => {
    let api: ChatThreadItem[] = []
    try {
      api = await listChatThreads({ channel: 'general' })
    } catch {
      /* soft-fail */
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
          channel: 'general',
          title: t.title || existing?.title,
          updated_at: t.updated_at || existing?.updated_at,
          created_at: existing?.created_at ?? t.updated_at,
        })
      } else if (existing && !existing.title && t.title) {
        byId.set(t.id, { ...existing, title: t.title })
      }
    }
    const deleted = readDeletedThreadIds()
    const merged = Array.from(byId.values())
      .filter((t) => !deleted.has(t.id))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    setThreads(merged.slice(0, LOCAL_THREADS_MAX))
  }

  const deleteThread = (threadId: string) => {
    if (pending) return
    deleteLocalThread(threadId)
    markThreadDeleted(threadId)
    setThreads((prev) => prev.filter((t) => t.id !== threadId))
    if (activeThreadId === threadId || getChatThreadId() === threadId) {
      startNewThread()
      return
    }
    void refreshThreads()
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
      }
    })
    idRef.current = n + 1
    setMessages(mapped.length ? mapped : [WELCOME_GENERAL])
  }

  const persistCurrentThread = (msgs: ChatMessage[], threadId?: string | null) => {
    const tid = threadId ?? getChatThreadId() ?? activeThreadId
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
          return {
            id: n,
            role: r.role === 'user' ? 'user' : 'ai',
            text: r.content || '',
            mode: r.mode ?? undefined,
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
    setMessages([WELCOME_GENERAL])
    idRef.current = 2
  }

  const startNewThread = () => {
    abortRef.current?.abort()
    const tid = newChatThreadId()
    setActiveThreadId(tid)
    setMessages([WELCOME_GENERAL])
    idRef.current = 2
    void refreshThreads()
  }

  const selectThread = async (threadId: string) => {
    if (pending) return
    abortRef.current?.abort()
    setActiveThreadId(threadId)
    setChatThreadId(threadId)
    await hydrateThread(threadId)
  }

  useEffect(() => {
    if (!chatOpen) return
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatOpen, pending, undoSnack])

  // Provider list: localStorage cache only (refreshed on security-tab Save)
  useEffect(() => {
    const cached = readLlmProvidersCache()
    if (cached?.keys) setLlmOptions(cached.keys)
  }, [chatOpen])

  useEffect(() => {
    if (!chatOpen) return
    const tid = getChatThreadId()
    setActiveThreadId(tid)
    void refreshThreads()
    if (tid) void hydrateThread(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when panel opens
  }, [chatOpen])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (undoTimerRef.current) clearInterval(undoTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isExpanded) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isExpanded])

  useEffect(() => {
    const onPop = () => {
      const secure = window.location.pathname === '/security'
      setChatMode(secure ? 'secure' : 'general')
      if (secure) setChatOpen(true)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const clearUndoTimer = () => {
    if (undoTimerRef.current) {
      clearInterval(undoTimerRef.current)
      undoTimerRef.current = null
    }
  }

  const startUndoWindow = (eventId: number | string, msgId: number) => {
    clearUndoTimer()
    setUndoSnack({ eventId, msgId, secondsLeft: UNDO_SECONDS })
    undoTimerRef.current = setInterval(() => {
      setUndoSnack((prev) => {
        if (!prev) return null
        if (prev.secondsLeft <= 1) {
          clearUndoTimer()
          setMessages((msgs) =>
            msgs.map((m) =>
              m.id === prev.msgId && !m.reverted
                ? { ...m, outcomeEligible: true }
                : m,
            ),
          )
          return null
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 }
      })
    }, 1000)
  }

  const resolveFeatures = (explicit: ChatFeatures | null | undefined) =>
    explicit ?? null

  const send = async (raw: string, features: ChatFeatures | null = null) => {
    const text = raw.trim()
    if (!text || pending) return

    let tid = getChatThreadId()
    if (!tid) tid = newChatThreadId()
    setActiveThreadId(tid)

    const attached = resolveFeatures(features)

    idRef.current += 1
    const userId = idRef.current
    setMessages((prev) => [...prev, { id: userId, role: 'user', text }])
    setInput('')
    setPending(true)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const page_context = pageChat?.getChatPageContext()
      idRef.current += 1
      const aiId = idRef.current
      setMessages((prev) => [
        ...prev,
        { id: aiId, role: 'ai', text: '', mode: 'llm' },
      ])

      let streamed = ''
      await postChatStream(
        {
          message: text,
          features: attached ?? undefined,
          llm_mode: llmMode || 'auto',
          page_context: page_context
            ? {
                route: page_context.route,
                focusId: page_context.focusId,
                focusPayload: page_context.focusPayload,
                pagePayload: page_context.pagePayload,
                supplementHints: page_context.supplementHints,
              }
            : undefined,
          // Models run whenever features exist on the AI side.
          enable_api_llm: Boolean(attached) || undefined,
        },
        {
          onDelta: (chunk) => {
            streamed += chunk
            setMessages((prev) =>
              prev.map((m) => (m.id === aiId ? { ...m, text: streamed } : m)),
            )
          },
          onDone: (data) => {
            const replyTid = data.thread_id || getChatThreadId() || tid
            if (replyTid) {
              setActiveThreadId(replyTid)
              setChatThreadId(replyTid)
            }
            const replyText =
              (typeof data.reply === 'string' && data.reply.trim()
                ? data.reply
                : '') ||
              streamed ||
              (data.error ? `오류: ${data.error}` : '응답이 비어 있습니다.')
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === aiId
                  ? {
                      ...m,
                      // Prefer normalized done.reply over raw streamed deltas
                      text: replyText,
                      mode: data.mode,
                      recommendation: data.recommendation ?? null,
                    }
                  : m,
              )
              queueMicrotask(() => persistCurrentThread(next, replyTid))
              return next
            })
          },
          onError: (msg) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId
                  ? {
                      ...m,
                      text:
                        m.text ||
                        `챗봇 연결에 실패했습니다. backend(:3001) · ai-service(:8800)를 확인해 주세요.\n(${msg})`,
                    }
                  : m,
              ),
            )
          },
        },
        ac.signal,
      )
      if (ac.signal.aborted) return
    } catch (err) {
      if (ac.signal.aborted) return
      let detail = '요청에 실패했습니다.'
      if (err && typeof err === 'object') {
        const ax = err as {
          message?: string
          response?: { data?: { detail?: unknown; error?: unknown }; status?: number }
        }
        const serverDetail = ax.response?.data?.detail ?? ax.response?.data?.error
        if (typeof serverDetail === 'string') detail = serverDetail
        else if (ax.message) detail = ax.message
        if (ax.response?.status) detail = `[${ax.response.status}] ${detail}`
      }
      idRef.current += 1
      const failMsg: ChatMessage = {
        id: idRef.current,
        role: 'ai',
        text:
          `챗봇 연결에 실패했습니다. backend(:3001) · ai-service(:8800)를 확인해 주세요.\n(${detail})`,
      }
      setMessages((prev) => {
        // Replace empty streaming bubble if present
        const last = prev[prev.length - 1]
        if (last?.role === 'ai' && !last.text) {
          const next = [...prev.slice(0, -1), { ...failMsg, id: last.id }]
          queueMicrotask(() => persistCurrentThread(next, tid))
          return next
        }
        const next = [...prev, failMsg]
        queueMicrotask(() => persistCurrentThread(next, tid))
        return next
      })
    } finally {
      if (!ac.signal.aborted) setPending(false)
    }
  }

  const approveRecommendation = async (msgId: number, recommendation: ChatRecommendation) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, approving: true } : m)),
    )
    try {
      const lotId =
        recommendation.baseline.features.id ??
        recommendation.suggestion?.after_features.id ??
        null
      const res = await postApproveControl({
        lot_id: lotId,
        recommendation,
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                approved: true,
                approving: false,
                eventId: res.event_id,
                outcomeEligible: false,
                reverted: false,
              }
            : m,
        ),
      )
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text: `승인 내용이 제어 로그에 기록되었습니다. (event_id=${res.event_id}, status=${res.status}) 5초 안에 실행 취소할 수 있습니다. 취소하지 않으면 실측 입력란이 열립니다.`,
        },
      ])
      setOutcomeDefect('')
      setOutcomeCapacity('')
      setOutcomeResidual('')
      startUndoWindow(res.event_id, msgId)
    } catch (err) {
      let detail = '승인 기록에 실패했습니다.'
      if (err && typeof err === 'object') {
        const ax = err as { message?: string; response?: { data?: { error?: unknown } } }
        const serverDetail = ax.response?.data?.error
        if (typeof serverDetail === 'string') detail = serverDetail
        else if (ax.message) detail = ax.message
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, approving: false } : m)),
      )
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        { id: idRef.current, role: 'ai', text: detail },
      ])
    }
  }

  const submitOutcome = async (msgId: number, eventId: number | string) => {
    if (outcomeDefect !== '0' && outcomeDefect !== '1') return
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, outcomeSaving: true } : m)),
    )
    try {
      const cap = parseOutcomeCapacityInput(outcomeCapacity)
      const residual = parseOutcomeResidualLiInput(outcomeResidual)
      const res = await postOutcomeControl(eventId, {
        outcome_quality_defect: Number(outcomeDefect) as 0 | 1,
        outcome_capacity: cap,
        outcome_residual_li: residual,
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, outcomeSaved: true, outcomeSaving: false }
            : m,
        ),
      )
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text:
            `실측이 기록되었습니다. (event_id=${res.event_id}, ` +
            `양/불=${res.outcome_quality_defect}` +
            (res.outcome_capacity != null
              ? `, 용량=${res.outcome_capacity} mAh/g`
              : '') +
            (res.outcome_residual_li != null
              ? `, 잔여리튬=${res.outcome_residual_li} ppm`
              : '') +
            ')',
        },
      ])
      setOutcomeDefect('')
      setOutcomeCapacity('')
      setOutcomeResidual('')
    } catch (err) {
      let detail = '실측 기록에 실패했습니다.'
      if (err && typeof err === 'object') {
        const ax = err as { message?: string; response?: { data?: { error?: unknown } } }
        if (typeof ax.response?.data?.error === 'string') detail = ax.response.data.error
        else if (ax.message) detail = ax.message
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, outcomeSaving: false } : m)),
      )
      idRef.current += 1
      setMessages((prev) => [...prev, { id: idRef.current, role: 'ai', text: detail }])
    }
  }

  const handleUndoApprove = async () => {
    if (!undoSnack || undoBusy) return
    setUndoBusy(true)
    const eventId = undoSnack.eventId
    const msgId = undoSnack.msgId
    try {
      const res = await postRevertControl(eventId)
      clearUndoTimer()
      setUndoSnack(null)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                reverted: true,
                outcomeEligible: false,
              }
            : m,
        ),
      )
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text: `취소됨. 승인이 철회되었습니다. (event_id=${res.event_id}, status=${res.status}) 실측은 기록할 수 없습니다. 이력은 DB에 보존됩니다.`,
        },
      ])
    } catch (err) {
      let detail = '실행 취소에 실패했습니다.'
      if (err && typeof err === 'object') {
        const ax = err as { message?: string; response?: { data?: { error?: unknown } } }
        if (typeof ax.response?.data?.error === 'string') detail = ax.response.data.error
        else if (ax.message) detail = ax.message
      }
      idRef.current += 1
      setMessages((prev) => [...prev, { id: idRef.current, role: 'ai', text: detail }])
    } finally {
      setUndoBusy(false)
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

  const chips: { label: string; message: string; features: ChatFeatures | null; localHelp?: boolean }[] = [
    {
      label: '사용법',
      message: '사용법을 알려주세요.',
      features: null,
      localHelp: true,
    },
    {
      label: '이 화면 요약',
      message: '지금 보고 있는 화면 데이터를 요약해 주세요.',
      features: null,
    },
  ]

  const showUsageGuide = () => {
    idRef.current += 1
    setMessages((prev) => [
      ...prev,
      { id: idRef.current, role: 'ai', text: USAGE_GUIDE_TEXT, mode: 'template' },
    ])
  }

  const onChip = (q: (typeof chips)[number]) => {
    if (q.localHelp) {
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        { id: idRef.current, role: 'user', text: q.message },
      ])
      showUsageGuide()
      return
    }
    void send(q.message, q.features)
  }

  return (
    <>
      {chatOpen ? (
        <div
          className={
            isExpanded
              ? 'fixed inset-0 z-[70] flex flex-col bg-slate-900/50 p-3 sm:p-6'
              : 'fixed bottom-20 right-3 z-[60] sm:bottom-24 sm:right-5'
          }
        >
          <div
            className={
              isExpanded
                ? `mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
                    isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
                  }`
                : `flex h-[min(680px,calc(100vh-24px))] max-h-[calc(100vh-24px)] w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border shadow-2xl sm:w-[420px] ${
                    isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
                  }`
            }
          >
            <div
              className={`flex-none border-b ${
                chatMode === 'secure'
                  ? isDark
                    ? 'border-amber-800'
                    : 'border-amber-200'
                  : isDark
                    ? 'border-slate-700'
                    : 'border-blue-200'
              }`}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    chatMode === 'secure'
                      ? isDark
                        ? 'bg-amber-900/60 text-amber-200'
                        : 'bg-amber-100 text-amber-800'
                      : isDark
                        ? 'bg-blue-900/60 text-blue-200'
                        : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {chatMode === 'secure' ? (
                    <Shield size={18} aria-hidden />
                  ) : (
                    <MessageCircle size={18} aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <strong
                      className={`truncate text-base font-bold ${
                        isDark ? 'text-slate-100' : 'text-slate-900'
                      }`}
                    >
                      YAHO! AI 챗봇
                    </strong>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        chatMode === 'secure'
                          ? isDark
                            ? 'bg-amber-900/60 text-amber-200'
                            : 'bg-amber-100 text-amber-800'
                          : isDark
                            ? 'bg-blue-900/60 text-blue-200'
                            : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {chatMode === 'secure' ? '보안 상담' : '일반 상담'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={isExpanded ? '팝업으로 축소' : '전체화면으로 확대'}
                  title={isExpanded ? '팝업으로 축소' : '전체화면으로 확대'}
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg focus:outline-none focus:ring-2 ${
                    isDark
                      ? 'text-slate-400 hover:bg-slate-800 focus:ring-slate-600'
                      : 'text-slate-500 hover:bg-slate-100 focus:ring-slate-300'
                  }`}
                >
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (chatMode === 'general') startNewThread()
                    else setSecureNewThreadNonce((n) => n + 1)
                  }}
                  disabled={chatMode === 'general' ? pending : false}
                  className={`hidden h-9 shrink-0 items-center rounded-lg border px-2.5 text-[11px] font-medium disabled:opacity-50 sm:inline-flex ${
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  새 대화
                </button>
                <button
                  type="button"
                  aria-label="챗봇 닫기"
                  onClick={() => {
                    setChatOpen(false)
                    setIsExpanded(false)
                  }}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg focus:outline-none focus:ring-2 ${
                    isDark
                      ? 'text-slate-400 hover:bg-slate-800 focus:ring-slate-600'
                      : 'text-slate-500 hover:bg-slate-100 focus:ring-slate-300'
                  }`}
                >
                  <X size={16} />
                </button>
              </div>
              <div
                role="group"
                aria-label="챗봇 모드 선택"
                className={`grid grid-cols-2 gap-2 border-t px-4 py-3 ${
                  isDark ? 'border-slate-700' : 'border-slate-100'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={chatMode === 'general'}
                  onClick={() => {
                    setChatMode('general')
                    if (window.location.pathname === '/security') {
                      pushChatPath(returnPathRef.current || '/main')
                    }
                  }}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                    chatMode === 'general'
                      ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                      : isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 focus:ring-slate-500'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 focus:ring-slate-300'
                  }`}
                >
                  <MessageCircle size={14} aria-hidden />
                  일반 상담
                </button>
                <button
                  type="button"
                  aria-pressed={chatMode === 'secure'}
                  onClick={() => {
                    setChatMode('secure')
                    const here = window.location.pathname
                    if (here !== '/security') {
                      returnPathRef.current = here || '/main'
                      pushChatPath('/security')
                    }
                  }}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                    chatMode === 'secure'
                      ? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500'
                      : isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 focus:ring-slate-500'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 focus:ring-slate-300'
                  }`}
                >
                  <Shield size={14} aria-hidden />
                  보안 상담
                </button>
              </div>
            </div>

            {chatMode === 'secure' ? (
              <div
                className={`mx-4 mt-3 flex flex-none items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                  isDark
                    ? 'border-amber-800 bg-amber-950/50 text-amber-100'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <Shield
                  size={14}
                  className={`mt-0.5 shrink-0 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}
                  aria-hidden
                />
                <div>
                  <p className="font-semibold">보안 상담 모드</p>
                  <p className="mt-0.5 leading-relaxed">
                    비밀번호, API 키, 인증 토큰 및 개인정보는 입력하지 마세요.
                  </p>
                </div>
              </div>
            ) : null}

            <div
              className={
                chatMode === 'general'
                  ? 'flex min-h-0 flex-1 flex-col'
                  : 'hidden'
              }
            >
              {threads.length > 0 ? (
                <div
                  className={`flex flex-none flex-col border-b ${
                    isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 px-3 pt-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      최근 대화
                    </span>
                    <span className="text-[10px] text-slate-400">{threads.length}개</span>
                  </div>
                  <div className="flex max-h-24 gap-1.5 overflow-x-auto px-2 py-1.5">
                    {threads.map((t) => {
                      const label = (t.title && t.title.trim()) || t.id.slice(0, 8)
                      const active = t.id === activeThreadId
                      return (
                        <div
                          key={t.id}
                          className={`inline-flex max-w-[168px] shrink-0 items-center gap-0.5 rounded-full pl-2.5 ${
                            active
                              ? 'bg-blue-600 text-white'
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
                                ? 'text-blue-100 hover:bg-blue-500 hover:text-white'
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
                </div>
              ) : (
                <div
                  className={`flex flex-none items-center border-b px-3 py-2 ${
                    isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-white'
                  }`}
                >
                  <span className="text-[10px] text-slate-400">
                    최근 대화 없음 · 메시지를 보내면 여기에 저장됩니다
                  </span>
                </div>
              )}

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
                        ? 'ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-blue-600 text-white'
                        : m.mode === 'security_redirect'
                          ? isDark
                            ? 'mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-amber-800 bg-amber-950/50 text-amber-100'
                            : 'mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-amber-200 bg-amber-50/70 text-amber-950'
                          : isDark
                            ? 'mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-slate-600 bg-slate-800 text-slate-100'
                            : 'mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-blue-200 bg-blue-50/70 text-slate-800'
                    }`}
                  >
                    {m.text}
                    {m.mode === 'security_redirect' ? (
                      <div className="mt-2">
                        <Link
                          href="/security"
                          className={`text-xs font-semibold underline ${
                            isDark ? 'text-amber-300' : 'text-amber-700'
                          }`}
                          onClick={() => setChatOpen(false)}
                        >
                          보안 탭(/security)으로 이동
                        </Link>
                      </div>
                    ) : null}
                    {m.recommendation?.suggestion && m.role === 'ai' ? (
                      <div className="mt-2 space-y-2">
                        {m.approved ? (
                          <span
                            className={`text-[11px] font-medium ${
                              isDark ? 'text-emerald-400' : 'text-emerald-700'
                            }`}
                          >
                            {m.reverted ? '취소됨' : '승인됨'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={pending || m.approving}
                            onClick={() => void approveRecommendation(m.id, m.recommendation!)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            {m.approving ? '기록 중…' : '제안 승인'}
                          </button>
                        )}
                        {m.approved &&
                        m.eventId != null &&
                        m.outcomeEligible &&
                        !m.reverted &&
                        !m.outcomeSaved ? (
                          <div
                            className={`rounded-lg border p-2 text-[11px] ${
                              isDark
                                ? 'border-slate-600 bg-slate-900 text-slate-200'
                                : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                              실측 기록
                            </div>
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              작업자 실측만 저장합니다. 값을 만들지 않습니다.
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <label className="flex items-center gap-1">
                                양/불
                                <select
                                  value={outcomeDefect}
                                  onChange={(e) =>
                                    setOutcomeDefect(e.target.value as '0' | '1' | '')
                                  }
                                  disabled={m.outcomeSaving}
                                  className={`h-7 rounded border px-1 ${
                                    isDark
                                      ? 'border-slate-600 bg-slate-800 text-slate-100'
                                      : 'border-slate-200 bg-white text-slate-800'
                                  }`}
                                >
                                  <option value="">선택</option>
                                  <option value="0">정상(0)</option>
                                  <option value="1">불량(1)</option>
                                </select>
                              </label>
                              <label className="flex items-center gap-1">
                                용량
                                <input
                                  type="number"
                                  step="0.01"
                                  min={130}
                                  max={250}
                                  placeholder="mAh/g"
                                  value={outcomeCapacity}
                                  onChange={(e) => setOutcomeCapacity(e.target.value)}
                                  disabled={m.outcomeSaving}
                                  className={`h-7 w-20 rounded border px-1 ${
                                    isDark
                                      ? 'border-slate-600 bg-slate-800 text-slate-100'
                                      : 'border-slate-200 bg-white text-slate-800'
                                  }`}
                                />
                              </label>
                              <label className="flex items-center gap-1">
                                잔여리튬
                                <input
                                  type="number"
                                  step="0.01"
                                  min={500}
                                  max={8000}
                                  placeholder="ppm"
                                  value={outcomeResidual}
                                  onChange={(e) => setOutcomeResidual(e.target.value)}
                                  disabled={m.outcomeSaving}
                                  className={`h-7 w-24 rounded border px-1 ${
                                    isDark
                                      ? 'border-slate-600 bg-slate-800 text-slate-100'
                                      : 'border-slate-200 bg-white text-slate-800'
                                  }`}
                                />
                              </label>
                              <button
                                type="button"
                                disabled={
                                  m.outcomeSaving ||
                                  (outcomeDefect !== '0' && outcomeDefect !== '1')
                                }
                                onClick={() => void submitOutcome(m.id, m.eventId!)}
                                className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                              >
                                {m.outcomeSaving ? '저장 중…' : '실측 저장'}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {m.outcomeSaved ? (
                          <span className="block text-[11px] text-slate-500">실측 저장됨</span>
                        ) : null}
                      </div>
                    ) : null}
                    {m.mode && m.mode !== 'security_redirect' && m.role === 'ai' ? (
                      <div className="mt-1 text-[10px] text-slate-400">mode={m.mode}</div>
                    ) : null}
                  </div>
                ))}
                {pending ? (
                  <div
                    className={`mr-auto max-w-[88%] rounded-2xl rounded-tl-md border px-3.5 py-3 text-sm ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-400'
                        : 'border-blue-200 bg-white text-slate-400'
                    }`}
                  >
                    응답 생성 중…
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>

              <div
                className={`flex-none border-t p-3 ${
                  isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <label
                    className={`shrink-0 text-xs font-medium ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    API
                  </label>
                  <select
                    value={llmMode}
                    onChange={(e) => setLlmMode(e.target.value)}
                    disabled={pending}
                    className={`h-8 min-w-0 flex-1 rounded-lg border px-2 text-xs ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-100'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <option value="auto">Auto (단가·길이)</option>
                    {llmOptions.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                {llmOptions.length === 0 ? (
                  <p className="mb-2 text-xs text-slate-400">
                    등록된 API 없음 · /security 에서 키를 저장하세요
                  </p>
                ) : null}
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {chips.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      disabled={pending}
                      onClick={() => onChip(q)}
                      className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${
                        isDark
                          ? 'border-slate-600 bg-slate-800 text-slate-200'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <form onSubmit={onSubmit} className="flex min-w-0 items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={pending}
                    placeholder="질문을 입력하세요."
                    className={`h-11 min-h-[44px] min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm leading-5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-500 disabled:bg-slate-800'
                        : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50'
                    }`}
                  />
                  <button
                    type="submit"
                    aria-label="메시지 전송"
                    disabled={pending || !input.trim()}
                    className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-blue-600 px-3.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    전송
                  </button>
                </form>
                {undoSnack ? (
                  <div
                    className={`mt-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] ${
                      isDark
                        ? 'border-amber-800 bg-amber-950/50 text-amber-100'
                        : 'border-amber-200 bg-amber-50 text-amber-950'
                    }`}
                  >
                    <span>승인 기록됨 · {undoSnack.secondsLeft}초 내 취소 가능</span>
                    <button
                      type="button"
                      disabled={undoBusy}
                      onClick={() => void handleUndoApprove()}
                      className="shrink-0 rounded-lg bg-amber-700 px-2.5 py-1 font-bold text-white disabled:opacity-50"
                    >
                      {undoBusy ? '취소 중…' : '실행 취소'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={
                chatMode === 'secure' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'
              }
            >
              <SecurityChatbot
                variant="embedded"
                hideHeader
                newThreadNonce={secureNewThreadNonce}
                className="h-full min-h-0 flex-1 rounded-none border-0 shadow-none"
              />
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="AI 챗봇"
        aria-expanded={chatOpen}
        onClick={() => {
          if (isExpanded) {
            setIsExpanded(false)
            return
          }
          if (!chatOpen) {
            setChatMode('general')
            setIsExpanded(false)
            setChatOpen(true)
            return
          }
          setChatOpen(false)
        }}
        className={`fixed bottom-5 right-5 z-[75] flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 ${
          chatOpen || isExpanded ? 'hidden' : ''
        }`}
      >
        <MessageCircle size={22} />
      </button>
    </>
  )
}
