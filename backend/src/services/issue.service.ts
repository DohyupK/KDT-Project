import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import type { RiskLevel } from './lotScore.js'

const OPEN_RISK = `status <> '완료' AND risk_level IN ('높음', '중간')`

export type IssueListItem = {
  issueId: string
  occurredAt: string
  lotId: string
  riskLevel: RiskLevel
  status: string
  title: string
}

export type IssueDetail = IssueListItem & {
  actionContent: string | null
  assigneeUserId: string | null
  assigneeName: string | null
  /** status=완료 또는 completed_at 존재 */
  completed: boolean
  completedAt: string | null
}

type IssueRow = {
  issue_id: string
  lot_id: string
  occurred_at: Date | string
  risk_level: string
  status: string
  title: string
  action_content: string | null
  assignee_user_id: string | null
  assignee_name?: string | null
  completed_at: Date | string | null
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (value == null) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toRisk(level: string): RiskLevel {
  if (level === '높음' || level === '중간') return level
  return '낮음'
}

function isCompleted(row: { status: string; completed_at: Date | string | null }): boolean {
  return row.status === '완료' || row.completed_at != null
}

function toListItem(row: IssueRow): IssueListItem {
  return {
    issueId: row.issue_id,
    occurredAt: formatDateTime(row.occurred_at),
    lotId: row.lot_id,
    riskLevel: toRisk(row.risk_level),
    status: row.status,
    title: row.title,
  }
}

function toDetail(row: IssueRow): IssueDetail {
  return {
    ...toListItem(row),
    actionContent: row.action_content,
    assigneeUserId: row.assignee_user_id,
    assigneeName: row.assignee_name ?? null,
    completed: isCompleted(row),
    completedAt: row.completed_at ? formatDateTime(row.completed_at) : null,
  }
}

export type IssueListQuery = {
  search?: string
  date?: string
  lotId?: string
  riskLevel?: string
  status?: string
}

export async function listOpenIssues(q: IssueListQuery): Promise<{
  issues: IssueListItem[]
  total: number
}> {
  const where = [`(${OPEN_RISK})`]
  const params: unknown[] = []

  if (q.search?.trim()) {
    const s = `%${q.search.trim()}%`
    where.push('(issue_id LIKE ? OR lot_id LIKE ? OR title LIKE ?)')
    params.push(s, s, s)
  }
  if (q.date?.trim()) {
    where.push('DATE(occurred_at) = ?')
    params.push(q.date.trim())
  }
  if (q.lotId?.trim()) {
    where.push('lot_id = ?')
    params.push(q.lotId.trim())
  }
  if (q.riskLevel === '높음' || q.riskLevel === '중간') {
    where.push('risk_level = ?')
    params.push(q.riskLevel)
  }
  if (q.status?.trim() && q.status !== '완료') {
    where.push('status = ?')
    params.push(q.status.trim())
  }

  const whereSql = where.join(' AND ')
  const countRows = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM issues WHERE ${whereSql}`,
    params,
  )
  const rows = await query<IssueRow[]>(
    `SELECT issue_id, lot_id, occurred_at, risk_level, status, title,
            action_content, assignee_user_id, completed_at
     FROM issues WHERE ${whereSql}
     ORDER BY occurred_at DESC`,
    params,
  )

  return {
    issues: rows.map(toListItem),
    total: Number(countRows[0]?.c ?? 0),
  }
}

export async function getIssueById(issueId: string): Promise<IssueDetail> {
  const rows = await query<IssueRow[]>(
    `SELECT i.issue_id, i.lot_id, i.occurred_at, i.risk_level, i.status, i.title,
            i.action_content, i.assignee_user_id, i.completed_at,
            u.name AS assignee_name
     FROM issues i
     LEFT JOIN users u ON u.user_id = i.assignee_user_id
     WHERE i.issue_id = ? LIMIT 1`,
    [issueId],
  )
  if (!rows[0]) throw new AppError(404, '이슈를 찾을 수 없습니다.')
  return toDetail(rows[0])
}

const STATUSES = new Set(['접수', '분석 중', '조치 중', '완료'])

export async function updateIssue(
  issueId: string,
  body: {
    status?: string
    actionContent?: string | null
    completed?: boolean
  },
  actor: { userId: string; name: string },
): Promise<IssueDetail> {
  const current = await getIssueById(issueId)

  let status = body.status ?? current.status
  let completed = body.completed ?? current.completed
  if (completed) status = '완료'
  if (status === '완료') completed = true
  if (!STATUSES.has(status)) throw new AppError(400, '처리 상태가 올바르지 않습니다.')

  const actionContent =
    body.actionContent !== undefined ? body.actionContent : current.actionContent

  // 완료 → 과거 자료 (completed_at). handover INSERT 없음.
  await query(
    `UPDATE issues SET
       status = ?, action_content = ?, assignee_user_id = ?,
       completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, NOW()) ELSE NULL END
     WHERE issue_id = ?`,
    [status, actionContent, actor.userId, completed ? 1 : 0, issueId],
  )

  return getIssueById(issueId)
}

/** 라이브러리 과거 자료 목록 (위험도·처리상태 제외) */
export type PastIssueListItem = {
  issueId: string
  occurredAt: string
  lotId: string
  title: string
  assigneeName: string | null
  completedAt: string | null
}

export async function listPastIssues(): Promise<{ items: PastIssueListItem[]; total: number }> {
  const rows = await query<
    {
      issue_id: string
      lot_id: string
      occurred_at: Date | string
      title: string
      assignee_name: string | null
      completed_at: Date | string | null
    }[]
  >(
    `SELECT i.issue_id, i.lot_id, i.occurred_at, i.title, i.completed_at,
            u.name AS assignee_name
     FROM issues i
     LEFT JOIN users u ON u.user_id = i.assignee_user_id
     WHERE i.status = '완료' OR i.completed_at IS NOT NULL
     ORDER BY i.completed_at DESC, i.occurred_at DESC`,
  )

  const items = rows.map((r) => ({
    issueId: r.issue_id,
    occurredAt: formatDateTime(r.occurred_at),
    lotId: r.lot_id,
    title: r.title,
    assigneeName: r.assignee_name?.trim() || null,
    completedAt: r.completed_at ? formatDateTime(r.completed_at) : null,
  }))

  return { items, total: items.length }
}

/** 과거 자료 상세: 조치내용 + LOT 보조 (양식 TBD). issue_analyses 없음. */
export type PastIssueDetail = PastIssueListItem & {
  actionContent: string | null
  lot: {
    lotId: string
    riskReason: string | null
    defectProb: number | null
    residualLithium: number | null
    spcStatus: string | null
  } | null
}

export async function getPastIssueById(issueId: string): Promise<PastIssueDetail> {
  const issue = await getIssueById(issueId)
  if (!issue.completed) {
    throw new AppError(404, '과거 자료(완료 이슈)를 찾을 수 없습니다.')
  }

  const lotRows = await query<
    {
      lot_id: string
      risk_reason: string | null
      defect_prob: number | null
      residual_lithium: number | null
      spc_status: string | null
    }[]
  >(
    `SELECT lot_id, risk_reason, defect_prob, residual_lithium, spc_status
     FROM lots WHERE lot_id = ? LIMIT 1`,
    [issue.lotId],
  )
  const lot = lotRows[0]

  return {
    issueId: issue.issueId,
    occurredAt: issue.occurredAt,
    lotId: issue.lotId,
    title: issue.title,
    assigneeName: issue.assigneeName,
    completedAt: issue.completedAt,
    actionContent: issue.actionContent,
    lot: lot
      ? {
          lotId: lot.lot_id,
          riskReason: lot.risk_reason,
          defectProb: lot.defect_prob,
          residualLithium: lot.residual_lithium,
          spcStatus: lot.spc_status,
        }
      : null,
  }
}

export type HandoverHistoryItem = {
  historyId: number
  issueId: string
  lotId: string
  riskLevel: RiskLevel
  situation: string
  action: string | null
  cause: string | null
  handoverFrom: string | null
  handoverTo: string | null
  manager: string | null
  eventDate: string
  date: string
  category: string | null
  archivedAt: string
}

export async function listHandoverHistory(): Promise<{ items: HandoverHistoryItem[]; total: number }> {
  const rows = await query<
    {
      history_id: number | bigint
      issue_id: string
      lot_id: string
      risk_level: string
      situation: string
      action: string | null
      cause: string | null
      handover_from: string | null
      handover_to: string | null
      manager: string | null
      event_date: Date | string
      category: string | null
      archived_at: Date | string
    }[]
  >(
    `SELECT history_id, issue_id, lot_id, risk_level, situation, action, cause,
            handover_from, handover_to, manager, event_date, category, archived_at
     FROM handover_history
     ORDER BY archived_at DESC`,
  )

  const items = rows.map((r) => {
    const from = r.handover_from?.trim() || r.manager?.trim() || null
    const eventDate = formatDate(r.event_date)
    return {
      historyId: Number(r.history_id),
      issueId: r.issue_id,
      lotId: r.lot_id,
      riskLevel: toRisk(r.risk_level),
      situation: r.situation,
      action: r.action,
      cause: r.cause,
      handoverFrom: from,
      handoverTo: r.handover_to?.trim() || null,
      manager: from,
      eventDate,
      date: eventDate,
      category: r.category,
      archivedAt: formatDateTime(r.archived_at),
    }
  })

  return { items, total: items.length }
}
