'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { MessageCircle, X } from 'lucide-react'
import {
  postChat,
  SAMPLE_CHAT_FEATURES,
  type ChatFeatures,
} from '@/api/aiApi'

type ChatRole = 'user' | 'ai'

type ChatMessage = {
  id: number
  role: ChatRole
  text: string
}

const SUGGESTED = [
  { label: '챗봇 안내', message: '무엇을 도와드릴 수 있나요?', features: null as ChatFeatures | null },
  {
    label: '샘플 LOT 진단',
    message: '이 샘플 LOT를 O/X 진단해 주세요.',
    features: SAMPLE_CHAT_FEATURES,
  },
] as const

export default function GlobalChatbot() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'ai',
      text: '안녕하세요. AI 공정 지원 챗봇입니다. 메시지를 보내거나 「샘플 LOT 진단」으로 predict Tool 연동을 확인할 수 있습니다.',
    },
  ])
  const idRef = useRef(2)
  const endRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, pending])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const send = async (raw: string, features: ChatFeatures | null = null) => {
    const text = raw.trim()
    if (!text || pending) return

    idRef.current += 1
    const userId = idRef.current
    setMessages((prev) => [...prev, { id: userId, role: 'user', text }])
    setInput('')
    setPending(true)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const res = await postChat({
        message: text,
        features: features ?? undefined,
      })
      if (ac.signal.aborted) return
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text: res.reply || (res.error ? `오류: ${res.error}` : '응답이 비어 있습니다.'),
        },
      ])
    } catch (err) {
      if (ac.signal.aborted) return
      let detail = '요청에 실패했습니다.'
      if (err && typeof err === 'object') {
        const ax = err as {
          message?: string
          response?: { data?: { detail?: unknown }; status?: number }
        }
        const serverDetail = ax.response?.data?.detail
        if (typeof serverDetail === 'string') detail = serverDetail
        else if (ax.message) detail = ax.message
        if (ax.response?.status) detail = `[${ax.response.status}] ${detail}`
      }
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text: `ai-service 연결에 실패했습니다. uvicorn(:8800)과 /ai rewrite를 확인해 주세요.\n(${detail})`,
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

  return (
    <>
      {open ? (
        <div className="fixed bottom-24 right-4 z-[60] flex h-[min(520px,70vh)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-6">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <strong className="text-sm text-slate-800">AI 공정 지원 챗봇</strong>
            <button
              type="button"
              aria-label="챗봇 닫기"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-200/80"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-slate-50/60 p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto rounded-br-md bg-blue-600 text-white'
                    : 'mr-auto rounded-bl-md border border-slate-200 bg-white text-slate-800'
                }`}
              >
                {m.text}
              </div>
            ))}
            {pending ? (
              <div className="mr-auto rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
                응답 대기 중…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTED.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={pending}
                  onClick={() => void send(q.message, q.features)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 disabled:opacity-50"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <form onSubmit={onSubmit} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={pending}
                placeholder="메시지를 입력하세요..."
                className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400 disabled:bg-slate-50"
              />
              <button
                type="submit"
                disabled={pending || !input.trim()}
                className="rounded-xl bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-50"
              >
                전송
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="AI 챗봇"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[65] flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  )
}
