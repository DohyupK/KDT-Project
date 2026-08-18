import { apiClient } from './axios'

export type KnowledgeAnalyzeResponse = {
  id: number
  reply: string
  created_at: string
  mode: string
  provider: string | null
  error: string | null
}

export type KnowledgeAnalyzeBody = { message: string } | { lotId: string }

export const knowledgeApi = {
  /** Dedicated Knowledge AI analysis — API_LLM; stored in AI_LIBRARY_ANALYSIS. */
  async analyze(body: KnowledgeAnalyzeBody): Promise<KnowledgeAnalyzeResponse> {
    const { data } = await apiClient.post<KnowledgeAnalyzeResponse>('/knowledge/analyze', body)
    return data
  },
}
