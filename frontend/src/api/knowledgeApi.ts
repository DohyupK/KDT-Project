import { apiClient } from './axios'

export type KnowledgeAnalyzeResponse = {
  id: number
  reply: string
  created_at: string
  mode: string
  provider: string | null
  error: string | null
}

export const knowledgeApi = {
  /** Dedicated Knowledge AI analysis — no /chat security gate; answer stored in AI_LIBRARY_ANALYSIS. */
  async analyze(message: string): Promise<KnowledgeAnalyzeResponse> {
    const { data } = await apiClient.post<KnowledgeAnalyzeResponse>('/knowledge/analyze', {
      message,
    })
    return data
  },
}
