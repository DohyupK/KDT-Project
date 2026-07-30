'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { FileText, Shield, X } from 'lucide-react'
import {
  postSecurityChat,
  type SecurityChatSource,
} from '@/api/securityChatApi'

type ChatRole = 'user' | 'ai'

type ChatMessage = {
  id: number
  role: ChatRole
  text: string
  mode?: string
  provider?: string
  sources?: SecurityChatSource[]
}

type Props = {
  /** page = fixed height card; embedded = fill parent (fullscreen overlay) */
  variant?: 'page' | 'embedded'
  className?: string
}

function SourcePanel({
  source,
  onClose,
}: {
  source: SecurityChatSource
  onClose: () => void
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-slate-200 bg-white md:w-[min(100%,380px)] md:border-l">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <FileText size={16} className="shrink-0 text-amber-700" />
        <strong className="min-w-0 flex-1 truncate text-sm text-slate-800">
          {source.title}
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
          <span className="font-medium text-slate-800">doc_id</span>: {source.doc_id}
        </div>
        {source.category ? (
          <div>
            <span className="font-medium text-slate-800">category</span>: {source.category}
          </div>
        ) : null}
        {source.process ? (
          <div>
            <span className="font-medium text-slate-800">process</span>: {source.process}
          </div>
        ) : null}
        {source.source_path ? (
          <div className="break-all">
            <span className="font-medium text-slate-800">path</span>: {source.source_path}
          </div>
        ) : null}
        {source.chunk_index != null ? (
          <div>
            <span className="font-medium text-slate-800">chunk</span>: {source.chunk_index}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50/80 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          가져온 원문 청크
        </p>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">
          {source.text}
        </pre>
      </div>
    </aside>
  )
}

/**
 * Security-tab chatbot: local vLLM (+ secure RAG) via /api/security-chat.
 * Do not wire Groq / Gemini / general GlobalChatbot providers here.
 */
export default function SecurityChatbot({
  variant = 'page',
  className = '',
}: Props) {
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [activeSource, setActiveSource] = useState<SecurityChatSource | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'ai',
      text:
        '보안·기밀 전용 챗봇입니다. 이 탭의 메시지는 외부 API(Groq/Gemini 등)로 전송되지 않으며, 로컬 vLLM(CHAT_VLLM_BASE_URL, 기본 :8001)과 보안 문서 RAG만 사용합니다. vLLM이 꺼져 있으면 오프라인 안내만 표시됩니다.',
      mode: 'template',
      provider: 'offline',
    },
  ])
  const idRef = useRef(2)
  const endRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pending, activeSource])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const openSourceByTitle = (sources: SecurityChatSource[] | undefined, title: string) => {
    if (!sources?.length) return
    const hit =
      sources.find((s) => s.title === title) ||
      sources.find((s) => title.includes(s.title) || s.title.includes(title))
    if (hit) setActiveSource(hit)
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

    idRef.current += 1
    setMessages((prev) => [...prev, { id: idRef.current, role: 'user', text }])
    setInput('')
    setPending(true)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const res = await postSecurityChat({ message: text })
      if (ac.signal.aborted) return
      idRef.current += 1
      const sources = res.sources ?? []
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text: res.reply || (res.error ? `오류: ${res.error}` : '응답이 비어 있습니다.'),
          mode: res.mode,
          provider: res.provider,
          sources,
        },
      ])
      if (sources.length === 1) {
        // Soft-open when single hit helps “위치로 이동”
        setActiveSource(sources[0])
      }
    } catch (err) {
      if (ac.signal.aborted) return
      let detail = '요청에 실패했습니다.'
      if (err && typeof err === 'object') {
        const ax = err as {
          message?: string
          response?: { data?: { error?: unknown }; status?: number }
        }
        if (typeof ax.response?.data?.error === 'string') detail = ax.response.data.error
        else if (ax.message) detail = ax.message
        if (ax.response?.status) detail = `[${ax.response.status}] ${detail}`
      }
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text: `보안 챗봇 연결 실패. backend(:3001) · ai-service(:8800) · (선택) vLLM(:8001) · Qdrant(:6333)을 확인하세요.\n(${detail})`,
          mode: 'template',
          provider: 'offline',
        },
      ])
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
          activeSource ? 'flex-col md:flex-row' : 'flex-col'
        }`}
      >
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
                    {m.sources.map((s, idx) => (
                      <button
                        key={`${s.doc_id}-${s.chunk_index ?? idx}`}
                        type="button"
                        onClick={() => setActiveSource(s)}
                        className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
                      >
                        {s.title}
                      </button>
                    ))}
                  </div>
                ) : null}
                {m.role === 'ai' && m.mode ? (
                  <div className="mt-1 text-[10px] text-slate-400">
                    mode={m.mode}
                    {m.provider ? ` · provider=${m.provider}` : ''}
                  </div>
                ) : null}
              </div>
            ))}
            {pending ? (
              <div className="mr-auto rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
                응답 대기 중…
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

        {activeSource ? (
          <div className="h-[40%] min-h-[180px] border-t border-slate-200 md:h-auto md:min-h-0 md:w-[min(42%,400px)] md:shrink-0 md:border-t-0">
            <SourcePanel source={activeSource} onClose={() => setActiveSource(null)} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
