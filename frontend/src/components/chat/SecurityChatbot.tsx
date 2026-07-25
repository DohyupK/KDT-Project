'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Shield } from 'lucide-react'
import { postSecurityChat } from '@/api/securityChatApi'

type ChatRole = 'user' | 'ai'

type ChatMessage = {
  id: number
  role: ChatRole
  text: string
  mode?: string
  provider?: string
}

/**
 * Security-tab chatbot: local vLLM only via /api/security-chat.
 * Do not wire Groq / Gemini / general GlobalChatbot providers here.
 */
export default function SecurityChatbot() {
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'ai',
      text:
        '보안·기밀 전용 챗봇입니다. 이 탭의 메시지는 외부 API(Groq/Gemini 등)로 전송되지 않으며, 로컬 vLLM(CHAT_VLLM_BASE_URL, 기본 :8001)만 사용합니다. vLLM이 꺼져 있으면 오프라인 안내만 표시됩니다.',
      mode: 'template',
      provider: 'offline',
    },
  ])
  const idRef = useRef(2)
  const endRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pending])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

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
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text: res.reply || (res.error ? `오류: ${res.error}` : '응답이 비어 있습니다.'),
          mode: res.mode,
          provider: res.provider,
        },
      ])
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
          text: `보안 챗봇 연결 실패. backend(:3001) · ai-service(:8800) · (선택) vLLM(:8001)을 확인하세요.\n(${detail})`,
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

  return (
    <div className="flex h-[min(560px,70vh)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <Shield size={18} className="text-amber-700" />
        <strong className="text-sm text-slate-800">보안 전용 챗봇</strong>
        <span className="ml-auto text-[10px] text-slate-400">vLLM only · no cloud LLM</span>
      </div>

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
            {m.text}
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
  )
}
