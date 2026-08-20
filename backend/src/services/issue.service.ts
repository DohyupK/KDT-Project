import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import { runIssueDiagnosisAnalyze } from './knowledgeAnalyze.service.js'
import { getLotById, type LotDto } from './lot.service.js'
import { normalizeRiskLevel, type RiskLevel } from './lotScore.js'
import { isManageUser } from './userSettings.service.js'

/** Open issues: not completed. risk_level comes from ANALYSIS_LOTS. */
const OPEN_ISSUES = `i.completed_at IS NULL`
const RISK_LEVELS = new Set(['심각', '주의', '안정', '높음', '중간', '낮음', 'A', 'B', 'C'])

export type IssueListItem = {
  issueId: string
  createdAt: string
  lotId: string
  riskLevel: RiskLevel
  /** ANALYSIS_LOTS.spc_status (목록 SPC 필터용) */
  spcStatus: string | null
  issueContent: string
  /** 이슈 처리 관리에 조치 내용이 입력되었는지 */
  hasAction: boolean
}

/** ANALYSIS_LOTS 스냅샷 (이슈 상세 분석 UI) */
export type IssueAnalysis = {
  lotId: string
  probability: number | null
  spcStatus: string | null
  riskLevel: RiskLevel
  riskReason: string | null
  createdAt: string | null
  scoredAt: string | null
}

export type IssueDetail = IssueListItem & {
  actionContent: string | null
  assigneeUserId: string | null
  assigneeName: string | null
  /** completed_at 존재 */
  completed: boolean
  completedAt: string | null
  analysis: IssueAnalysis | null
}

type IssueRow = {
  issue_id: string
  lot_id: string
  created_at: Date | string
  risk_level: string | null
  spc_status?: string | null
  issue_content: string
  action_content: string | null
  assignee_user_id: string | null
  assignee_name?: string | null
  completed_at: Date | string | null
  analysis_lot_id?: string | null
  analysis_probability?: number | null
  analysis_spc_status?: string | null
  analysis_risk_reason?: string | null
  analysis_created_at?: Date | string | null
  analysis_scored_at?: Date | string | null
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (value == null) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function toRisk(level: string | null | undefined): RiskLevel {
  return normalizeRiskLevel(level)
}

function isCompleted(row: { completed_at: Date | string | null }): boolean {
  return row.completed_at != null
}

function toAnalysis(row: IssueRow): IssueAnalysis | null {
  const joined =
    row.analysis_lot_id != null ||
    row.risk_level != null ||
    row.spc_status != null ||
    row.analysis_probability != null ||
    row.analysis_spc_status != null ||
    row.analysis_risk_reason != null ||
    row.analysis_created_at != null ||
    row.analysis_scored_at != null
  if (!joined) return null

  const probability =
    row.analysis_probability != null ? Number(row.analysis_probability) : null

  return {
    lotId: row.analysis_lot_id ?? row.lot_id,
    probability: probability != null && Number.isFinite(probability) ? probability : null,
    spcStatus: row.analysis_spc_status ?? row.spc_status ?? null,
    riskLevel: toRisk(row.risk_level),
    riskReason: row.analysis_risk_reason ?? null,
    createdAt: row.analysis_created_at ? formatDateTime(row.analysis_created_at) : null,
    scoredAt: row.analysis_scored_at ? formatDateTime(row.analysis_scored_at) : null,
  }
}

function toListItem(row: IssueRow): IssueListItem {
  return {
    issueId: row.issue_id,
    createdAt: formatDateTime(row.created_at),
    lotId: row.lot_id,
    riskLevel: toRisk(row.risk_level),
    spcStatus: row.spc_status ?? row.analysis_spc_status ?? null,
    issueContent: row.issue_content,
    hasAction: Boolean(row.action_content?.trim()),
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
    analysis: toAnalysis(row),
  }
}

export type IssueListQuery = {
  search?: string
  date?: string
  lotId?: string
  riskLevel?: string
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
}

const ISSUE_SELECT = `i.issue_id, i.lot_id, i.created_at, i.issue_content,
            i.action_content, i.assignee_user_id, i.completed_at,
            a.risk_level, a.spc_status`

const ISSUE_DETAIL_SELECT = `i.issue_id, i.lot_id, i.created_at, i.issue_content,
            i.action_content, i.assignee_user_id, i.completed_at,
            a.lot_id AS analysis_lot_id,
            a.probability AS analysis_probability,
            a.spc_status AS analysis_spc_status,
            a.risk_level,
            a.risk_reason AS analysis_risk_reason,
            a.created_at AS analysis_created_at,
            a.scored_at AS analysis_scored_at`

export async function listOpenIssues(q: IssueListQuery): Promise<{
  issues: IssueListItem[]
  total: number
}> {
  validateIssueListQuery(q)

  const where = [`(${OPEN_ISSUES})`]
  const params: unknown[] = []

  if (q.search?.trim()) {
    const s = `%${q.search.trim()}%`
    where.push('(i.issue_id LIKE ? OR i.lot_id LIKE ? OR i.issue_content LIKE ?)')
    params.push(s, s, s)
  }
  if (q.date?.trim()) {
    where.push('DATE(i.created_at) = ?')
    params.push(q.date.trim())
  }
  if (q.lotId?.trim()) {
    where.push('i.lot_id = ?')
    params.push(q.lotId.trim())
  }
  if (q.riskLevel?.trim()) {
    where.push('a.risk_level = ?')
    params.push(q.riskLevel.trim())
  }

  const whereSql = where.join(' AND ')
  const fromSql = `FROM ISSUES i
     LEFT JOIN ANALYSIS_LOTS a ON a.lot_id = i.lot_id
     WHERE ${whereSql}`

  const countRows = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c ${fromSql}`,
    params,
  )
  const rows = await query<IssueRow[]>(
    `SELECT ${ISSUE_SELECT}
     ${fromSql}
     ORDER BY i.created_at DESC`,
    params,
  )

  return {
    issues: rows.map(toListItem),
    total: Number(countRows[0]?.c ?? 0),
  }
}

export async function listOpenIssueDetailsByLotId(lotId: string): Promise<IssueDetail[]> {
  const rows = await query<IssueRow[]>(
    `SELECT ${ISSUE_DETAIL_SELECT},
            u.name AS assignee_name
     FROM ISSUES i
     LEFT JOIN ANALYSIS_LOTS a ON a.lot_id = i.lot_id
     LEFT JOIN USERS u ON u.user_id = i.assignee_user_id
     WHERE i.lot_id = ? AND i.completed_at IS NULL
     ORDER BY i.created_at DESC`,
    [lotId],
  )
  return rows.map(toDetail)
}

export async function getIssueById(issueId: string): Promise<IssueDetail> {
  const rows = await query<IssueRow[]>(
    `SELECT ${ISSUE_DETAIL_SELECT},
            u.name AS assignee_name
     FROM ISSUES i
     LEFT JOIN ANALYSIS_LOTS a ON a.lot_id = i.lot_id
     LEFT JOIN USERS u ON u.user_id = i.assignee_user_id
     WHERE i.issue_id = ? LIMIT 1`,
    [issueId],
  )
  if (!rows[0]) throw new AppError(404, '이슈를 찾을 수 없습니다.')
  return toDetail(rows[0])
}

export async function updateIssue(
  issueId: string,
  body: {
    actionContent?: string | null
    completed?: boolean
    assigneeUserId?: string | null
  },
  _actor: { userId: string; name: string },
): Promise<IssueDetail> {
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

  const current = await getIssueById(issueId)
  const completed = body.completed ?? current.completed
  const actionContent =
    body.actionContent !== undefined ? body.actionContent : current.actionContent

  let assigneeUserId = current.assigneeUserId
  if (body.assigneeUserId !== undefined) {
    const raw = body.assigneeUserId == null ? '' : String(body.assigneeUserId).trim()
    if (!raw) {
      assigneeUserId = null
    } else {
      if (!(await isManageUser(raw))) {
        throw new AppError(400, '담당자는 관리자만 지정할 수 있습니다.')
      }
      assigneeUserId = raw
    }
  }

  // 완료 → 과거 자료 (completed_at).
  await query(
    `UPDATE ISSUES SET
       action_content = ?, assignee_user_id = ?,
       completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, NOW()) ELSE NULL END
     WHERE issue_id = ?`,
    [actionContent, assigneeUserId, completed ? 1 : 0, issueId],
  )

  if (!current.completed && completed) {
    void runIssueDiagnosisAnalyze(issueId).catch((err) => {
      console.error(
        '[updateIssue] issue diagnosis background failed:',
        issueId,
        err instanceof Error ? err.message : err,
      )
    })
  }

  return getIssueById(issueId)
}

/** 라이브러리 과거 자료 목록 (위험도 제외) */
export type PastIssueListItem = {
  issueId: string
  createdAt: string
  lotId: string
  issueContent: string
  assigneeName: string | null
  completedAt: string | null
}

export async function listPastIssues(): Promise<{ items: PastIssueListItem[]; total: number }> {
  const rows = await query<
    {
      issue_id: string
      lot_id: string
      created_at: Date | string
      issue_content: string
      assignee_name: string | null
      completed_at: Date | string | null
    }[]
  >(
    `SELECT i.issue_id, i.lot_id, i.created_at, i.issue_content, i.completed_at,
            u.name AS assignee_name
     FROM ISSUES i
     LEFT JOIN USERS u ON u.user_id = i.assignee_user_id
     WHERE i.completed_at IS NOT NULL
     ORDER BY i.completed_at DESC, i.created_at DESC`,
  )

  const items = rows.map((r) => ({
    issueId: r.issue_id,
    createdAt: formatDateTime(r.created_at),
    lotId: r.lot_id,
    issueContent: r.issue_content,
    assigneeName: r.assignee_name?.trim() || null,
    completedAt: r.completed_at ? formatDateTime(r.completed_at) : null,
  }))

  return { items, total: items.length }
}

/** 과거 자료 상세: 조치내용 + LOT 분석/공정 수치 + ANALYSIS_LOTS 스냅샷 + ISSUES.analysis_content. */
export type PastIssueLot = {
  lotId: string
  recordedAt: string
  riskLevel: RiskLevel
  riskReason: string | null
  defectProb: number | null
  residualLithium: number | null
  residualMargin: number | null
  spcStatus: string | null
  d50: number | null
  d90: number | null
  metalImpurity: number | null
  lithiumInput: number | null
  additiveRatio: number | null
  processTime: number | null
  sinteringTemp: number | null
  humidity: number | null
  tankPressure: number | null
  operatorId: string | null
  qualityDefect: boolean
}

export type PastIssueDetail = PastIssueListItem & {
  actionContent: string | null
  analysis: IssueAnalysis | null
  lot: PastIssueLot | null
  analysisContent: string | null
}

function toPastIssueLot(dto: LotDto): PastIssueLot {
  return {
    lotId: dto.lotId,
    recordedAt: dto.recordedAt,
    riskLevel: dto.riskLevel,
    riskReason: dto.riskReason,
    defectProb: dto.defectProb,
    residualLithium: dto.residualLithium,
    residualMargin: dto.residualMargin,
    spcStatus: dto.spcStatus,
    d50: dto.d50,
    d90: dto.d90,
    metalImpurity: dto.metalImpurity,
    lithiumInput: dto.lithiumInput,
    additiveRatio: dto.additiveRatio,
    processTime: dto.processTime,
    sinteringTemp: dto.sinteringTemp,
    humidity: dto.humidity,
    tankPressure: dto.tankPressure,
    operatorId: dto.operatorId,
    qualityDefect: dto.qualityDefect,
  }
}

export async function getPastIssueById(issueId: string): Promise<PastIssueDetail> {
  const issue = await getIssueById(issueId)
  if (!issue.completed) {
    throw new AppError(404, '과거 자료(완료 이슈)를 찾을 수 없습니다.')
  }

  let lot: PastIssueLot | null = null
  try {
    lot = toPastIssueLot(await getLotById(issue.lotId))
  } catch (err) {
    if (!(err instanceof AppError) || err.statusCode !== 404) throw err
  }

  const contentRows = await query<{ analysis_content: string | null }[]>(
    `SELECT analysis_content FROM ISSUES WHERE issue_id = ? LIMIT 1`,
    [issueId],
  )
  const analysisContent = contentRows[0]?.analysis_content?.trim() || null

  return {
    issueId: issue.issueId,
    createdAt: issue.createdAt,
    lotId: issue.lotId,
    issueContent: issue.issueContent,
    assigneeName: issue.assigneeName,
    completedAt: issue.completedAt,
    actionContent: issue.actionContent,
    analysis: issue.analysis,
    lot,
    analysisContent,
  }
}
