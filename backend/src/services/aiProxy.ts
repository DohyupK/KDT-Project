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

export async function proxyChat(body: AiChatRequest): Promise<AiChatResponse> {
  const base = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')
  const res = await fetch(`${base}/chat`, {
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
