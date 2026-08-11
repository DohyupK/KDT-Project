export type AiChatFeatures = Record<string, string | number | undefined>

export type AiLlmCredential = {
  id: string
  display_name: string
  provider_kind: string
  company: string
  model: string
  base_url: string | null
  api_key: string
  cost_score: number
}

export type AiChatRequest = {
  message: string
  thread_id?: string | null
  user_id?: string | null
  features?: AiChatFeatures | null
  fillThreshold?: number | null
  need_guideline?: boolean
  /** "auto" | stored key id */
  llm_mode?: string | null
  llm_credentials?: AiLlmCredential[]
}

export type AiPredictResult = {
  defect_status: number
  probability: number
  applied_threshold: number
  top_risk_factors: string[]
}

export type AiCapacityResult = {
  capacity: number
  unit: string
  top_factors: string[]
}

export type AiResidualResult = {
  residual_li: number
  unit: string
  top_factors: string[]
}

export type AiRecommendation = {
  method: string
  baseline: Record<string, unknown>
  suggestion: Record<string, unknown> | null
  note?: string | null
}

export type AiChatResponse = {
  reply: string
  mode: string
  provider?: string
  thread_id?: string | null
  predict: AiPredictResult | null
  capacity?: AiCapacityResult | null
  residual?: AiResidualResult | null
  heads?: Record<string, unknown> | null
  recommendation?: AiRecommendation | null
  error: string | null
}

function aiServiceBase(): string {
  return (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')
}

export type PredictFeatureBody = {
  d50?: number | null
  d90?: number | null
  metal_impurity?: number | null
  lithium_input?: number | null
  additive_ratio?: number | null
  process_time?: number | null
  sintering_temp?: number | null
  humidity?: number | null
  tank_pressure?: number | null
  operator_id?: string | null
  id?: string | null
  timestamp?: string | null
  fillThreshold?: number | null
}

async function postAiJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${aiServiceBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ai-service ${path} ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

function sanitizePredictBody(features: PredictFeatureBody): Record<string, string | number> {
  const keys = [
    'd50',
    'd90',
    'metal_impurity',
    'lithium_input',
    'additive_ratio',
    'process_time',
    'sintering_temp',
    'humidity',
    'tank_pressure',
  ] as const
  const out: Record<string, string | number> = {
    operator_id: features.operator_id?.trim() || 'OP_A',
  }
  for (const k of keys) {
    const v = features[k]
    if (v != null && Number.isFinite(Number(v))) out[k] = Number(v)
  }
  if (features.id) out.id = String(features.id)
  if (features.timestamp) out.timestamp = String(features.timestamp)
  if (features.fillThreshold != null) out.fillThreshold = Number(features.fillThreshold)
  return out
}

export type AiVotingResult = {
  capacity: number
  residual_li: number
  probability: number
  quality_defect: number | null
  applied_threshold: number | null
  unit_capacity?: string
  unit_residual?: string
  probability_denominator?: number
  member_scores?: Record<string, number>
}

/** Cascade multi-model voting (judgment_lots 4 fields). */
export async function predictVoting(features: PredictFeatureBody): Promise<AiVotingResult> {
  return postAiJson<AiVotingResult>('/predict-voting', sanitizePredictBody(features))
}

/** Single-row O/X defect probability (same contract as chatbot clf head). */
export async function predictDefect(features: PredictFeatureBody): Promise<AiPredictResult> {
  return postAiJson<AiPredictResult>('/predict', sanitizePredictBody(features))
}

/** Single-row residual lithium ppm (same contract as chatbot residual head). */
export async function predictResidual(features: PredictFeatureBody): Promise<AiResidualResult> {
  const body = sanitizePredictBody(features)
  delete body.fillThreshold
  return postAiJson<AiResidualResult>('/predict-residual', body)
}

/** Single-row capacity mAh/g (same contract as chatbot capacity head). */
export async function predictCapacity(features: PredictFeatureBody): Promise<AiCapacityResult> {
  const body = sanitizePredictBody(features)
  delete body.fillThreshold
  return postAiJson<AiCapacityResult>('/predict-capacity', body)
}

export async function proxyChat(body: AiChatRequest): Promise<AiChatResponse> {
  const res = await fetch(`${aiServiceBase()}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: body.message,
      thread_id: body.thread_id ?? undefined,
      user_id: body.user_id ?? undefined,
      features: body.features ?? undefined,
      fillThreshold: body.fillThreshold ?? undefined,
      need_guideline: body.need_guideline ?? false,
      llm_mode: body.llm_mode ?? undefined,
      llm_credentials: body.llm_credentials ?? undefined,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ai-service /chat ${res.status}: ${text.slice(0, 200)}`)
  }

  return (await res.json()) as AiChatResponse
}

export type AiKnowledgeAnalyzeRequest = {
  message: string
  llm_mode?: string | null
  llm_credentials?: AiLlmCredential[]
}

export type AiKnowledgeAnalyzeResponse = {
  reply: string
  mode: string
  provider?: string | null
  error: string | null
}

/** Knowledge library analyze — bypasses /chat SYSTEM_COMPOSE. */
export async function proxyKnowledgeAnalyze(
  body: AiKnowledgeAnalyzeRequest,
): Promise<AiKnowledgeAnalyzeResponse> {
  const res = await fetch(`${aiServiceBase()}/knowledge-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: body.message,
      llm_mode: body.llm_mode ?? 'auto',
      llm_credentials: body.llm_credentials ?? undefined,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ai-service /knowledge-analyze ${res.status}: ${text.slice(0, 200)}`)
  }

  return (await res.json()) as AiKnowledgeAnalyzeResponse
}

export type AiLotRiskReasonRequest = {
  lot_id: string
  probability?: number | null
  spc_status?: string | null
  risk_level?: string | null
  residual_li?: number | null
  capacity?: number | null
  quality_defect?: number | null
}

export type AiLotRiskReasonResponse = {
  risk_reason: string
  provider?: string | null
  error: string | null
}

/** Local vLLM risk_reason for analysis_lots (no chat compose). */
export async function proxyLotRiskReason(
  body: AiLotRiskReasonRequest,
): Promise<AiLotRiskReasonResponse> {
  const res = await fetch(`${aiServiceBase()}/lot-risk-reason`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ai-service /lot-risk-reason ${res.status}: ${text.slice(0, 200)}`)
  }

  return (await res.json()) as AiLotRiskReasonResponse
}
