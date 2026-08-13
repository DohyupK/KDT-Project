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
  page_context?: {
    route?: string
    focusId?: string | null
    focus_id?: string | null
    focusPayload?: unknown
    focus_payload?: unknown
    pagePayload?: unknown
    page_payload?: unknown
    supplement?: Record<string, unknown> | null
    supplementHints?: string[]
    supplement_hints?: string[]
  } | null
  enable_api_llm?: boolean | null
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
  timing?: Record<string, unknown> | null
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

export async function proxyChat(body: AiChatRequest): Promise<AiChatResponse> {
  const pc = body.page_context
  const page_context = pc
    ? {
        route: pc.route ?? '/',
        focus_id: pc.focus_id ?? pc.focusId ?? null,
        focus_payload: pc.focus_payload ?? pc.focusPayload ?? null,
        page_payload: pc.page_payload ?? pc.pagePayload ?? null,
        supplement: pc.supplement ?? null,
        supplement_hints: pc.supplement_hints ?? pc.supplementHints ?? [],
      }
    : undefined

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
      page_context,
      enable_api_llm: body.enable_api_llm ?? undefined,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ai-service /chat ${res.status}: ${text.slice(0, 200)}`)
  }

  return (await res.json()) as AiChatResponse
}

/** Open upstream SSE for general chat; caller pipes the body. */
export async function proxyChatStream(body: AiChatRequest): Promise<Response> {
  const pc = body.page_context
  const page_context = pc
    ? {
        route: pc.route ?? '/',
        focus_id: pc.focus_id ?? pc.focusId ?? null,
        focus_payload: pc.focus_payload ?? pc.focusPayload ?? null,
        page_payload: pc.page_payload ?? pc.pagePayload ?? null,
        supplement: pc.supplement ?? null,
        supplement_hints: pc.supplement_hints ?? pc.supplementHints ?? [],
      }
    : undefined

  const res = await fetch(`${aiServiceBase()}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message: body.message,
      thread_id: body.thread_id ?? undefined,
      user_id: body.user_id ?? undefined,
      features: body.features ?? undefined,
      fillThreshold: body.fillThreshold ?? undefined,
      need_guideline: body.need_guideline ?? false,
      llm_mode: body.llm_mode ?? undefined,
      llm_credentials: body.llm_credentials ?? undefined,
      page_context,
      enable_api_llm: body.enable_api_llm ?? undefined,
    }),
  })
  return res
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

export type AiExplainLotRequest = {
  features: Record<string, string | number | null>
  spc_refs?: Record<string, number> | null
}

export type AiExplainLotResponse = {
  drivers_json: Record<string, unknown>
  error: string | null
}

export async function proxyExplainLot(
  body: AiExplainLotRequest,
): Promise<AiExplainLotResponse> {
  return postAiJson<AiExplainLotResponse>('/explain-lot', body)
}

export type AiLotRecommendedActionRequest = {
  lot_id: string
  risk_level?: string | null
  probability?: number | null
  residual_li?: number | null
  spc_status?: string | null
  drivers_json?: Record<string, unknown>
}

export type AiLotRecommendedActionResponse = {
  summary: string
  steps: Array<{ order: number; text: string; doc_id?: string | null }>
  sources: Array<{ doc_id: string; title?: string | null; path?: string | null }>
  drivers_json: Record<string, unknown>
  status: string
  error: string | null
}

export async function proxyLotRecommendedAction(
  body: AiLotRecommendedActionRequest,
): Promise<AiLotRecommendedActionResponse> {
  return postAiJson<AiLotRecommendedActionResponse>('/lot-recommended-action', body)
}
