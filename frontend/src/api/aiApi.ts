import axios from 'axios'
import { apiClient } from '@/api/axios'
import { getAuthUser } from '@/lib/authStorage'

/** Direct ai-service via next.config rewrite (`/ai` → :8800). Health / smoke only. */
export const aiClient = axios.create({
  baseURL: '/ai',
  timeout: 60_000,
})

const THREAD_KEY = 'kdt_chat_thread_id'
const LEGACY_SESSION_KEY = 'kdt_chat_session_id'

export function getChatThreadId(): string | null {
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

export function setChatThreadId(id: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THREAD_KEY, id)
  window.localStorage.setItem(LEGACY_SESSION_KEY, id)
}

export function clearChatThreadId(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(THREAD_KEY)
  window.localStorage.removeItem(LEGACY_SESSION_KEY)
}

export function newChatThreadId(): string {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `gen-${Date.now()}`
  setChatThreadId(id)
  return id
}

/** @deprecated use getChatThreadId */
export function getChatSessionId(): string | null {
  return getChatThreadId()
}

/** @deprecated use setChatThreadId */
export function setChatSessionId(id: string): void {
  setChatThreadId(id)
}

export type ChatFeatures = {
  d50: number
  d90: number
  metal_impurity: number
  lithium_input: number
  additive_ratio: number
  process_time: number
  sintering_temp: number
  humidity: number
  tank_pressure: number
  operator_id: string
  id?: string
  timestamp?: string
}

export type ChatPredictResult = {
  defect_status: number
  probability: number
  applied_threshold: number
  top_risk_factors: string[]
}

export type WhatIfSuggestion = {
  deltas: Record<string, number>
  after_features: ChatFeatures
  probability: number
  defect_status: number
  applied_threshold: number
  boundary_hit?: boolean
  limit_reason?: string | null
  ideal_values?: Record<string, number> | null
  clipped_values?: Record<string, number> | null
  residual_before?: number | null
  residual_after?: number | null
  residual_unit?: string | null
  capacity_before?: number | null
  capacity_after?: number | null
  unit?: string | null
}

export type ChatRecommendation = {
  method: string
  baseline: {
    probability: number
    defect_status: number
    applied_threshold: number
    features: ChatFeatures
    capacity?: number | null
    residual_li?: number | null
  }
  suggestion: WhatIfSuggestion | null
  note?: string | null
}

export type ChatRequest = {
  message: string
  features?: ChatFeatures | null
  fillThreshold?: number | null
  thread_id?: string | null
  user_id?: string | null
  /** @deprecated alias for thread_id */
  session_id?: string | null
  /** "auto" | stored key id from /security vault */
  llm_mode?: string | null
}

export type ChatCapacityResult = {
  capacity: number
  unit: string
  top_factors: string[]
}

export type ChatResidualResult = {
  residual_li: number
  unit: string
  top_factors: string[]
}

export type ChatResponse = {
  thread_id?: string
  session_id: string
  reply: string
  mode: string
  provider: string
  predict: ChatPredictResult | null
  capacity?: ChatCapacityResult | null
  residual?: ChatResidualResult | null
  heads?: Record<string, unknown> | null
  recommendation?: ChatRecommendation | null
  error: string | null
  need_guideline?: boolean
  ai_proxied?: boolean
  security_matched?: string | null
  similar_streak?: number
  chat_store?: string
  stored_user_messages?: number
}

export type ApproveControlRequest = {
  session_id?: string | null
  lot_id?: string | null
  recommendation: ChatRecommendation
}

export type ApproveControlResponse = {
  ok: boolean
  event_id: number | string
  status: string
  control_store?: string
}

export type OutcomeControlRequest = {
  outcome_quality_defect: 0 | 1
  outcome_capacity?: number | null
  outcome_residual_li?: number | null
}

export type OutcomeControlResponse = {
  ok: boolean
  event_id: number | string
  status: string
  outcome_quality_defect: 0 | 1
  outcome_capacity: number | null
  outcome_residual_li?: number | null
  control_store?: string
}

/** Proxied through Express backend: security gate + session + ai-service.
 * Multi-turn (B): message + thread_id + user_id only — never history array.
 */
export async function postChat(body: ChatRequest): Promise<ChatResponse> {
  const thread_id =
    body.thread_id ?? body.session_id ?? getChatThreadId()
  const user_id = body.user_id ?? getAuthUser()?.userId ?? undefined
  const { data } = await apiClient.post<ChatResponse>('/chat', {
    message: body.message,
    features: body.features ?? undefined,
    fillThreshold: body.fillThreshold ?? undefined,
    thread_id: thread_id ?? undefined,
    user_id: user_id ?? undefined,
    llm_mode: body.llm_mode ?? 'auto',
  })
  const tid = data.thread_id || data.session_id
  if (tid) setChatThreadId(tid)
  return data
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
  sources?: unknown
  created_at?: string | null
}

export async function listChatThreads(opts: {
  channel: 'security' | 'general'
  user_id?: string
  limit?: number
}): Promise<ChatThreadItem[]> {
  const user_id = opts.user_id ?? getAuthUser()?.userId
  if (!user_id) return []
  const { data } = await apiClient.get<{ threads: ChatThreadItem[] }>(
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
  const { data } = await apiClient.get<{
    thread_id: string
    messages: ChatThreadMessageItem[]
  }>(`/chat/threads/${encodeURIComponent(opts.thread_id)}/messages`, {
    params: { user_id, limit: opts.limit ?? 200 },
  })
  return data.messages ?? []
}

/** Log-only control bridge: approve what-if suggestion → optimization_events row. */
export async function postApproveControl(
  body: ApproveControlRequest,
): Promise<ApproveControlResponse> {
  const session_id = body.session_id ?? getChatThreadId()
  const { data } = await apiClient.post<ApproveControlResponse>('/control/approve', {
    session_id: session_id ?? undefined,
    lot_id: body.lot_id ?? undefined,
    recommendation: body.recommendation,
  })
  return data
}

/** 5초 Undo: mark event status=reverted (no DELETE). */
export async function postRevertControl(
  eventId: number | string,
): Promise<ApproveControlResponse> {
  const { data } = await apiClient.post<ApproveControlResponse>(
    `/control/approve/${encodeURIComponent(String(eventId))}/revert`,
  )
  return data
}

/** Record measured outcome only (no synthetic data). */
export async function postOutcomeControl(
  eventId: number | string,
  body: OutcomeControlRequest,
): Promise<OutcomeControlResponse> {
  const { data } = await apiClient.post<OutcomeControlResponse>(
    `/control/approve/${encodeURIComponent(String(eventId))}/outcome`,
    {
      outcome_quality_defect: body.outcome_quality_defect,
      outcome_capacity:
        body.outcome_capacity === undefined ? null : body.outcome_capacity,
      outcome_residual_li:
        body.outcome_residual_li === undefined ? null : body.outcome_residual_li,
    },
  )
  return data
}

export async function getAiHealth(): Promise<{ status: string; model_version?: string }> {
  const { data } = await aiClient.get<{ status: string; model_version?: string }>('/health')
  return data
}

export async function getBackendHealth(): Promise<{ status: string; service?: string }> {
  const { data } = await apiClient.get<{ status: string; service?: string }>('/health')
  return data
}

/** Demo LOT features for smoke / suggested “진단” chip (raw predict columns). */
export const SAMPLE_CHAT_FEATURES: ChatFeatures = {
  d50: 5.1,
  d90: 12.0,
  metal_impurity: 0.01,
  lithium_input: 1.05,
  additive_ratio: 0.02,
  process_time: 10.0,
  sintering_temp: 800.0,
  humidity: 40.0,
  tank_pressure: 1.2,
  operator_id: 'OP01',
  id: 'DEMO-LOT',
}
