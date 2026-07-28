import axios from 'axios'
import { apiClient } from '@/api/axios'

/** Direct ai-service via next.config rewrite (`/ai` → :8800). Health / smoke only. */
export const aiClient = axios.create({
  baseURL: '/ai',
  timeout: 60_000,
})

const SESSION_KEY = 'kdt_chat_session_id'

export function getChatSessionId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(SESSION_KEY)
}

export function setChatSessionId(id: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SESSION_KEY, id)
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
  }
  suggestion: WhatIfSuggestion | null
  note?: string | null
}

export type ChatRequest = {
  message: string
  features?: ChatFeatures | null
  fillThreshold?: number | null
  session_id?: string | null
  /** "auto" | stored key id from /security vault */
  llm_mode?: string | null
}

export type ChatCapacityResult = {
  capacity: number
  unit: string
  top_factors: string[]
}

export type ChatResponse = {
  session_id: string
  reply: string
  mode: string
  provider: string
  predict: ChatPredictResult | null
  capacity?: ChatCapacityResult | null
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
}

export type OutcomeControlResponse = {
  ok: boolean
  event_id: number | string
  status: string
  outcome_quality_defect: 0 | 1
  outcome_capacity: number | null
  control_store?: string
}

/** Proxied through Express backend: security gate + session + ai-service. */
export async function postChat(body: ChatRequest): Promise<ChatResponse> {
  const session_id = body.session_id ?? getChatSessionId()
  const { data } = await apiClient.post<ChatResponse>('/chat', {
    message: body.message,
    features: body.features ?? undefined,
    fillThreshold: body.fillThreshold ?? undefined,
    session_id: session_id ?? undefined,
    llm_mode: body.llm_mode ?? 'auto',
  })
  if (data.session_id) setChatSessionId(data.session_id)
  return data
}

/** Log-only control bridge: approve what-if suggestion → optimization_events row. */
export async function postApproveControl(
  body: ApproveControlRequest,
): Promise<ApproveControlResponse> {
  const session_id = body.session_id ?? getChatSessionId()
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
