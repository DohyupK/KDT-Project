import { apiClient } from './axios'
import type {
  HandoverSummaryResponse,
  IssueDetailResponse,
  IssueListResponse,
  UpdateIssueRequest,
  UpdateIssueResponse,
} from '@/types'

export interface IssueListParams {
  search?: string
  date?: string
  lot?: string
  risk?: string
  status?: string
}

export const issueApi = {
  getIssues: (params: IssueListParams = {}) =>
    apiClient.get<IssueListResponse>('/issues', { params }),

  getIssueById: (id: string) => apiClient.get<IssueDetailResponse>(`/issues/${id}`),

  updateIssue: (id: string, payload: UpdateIssueRequest) =>
    apiClient.put<UpdateIssueResponse>(`/issues/${id}`, payload),

  getHandoverSummary: () => apiClient.get<HandoverSummaryResponse>('/issues/handover/summary'),
}
