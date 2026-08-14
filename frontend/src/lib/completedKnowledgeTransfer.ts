export const COMPLETED_KNOWLEDGE_STORAGE_KEY = 'completed_knowledge_logs'
export const COMPLETED_ISSUE_IDS_STORAGE_KEY = 'completed_issue_ids'
export const COMPLETED_KNOWLEDGE_UPDATED_EVENT = 'completed-knowledge-updated'

/** Local-transfer payload for Knowledge LLM (spcMetrics kept as opaque for legacy storage). */
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
  spcMetrics?: unknown[]
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

/** Read localStorage knowledge logs into memory, then clear keys (one-shot for LLM). */
export function consumeLocalKnowledgeForLlm(): TransferredKnowledgeLog[] {
  const logs = readCompletedKnowledgeLogs()
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(COMPLETED_KNOWLEDGE_STORAGE_KEY)
    } catch {
      // ignore
    }
  }
  notifyKnowledgeUpdated()
  return logs
}

export function appendCompletedKnowledgeLog(
  log: TransferredKnowledgeLog,
) {
  if (typeof window === 'undefined') return
  try {
    const current = readCompletedKnowledgeLogs()
    const next = [log, ...current.filter((row) => row.id !== log.id)]
    window.localStorage.setItem(COMPLETED_KNOWLEDGE_STORAGE_KEY, JSON.stringify(next))
    if (log.sourceIssueId) {
      markIssueIdCompleted(log.sourceIssueId)
    }
    notifyKnowledgeUpdated()
  } catch {
    // ignore quota / private mode
  }
}
