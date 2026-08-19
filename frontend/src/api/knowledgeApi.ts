import { apiClient } from './axios'

export type KnowledgeAnalyzeResponse = {
  id: number
  reply: string
  created_at: string
  mode: string
  provider: string | null
  error: string | null
}

export type KnowledgeAnalyzeBody = { message: string } | { issueId: string }

export const knowledgeApi = {
  /** Dedicated Knowledge AI analysis — API_LLM. message→user row, issueId→ISSUES.analysis_content. */
  async analyze(body: KnowledgeAnalyzeBody): Promise<KnowledgeAnalyzeResponse> {
    const { data } = await apiClient.post<KnowledgeAnalyzeResponse>('/knowledge/analyze', body)
    return data
  },
}
