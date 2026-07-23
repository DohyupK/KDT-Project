import { apiClient } from './axios'
import type {
  CreateKnowledgeActionRequest,
  KnowledgeActionMutationResponse,
  KnowledgeActionsResponse,
  KnowledgeDocumentDetailResponse,
  KnowledgeDocumentsResponse,
  KnowledgeReportRefreshResponse,
  KnowledgeReportResponse,
} from '@/types'

export interface KnowledgeDocumentsParams {
  manager?: string
  date?: string
  keyword?: string
}

export const knowledgeApi = {
  getDocuments: (params: KnowledgeDocumentsParams = {}) =>
    apiClient.get<KnowledgeDocumentsResponse>('/knowledge/documents', { params }),

  getDocumentById: (id: string) =>
    apiClient.get<KnowledgeDocumentDetailResponse>(`/knowledge/documents/${id}`),

  getActions: () => apiClient.get<KnowledgeActionsResponse>('/knowledge/actions'),

  createAction: (payload: CreateKnowledgeActionRequest) =>
    apiClient.post<KnowledgeActionMutationResponse>('/knowledge/actions', payload),

  updateAction: (id: number, payload: CreateKnowledgeActionRequest) =>
    apiClient.put<KnowledgeActionMutationResponse>(`/knowledge/actions/${id}`, payload),

  deleteAction: (id: number) =>
    apiClient.delete<{ message: string }>(`/knowledge/actions/${id}`),

  getReport: () => apiClient.get<KnowledgeReportResponse>('/knowledge/report'),

  refreshReport: () =>
    apiClient.post<KnowledgeReportRefreshResponse>('/knowledge/report/refresh'),
}
