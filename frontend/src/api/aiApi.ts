import axios from 'axios'

/** Proxied to ai-service via next.config rewrite (`/ai` → :8800). */
export const aiClient = axios.create({
  baseURL: '/ai',
  timeout: 60_000,
})

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

export type ChatRequest = {
  message: string
  features?: ChatFeatures | null
  fillThreshold?: number | null
}

export type ChatResponse = {
  reply: string
  mode: string
  predict: ChatPredictResult | null
  error: string | null
}

export async function postChat(body: ChatRequest): Promise<ChatResponse> {
  const { data } = await aiClient.post<ChatResponse>('/chat', body)
  return data
}

export async function getAiHealth(): Promise<{ status: string; model_version?: string }> {
  const { data } = await aiClient.get<{ status: string; model_version?: string }>('/health')
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
