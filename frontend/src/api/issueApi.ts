import { apiClient } from './axios'

export type IssueStatus = '접수' | '분석 중' | '조치 중' | '완료'
/** Canonical ops risk labels (legacy 높음|중간|낮음 still accepted from older rows). */
export type IssueRiskLevel = '심각' | '주의' | '안정'

export function normalizeIssueRiskLevel(level: string | null | undefined): IssueRiskLevel {
  const v = (level || '').trim()
  if (v === '심각' || v === '높음' || v === 'A') return '심각'
  if (v === '주의' || v === '중간' || v === 'B') return '주의'
  return '안정'
}

export type IssueListItem = {
  issueId: string
  occurredAt: string
  lotId: string
  riskLevel: IssueRiskLevel
  status: IssueStatus
  title: string
}

export type IssueDetail = IssueListItem & {
  actionContent: string | null
  assigneeUserId: string | null
  assigneeName: string | null
  completed: boolean
  completedAt: string | null
}

export type IssueListParams = {
  search?: string
  date?: string
  lotId?: string
  riskLevel?: IssueRiskLevel
  status?: IssueStatus
}

export type UpdateIssueBody = {
  status: IssueStatus
  actionContent: string | null
  completed: boolean
}

export const issueApi = {
  list: (params?: IssueListParams) =>
    apiClient.get<{ issues: IssueListItem[]; total: number }>('/issues', { params }),

  getById: (issueId: string) =>
    apiClient.get<{ issue: IssueDetail }>(`/issues/${encodeURIComponent(issueId)}`),

  update: (issueId: string, body: UpdateIssueBody) =>
    apiClient.put<{ issue: IssueDetail; message: string }>(
      `/issues/${encodeURIComponent(issueId)}`,
      body,
    ),
}
