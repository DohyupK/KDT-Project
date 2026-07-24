export type AiChatFeatures = Record<string, string | number | undefined>

export type AiChatRequest = {
  message: string
  features?: AiChatFeatures | null
  fillThreshold?: number | null
  need_guideline?: boolean
}

export type AiPredictResult = {
  defect_status: number
  probability: number
  applied_threshold: number
  top_risk_factors: string[]
}

export type AiChatResponse = {
  reply: string
  mode: string
  provider?: string
  predict: AiPredictResult | null
  error: string | null
}

export async function proxyChat(body: AiChatRequest): Promise<AiChatResponse> {
  const base = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: body.message,
      features: body.features ?? undefined,
      fillThreshold: body.fillThreshold ?? undefined,
      need_guideline: body.need_guideline ?? false,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ai-service /chat ${res.status}: ${text.slice(0, 200)}`)
  }

  return (await res.json()) as AiChatResponse
}
