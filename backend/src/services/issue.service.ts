import { query, withTransaction } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import { normalizeRiskLevel, type RiskLevel } from './lotScore.js'

const OPEN_RISK = `status <> '완료' AND risk_level IN ('심각', '주의', '높음', '중간', 'A', 'B')`
const RISK_LEVELS = new Set(['심각', '주의', '안정', '높음', '중간', '낮음', 'A', 'B', 'C'])
const STATUSES = new Set(['접수', '분석 중', '조치 중', '완료'])
const SYS_HANDOVER_LOT_ID = 'LOT-SYS-HANDOVER'

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
  return normalizeRiskLevel(level)
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

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function validateIssueListQuery(q: IssueListQuery): void {
  const date = q.date?.trim()
  if (date && !isValidDate(date)) {
    throw new AppError(400, '날짜는 YYYY-MM-DD 형식이어야 합니다.')
  }

  const riskLevel = q.riskLevel?.trim()
  if (riskLevel && !RISK_LEVELS.has(riskLevel)) {
    throw new AppError(400, '위험도가 올바르지 않습니다.')
  }

  const status = q.status?.trim()
  if (status && !STATUSES.has(status)) {
    throw new AppError(400, '처리 상태가 올바르지 않습니다.')
  }
}

export async function listOpenIssues(q: IssueListQuery): Promise<{
  issues: IssueListItem[]
  total: number
}> {
  validateIssueListQuery(q)

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
  if (q.riskLevel?.trim()) {
    where.push('risk_level = ?')
    params.push(q.riskLevel.trim())
  }
  if (q.status?.trim()) {
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

export async function updateIssue(
  issueId: string,
  body: {
    status?: string
    actionContent?: string | null
    completed?: boolean
    handoverFrom?: string | null
    handoverTo?: string | null
  },
  actor: { userId: string; name: string },
): Promise<IssueDetail> {
  if (body.status !== undefined && typeof body.status !== 'string') {
    throw new AppError(400, '처리 상태가 올바르지 않습니다.')
  }
  if (
    body.actionContent !== undefined &&
    body.actionContent !== null &&
    typeof body.actionContent !== 'string'
  ) {
    throw new AppError(400, '조치 내용은 문자열이어야 합니다.')
  }
  if (body.completed !== undefined && typeof body.completed !== 'boolean') {
    throw new AppError(400, '완료 여부가 올바르지 않습니다.')
  }
  if (
    body.handoverFrom !== undefined &&
    body.handoverFrom !== null &&
    typeof body.handoverFrom !== 'string'
  ) {
    throw new AppError(400, '인계자가 올바르지 않습니다.')
  }
  if (
    body.handoverTo !== undefined &&
    body.handoverTo !== null &&
    typeof body.handoverTo !== 'string'
  ) {
    throw new AppError(400, '인수자가 올바르지 않습니다.')
  }

  const current = await getIssueById(issueId)
  const wasCompleted = current.completed

  let status = body.status?.trim() || current.status
  let completed = body.completed ?? current.completed
  if (completed) status = '완료'
  if (status === '완료') completed = true
  if (!STATUSES.has(status)) throw new AppError(400, '처리 상태가 올바르지 않습니다.')

  const actionContent =
    body.actionContent !== undefined ? body.actionContent : current.actionContent

  // 완료 → 과거 자료 (completed_at); pending handover → action='완료'
  await query(
    `UPDATE issues SET
       status = ?, action_content = ?, assignee_user_id = ?,
       completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, NOW()) ELSE NULL END
     WHERE issue_id = ?`,
    [status, actionContent, actor.userId, completed ? 1 : 0, issueId],
  )

  if (completed && !wasCompleted) {
    const handoverFrom =
      (typeof body.handoverFrom === 'string' ? body.handoverFrom.trim() : '') ||
      actor.name.trim() ||
      actor.userId
    const handoverTo =
      typeof body.handoverTo === 'string' && body.handoverTo.trim()
        ? body.handoverTo.trim()
        : null

    await query(
      `UPDATE handover_history
       SET action = '완료',
           handover_to = COALESCE(?, handover_to),
           handover_from = COALESCE(?, handover_from),
           manager = COALESCE(?, manager),
           archived_at = COALESCE(archived_at, NOW())
       WHERE issue_id = ?
         AND (action IS NULL OR TRIM(action) = '' OR action <> '완료')`,
      [handoverTo, handoverFrom, handoverFrom, issueId],
    )
  }

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
      probability: number | null
      residual_lithium: number | null
      spc_status: string | null
    }[]
  >(
    `SELECT l.id AS lot_id, a.risk_reason,
            COALESCE(j.probability, a.probability) AS probability,
            j.residual_li AS residual_lithium, a.spc_status
     FROM lots l
     LEFT JOIN analysis_lots a ON a.lot_id = l.id
     LEFT JOIN judgment_lots j ON j.lot_id = l.id
     WHERE l.id = ? LIMIT 1`,
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
          defectProb: lot.probability,
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
  handoverContent: string
  action: string | null
  cause: string | null
  handoverFrom: string | null
  handoverTo: string | null
  manager: string | null
  category: string | null
  /** Registration time (DB created_at). */
  createdAt: string
  /** Completion time (DB archived_at); null/empty while pending. */
  archivedAt: string | null
}

export type HandoverListStatus = 'pending' | 'completed'

const HANDOVER_CATEGORIES = new Set(['특이사항', '전달사항', '주의사항'])

/** Ensure system lot for auto-created handover issues. */
async function ensureSysHandoverLot(
  runQuery: (sql: string, params?: unknown[]) => Promise<unknown> = query,
): Promise<string> {
  await runQuery(
    `INSERT INTO lots (id, \`timestamp\`)
     VALUES (?, NOW())
     ON DUPLICATE KEY UPDATE id = id`,
    [SYS_HANDOVER_LOT_ID],
  )
  return SYS_HANDOVER_LOT_ID
}

/** ISS-yyMMdd-001 daily sequence (zero-padded 3). */
async function allocateNextIssueId(
  runQuery: (sql: string, params?: unknown[]) => Promise<unknown>,
  day: string,
): Promise<string> {
  const prefix = `ISS-${day}-`
  const rows = (await runQuery(
    `SELECT issue_id FROM issues
     WHERE issue_id REGEXP ?
     ORDER BY issue_id DESC
     LIMIT 1
     FOR UPDATE`,
    [`^ISS-${day}-[0-9]{3}$`],
  )) as { issue_id: string }[]

  let next = 1
  const latest = rows[0]?.issue_id
  if (latest && latest.startsWith(prefix)) {
    const tail = latest.slice(prefix.length)
    const n = Number.parseInt(tail, 10)
    if (Number.isFinite(n) && n >= 0) next = n + 1
  }
  if (next > 999) {
    throw new AppError(500, '당일 이슈 번호 한도(999)를 초과했습니다.')
  }
  return `${prefix}${String(next).padStart(3, '0')}`
}

type HandoverRow = {
  history_id: number | bigint
  issue_id: string
  lot_id: string
  risk_level: string
  handover_content: string
  action: string | null
  cause: string | null
  handover_from: string | null
  handover_to: string | null
  manager: string | null
  category: string | null
  created_at: Date | string
  archived_at: Date | string | null
}

const HANDOVER_SELECT = `history_id, issue_id, lot_id, risk_level, handover_content, action, cause,
            handover_from, handover_to, manager, category, created_at, archived_at`

function mapHandoverRow(r: HandoverRow): HandoverHistoryItem {
  const from = r.handover_from?.trim() || r.manager?.trim() || null
  return {
    historyId: Number(r.history_id),
    issueId: r.issue_id,
    lotId: r.lot_id,
    riskLevel: toRisk(r.risk_level),
    handoverContent: r.handover_content,
    action: r.action,
    cause: r.cause,
    handoverFrom: from,
    handoverTo: r.handover_to?.trim() || null,
    manager: from,
    category: r.category,
    createdAt: formatDateTime(r.created_at),
    archivedAt: r.archived_at != null ? formatDateTime(r.archived_at) : null,
  }
}

export async function listHandoverHistory(
  status: HandoverListStatus = 'completed',
): Promise<{ items: HandoverHistoryItem[]; total: number }> {
  const where =
    status === 'pending'
      ? `(action IS NULL OR TRIM(action) = '' OR action <> '완료')`
      : `action = '완료'`
  const orderBy =
    status === 'completed'
      ? `ORDER BY COALESCE(archived_at, created_at) DESC`
      : `ORDER BY created_at DESC`

  const rows = await query<HandoverRow[]>(
    `SELECT ${HANDOVER_SELECT}
     FROM handover_history
     WHERE ${where}
     ${orderBy}`,
  )

  const items = rows.map(mapHandoverRow)
  return { items, total: items.length }
}

export async function createHandoverNote(
  body: {
    category: string
    content: string
  },
  actor: { userId: string; name: string },
): Promise<HandoverHistoryItem> {
  const category = body.category?.trim()
  if (!category || !HANDOVER_CATEGORIES.has(category)) {
    throw new AppError(400, '인수인계 구분이 올바르지 않습니다.')
  }

  const content = body.content?.trim()
  if (!content) throw new AppError(400, '인수인계 내용을 입력해주세요.')
  if (content.length > 255) {
    throw new AppError(400, '인수인계 내용은 255자 이하여야 합니다.')
  }

  const author = actor.name.trim() || actor.userId
  const now = new Date()
  const day =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  const title = `[인수인계/${category}] ${content}`.slice(0, 255)

  const historyId = await withTransaction(async (conn) => {
    const run = (sql: string, params?: unknown[]) => conn.query(sql, params)
    const lotId = await ensureSysHandoverLot(run)
    const issueId = await allocateNextIssueId(run, day)

    await run(
      `INSERT INTO issues (issue_id, lot_id, occurred_at, risk_level, status, title, assignee_user_id)
       VALUES (?, ?, NOW(), '낮음', '접수', ?, ?)`,
      [issueId, lotId, title, actor.userId],
    )

    const result = (await run(
      `INSERT INTO handover_history (
         issue_id, lot_id, risk_level, handover_content, action, cause,
         handover_from, handover_to, manager, assignee_user_id,
         category, archived_at
       ) VALUES (?, ?, '낮음', ?, NULL, NULL, ?, NULL, ?, ?, ?, NULL)`,
      [issueId, lotId, content, author, author, actor.userId, category],
    )) as { insertId?: number | bigint }

    const id = Number(result?.insertId ?? 0)
    if (!id) throw new AppError(500, '인수인계 등록에 실패했습니다.')
    return id
  })

  const rows = await query<HandoverRow[]>(
    `SELECT ${HANDOVER_SELECT}
     FROM handover_history WHERE history_id = ? LIMIT 1`,
    [historyId],
  )
  if (!rows[0]) throw new AppError(500, '인수인계 등록에 실패했습니다.')
  return mapHandoverRow(rows[0])
}

export async function completeHandoverNote(
  historyId: number,
  actor: { userId: string; name: string },
): Promise<HandoverHistoryItem> {
  if (!Number.isFinite(historyId) || historyId <= 0) {
    throw new AppError(400, '잘못된 인수인계 ID입니다.')
  }

  const existing = await query<HandoverRow[]>(
    `SELECT ${HANDOVER_SELECT}
     FROM handover_history WHERE history_id = ? LIMIT 1`,
    [historyId],
  )
  if (!existing[0]) throw new AppError(404, '인수인계 사항을 찾을 수 없습니다.')

  const toName = actor.name.trim() || actor.userId
  await query(
    `UPDATE handover_history
     SET action = '완료',
         handover_to = COALESCE(?, handover_to),
         archived_at = COALESCE(archived_at, NOW())
     WHERE history_id = ?`,
    [toName, historyId],
  )

  const rows = await query<HandoverRow[]>(
    `SELECT ${HANDOVER_SELECT}
     FROM handover_history WHERE history_id = ? LIMIT 1`,
    [historyId],
  )
  if (!rows[0]) throw new AppError(404, '인수인계 사항을 찾을 수 없습니다.')
  return mapHandoverRow(rows[0])
}
