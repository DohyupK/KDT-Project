import type { SpcMetric } from '@/components/SpcAnalysisPanel'

export const COMPLETED_KNOWLEDGE_STORAGE_KEY = 'completed_knowledge_logs'
export const COMPLETED_ISSUE_IDS_STORAGE_KEY = 'completed_issue_ids'
export const COMPLETED_KNOWLEDGE_UPDATED_EVENT = 'completed-knowledge-updated'

export type TransferredKnowledgeLog = {
  id: string
  sourceIssueId: string
  manager: string
  date: string
  title: string
  summary: string
  process: string
  lot: string
  detail: string
  risk: '높음' | '중간' | '낮음'
  status: '접수' | '분석 중' | '조치 중' | '완료'
  occurredAt: string
  anomaly: string
  residualLiMargin: number
  defectProbability: number
  spcMetrics: SpcMetric[]
}

export function toTransferredKnowledgeId(issueId: string) {
  return `DOC-${issueId}`
}

export function readCompletedIssueIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(COMPLETED_ISSUE_IDS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function markIssueIdCompleted(issueId: string) {
  if (typeof window === 'undefined') return
  try {
    const current = new Set(readCompletedIssueIds())
    current.add(issueId)
    window.localStorage.setItem(
      COMPLETED_ISSUE_IDS_STORAGE_KEY,
      JSON.stringify(Array.from(current)),
    )
  } catch {
    // ignore quota / private mode
  }
}

export function readCompletedKnowledgeLogs(): TransferredKnowledgeLog[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(COMPLETED_KNOWLEDGE_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is TransferredKnowledgeLog => {
      if (!item || typeof item !== 'object') return false
      const row = item as Record<string, unknown>
      return typeof row.id === 'string' && row.id.length > 0
    })
  } catch {
    return []
  }
}

function notifyKnowledgeUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(COMPLETED_KNOWLEDGE_UPDATED_EVENT))
}

export function appendCompletedKnowledgeLog(
  log: TransferredKnowledgeLog,
): 'added' | 'exists' | 'failed' {
  if (typeof window === 'undefined') return 'failed'
  try {
    const current = readCompletedKnowledgeLogs()
    const alreadyExists = current.some(
      (item) =>
        item.id === log.id ||
        (typeof item.sourceIssueId === 'string' && item.sourceIssueId === log.sourceIssueId),
    )
    if (alreadyExists) {
      markIssueIdCompleted(log.sourceIssueId)
      notifyKnowledgeUpdated()
      return 'exists'
    }
    const next = [log, ...current]
    window.localStorage.setItem(COMPLETED_KNOWLEDGE_STORAGE_KEY, JSON.stringify(next))
    markIssueIdCompleted(log.sourceIssueId)
    notifyKnowledgeUpdated()
    return 'added'
  } catch {
    return 'failed'
  }
}
