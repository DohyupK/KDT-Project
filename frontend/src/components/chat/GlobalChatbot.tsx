'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import Link from 'next/link'
import { MessageCircle, X } from 'lucide-react'
import {
  postApproveControl,
  postChat,
  SAMPLE_CHAT_FEATURES,
  type ChatFeatures,
  type ChatRecommendation,
} from '@/api/aiApi'
import { useSelectedLot } from '@/context/SelectedLotContext'

type ChatRole = 'user' | 'ai'

type ChatMessage = {
  id: number
  role: ChatRole
  text: string
  mode?: string
  recommendation?: ChatRecommendation | null
  approved?: boolean
  approving?: boolean
}

export default function GlobalChatbot() {
  const {
    selectedLotId,
    selectedFeatures,
    chatOpen,
    setChatOpen,
    clearLot,
  } = useSelectedLot()

  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'ai',
      text:
        '안녕하세요. AI 공정 지원 챗봇입니다. Main에서 LOT을 「챗봇에 연결」하면 센서가 자동 주입됩니다. 「샘플 LOT 진단」으로도 연동을 확인할 수 있습니다. 보안·기밀 내용은 /security 탭을 이용해 주세요.',
    },
  ])
  const idRef = useRef(2)
  const endRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!chatOpen) return
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatOpen, pending])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const resolveFeatures = (explicit: ChatFeatures | null | undefined) =>
    explicit ?? selectedFeatures ?? null

  const send = async (raw: string, features: ChatFeatures | null = null) => {
    const text = raw.trim()
    if (!text || pending) return

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
      const res = await postChat({
        message: text,
        features: attached ?? undefined,
      })
      if (ac.signal.aborted) return
      idRef.current += 1
      const replyText =
        res.reply || (res.error ? `오류: ${res.error}` : '응답이 비어 있습니다.')
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text: replyText,
          mode: res.mode,
          recommendation: res.recommendation ?? null,
        },
      ])
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
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current,
          role: 'ai',
          text:
            `챗봇 연결에 실패했습니다. backend(:3001) · ai-service(:8800)를 확인해 주세요.\n(${detail})`,
        },
      ])
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
        selectedLotId ??
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
          text: `승인 내용이 제어 로그에 기록되었습니다. (event_id=${res.event_id}, status=${res.status}) 실제 장비 반영은 아직 스텁입니다.`,
        },
      ])
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

  const chips: { label: string; message: string; features: ChatFeatures | null }[] = [
    { label: '챗봇 안내', message: '무엇을 도와드릴 수 있나요?', features: null },
    {
      label: '샘플 LOT 진단',
      message: '이 샘플 LOT를 O/X 진단해 주세요.',
      features: SAMPLE_CHAT_FEATURES,
    },
  ]
  if (selectedFeatures) {
    chips.splice(1, 0, {
      label: '선택된 LOT 진단',
      message: '이거 지금 어때? 연결된 LOT을 O/X 진단해 주세요.',
      features: selectedFeatures,
    })
  }

  return (
    <>
      {chatOpen ? (
        <div className="fixed bottom-24 right-4 z-[60] flex h-[min(520px,70vh)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-6">
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <strong className="text-sm text-slate-800">AI 공정 지원 챗봇</strong>
              {selectedLotId ? (
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="truncate">연결 LOT: {selectedLotId}</span>
                  <button
                    type="button"
                    onClick={clearLot}
                    className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] hover:bg-white"
                  >
                    해제
                  </button>
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-slate-400">연결된 LOT 없음</div>
              )}
            </div>
            <button
              type="button"
              aria-label="챗봇 닫기"
              onClick={() => setChatOpen(false)}
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
                    : m.mode === 'security_redirect'
                      ? 'mr-auto rounded-bl-md border border-amber-200 bg-amber-50 text-amber-950'
                      : 'mr-auto rounded-bl-md border border-slate-200 bg-white text-slate-800'
                }`}
              >
                {m.text}
                {m.mode === 'security_redirect' ? (
                  <div className="mt-2">
                    <Link
                      href="/security"
                      className="text-xs font-semibold text-amber-800 underline"
                      onClick={() => setChatOpen(false)}
                    >
                      보안 탭(/security)으로 이동
                    </Link>
                  </div>
                ) : null}
                {m.recommendation?.suggestion && m.role === 'ai' ? (
                  <div className="mt-2">
                    {m.approved ? (
                      <span className="text-[11px] font-medium text-emerald-700">승인됨</span>
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
                  </div>
                ) : null}
                {m.mode && m.mode !== 'security_redirect' && m.role === 'ai' ? (
                  <div className="mt-1 text-[10px] text-slate-400">mode={m.mode}</div>
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

          <div className="border-t border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {chips.map((q) => (
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
                placeholder={
                  selectedLotId
                    ? '연결된 LOT 기준으로 질문…'
                    : '메시지를 입력하세요...'
                }
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
        aria-expanded={chatOpen}
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-5 right-5 z-[65] flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700"
      >
        {chatOpen ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  )
}
