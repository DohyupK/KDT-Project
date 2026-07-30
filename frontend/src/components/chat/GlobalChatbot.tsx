'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import Link from 'next/link'
import { Maximize2, MessageCircle, Minimize2, X } from 'lucide-react'
import SecurityChatbot from '@/components/chat/SecurityChatbot'
import {
  postApproveControl,
  postOutcomeControl,
  postRevertControl,
  postChat,
  SAMPLE_CHAT_FEATURES,
  type ChatFeatures,
  type ChatRecommendation,
} from '@/api/aiApi'
import {
  parseOutcomeCapacityInput,
  parseOutcomeResidualLiInput,
} from '@/lib/outcomeBounds'
import {
  readLlmProvidersCache,
  type LlmKeyPublic,
} from '@/api/llmKeysApi'
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

export default function GlobalChatbot() {
  const {
    selectedLotId,
    selectedFeatures,
    chatOpen,
    setChatOpen,
    clearLot,
    diagnoseRequested,
    clearDiagnoseRequest,
  } = useSelectedLot()

  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [llmMode, setLlmMode] = useState('auto')
  const [llmOptions, setLlmOptions] = useState<LlmKeyPublic[]>([])
  const [undoSnack, setUndoSnack] = useState<UndoSnack | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [outcomeDefect, setOutcomeDefect] = useState<'0' | '1' | ''>('')
  const [outcomeCapacity, setOutcomeCapacity] = useState('')
  const [outcomeResidual, setOutcomeResidual] = useState('')
  /** Fullscreen overlay with SecurityChatbot (separate from general chat session). */
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'ai',
      text:
        '안녕하세요. AI 공정 지원 챗봇입니다.\n\n진단: Main 「위험 LOT Top」에서 LOT 행을 클릭하면 자동으로 O/X 진단이 시작됩니다.\n시험: 「샘플 LOT 진단」칩을 눌러도 됩니다.\n안내: 「챗봇 안내」칩 · 보안은 /security 탭을 이용해 주세요.',
    },
  ])
  const idRef = useRef(2)
  const endRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sendRef = useRef<(raw: string, features?: ChatFeatures | null) => Promise<void>>(
    async () => {},
  )

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
    return () => {
      abortRef.current?.abort()
      if (undoTimerRef.current) clearInterval(undoTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!fullscreenOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreenOpen])

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
        llm_mode: llmMode || 'auto',
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
  sendRef.current = send

  // Main LOT 행 클릭(diagnose) → features 주입 후 자동 진단 1회
  useEffect(() => {
    if (!diagnoseRequested || !selectedFeatures || pending) return
    clearDiagnoseRequest()
    void sendRef.current(
      `연결된 LOT(${selectedFeatures.id ?? selectedLotId ?? ''})를 O/X 진단해 주세요.`,
      selectedFeatures,
    )
  }, [
    diagnoseRequested,
    selectedFeatures,
    selectedLotId,
    pending,
    clearDiagnoseRequest,
  ])

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
      label: '챗봇 안내',
      message: '무엇을 도와드릴 수 있나요?',
      features: null,
      localHelp: true,
    },
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

  const HELP_TEXT =
    '사용 안내입니다.\n\n' +
    '1. Main 「위험 LOT Top」에서 LOT 행을 클릭 → 챗봇이 자동으로 O/X 진단합니다.\n' +
    '2. 「샘플 LOT 진단」칩으로도 시험할 수 있습니다.\n' +
    '3. What-if 제안이 나오면 「제안 승인」후 5초 안 「실행 취소」가능.\n' +
    '4. 공정 한계치는 Setting에서 변경합니다.\n' +
    '5. 보안·기밀은 /security 탭을 이용해 주세요.'

  const onChip = (q: (typeof chips)[number]) => {
    if (q.localHelp) {
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        { id: idRef.current, role: 'user', text: q.message },
      ])
      idRef.current += 1
      setMessages((prev) => [
        ...prev,
        { id: idRef.current, role: 'ai', text: HELP_TEXT, mode: 'template' },
      ])
      return
    }
    void send(q.message, q.features)
  }

  return (
    <>
      {chatOpen && !fullscreenOpen ? (
        <div className="fixed bottom-24 right-4 z-[60] flex h-[min(520px,70vh)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-6">
          <div className="flex items-start gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3">
            <button
              type="button"
              aria-label="보안 챗 전체화면"
              title="보안 챗 전체화면"
              onClick={() => setFullscreenOpen(true)}
              className="mt-0.5 shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-200/80"
            >
              <Maximize2 size={16} />
            </button>
            <div className="min-w-0 flex-1">
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
                  <div className="mt-2 space-y-2">
                    {m.approved ? (
                      <span className="text-[11px] font-medium text-emerald-700">
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
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                        <div className="font-medium text-slate-800">실측 기록</div>
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
                              className="h-7 rounded border border-slate-200 bg-white px-1"
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
                              className="h-7 w-20 rounded border border-slate-200 bg-white px-1"
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
                              className="h-7 w-24 rounded border border-slate-200 bg-white px-1"
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
              <div className="mr-auto rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
                응답 대기 중…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <label className="shrink-0 text-[10px] font-medium text-slate-500">API</label>
              <select
                value={llmMode}
                onChange={(e) => setLlmMode(e.target.value)}
                disabled={pending}
                className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
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
              <p className="mb-2 text-[10px] text-slate-400">
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
            {undoSnack ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
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
      ) : null}

      {fullscreenOpen ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-900/50 p-3 sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                aria-label="전체화면 닫기"
                title="전체화면 닫기"
                onClick={() => setFullscreenOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-200/80"
              >
                <Minimize2 size={16} />
              </button>
              <strong className="text-sm text-slate-800">보안 전용 챗 · 전체화면</strong>
              <span className="text-[10px] text-slate-400">Esc로 닫기 · 일반 챗과 세션 분리</span>
              <button
                type="button"
                aria-label="전체화면 닫기"
                onClick={() => setFullscreenOpen(false)}
                className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-200/80"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-3 sm:p-4">
              <SecurityChatbot variant="embedded" />
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="AI 챗봇"
        aria-expanded={chatOpen || fullscreenOpen}
        onClick={() => {
          if (fullscreenOpen) {
            setFullscreenOpen(false)
            return
          }
          setChatOpen(!chatOpen)
        }}
        className={`fixed bottom-5 right-5 z-[75] flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 ${
          fullscreenOpen ? 'hidden' : ''
        }`}
      >
        {chatOpen ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  )
}
