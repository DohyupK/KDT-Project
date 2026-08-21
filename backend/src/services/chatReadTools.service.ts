/**
 * Authenticated, read-only data tools used only by the general chatbot.
 *
 * This module deliberately reuses existing domain services. It never writes
 * data and never opens a new public API surface.
 */
import * as inquiryService from './inquiry.service.js'
import * as issueService from './issue.service.js'
import * as lotService from './lot.service.js'

type ChatReadToolInput = {
  message: string
  route: string
  pagePayload?: unknown
  viewerUserId: string
}

type ToolResult = Record<string, unknown>

const LOT_ID_RE = /\bLOT[-_][A-Z0-9_-]+\b/gi
const ISSUE_ID_RE = /\bISS[-_][A-Z0-9_-]+\b/gi
const INQUIRY_ID_RE = /\bINQ[-_][A-Z0-9_-]+\b/gi
const LIST_INTENT_RE = /(현황|목록|건수|몇\s*건|우선|미처리|미답변|대기|처리\s*순서|점검)/i

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function uniqueIds(message: string, pattern: RegExp): string[] {
  const matches = message.match(pattern) ?? []
  return [...new Set(matches.map((value) => value.toUpperCase()))]
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function numericDelta(a: number | null, b: number | null): number | null {
  return a == null || b == null ? null : round(b - a)
}

function lotChecks(lot: lotService.LotDto): string[] {
  const checks: string[] = []
  if (lot.residualMargin != null && lot.residualMargin < 0) {
    checks.push('잔류 리튬 허용 여유가 음수이므로 상한 초과 여부를 확인하세요.')
  }
  if (lot.spcStatus && !['-', '안정', '정상'].includes(lot.spcStatus.trim())) {
    checks.push(`SPC 상태(${lot.spcStatus})의 이탈 항목과 최근 추세를 확인하세요.`)
  }
  if (lot.defectProb == null) {
    checks.push('불량 확률이 없어 AI 채점 완료 여부를 확인하세요.')
  }
  if (lot.riskReason) {
    checks.push('저장된 위험 사유와 실제 공정 이력을 대조하세요.')
  }
  if (checks.length === 0) {
    checks.push('관련 열린 이슈와 공정 이력을 함께 확인하세요.')
  }
  return checks
}

function lotResult(lot: lotService.LotDto) {
  return {
    lotId: lot.lotId,
    recordedAt: lot.recordedAt,
    riskLevel: lot.riskLevel,
    riskReason: lot.riskReason,
    defectProb: lot.defectProb,
    residualLithium: lot.residualLithium,
    residualMargin: lot.residualMargin,
    spcStatus: lot.spcStatus,
    qualityDefect: lot.qualityDefect,
    process: {
      d50: lot.d50,
      d90: lot.d90,
      metalImpurity: lot.metalImpurity,
      lithiumInput: lot.lithiumInput,
      additiveRatio: lot.additiveRatio,
      processTime: lot.processTime,
      sinteringTemp: lot.sinteringTemp,
      humidity: lot.humidity,
      tankPressure: lot.tankPressure,
    },
  }
}

function baseTool(tool: string, category: string) {
  return {
    tool,
    category,
    scope: 'authenticated_read_only',
    responseContract: ['조회 결과', '판단 근거', '권장 확인'],
  }
}

async function lookupLot(lotId: string): Promise<ToolResult> {
  const lot = await lotService.getLotById(lotId)
  return {
    ...baseTool('lot_lookup', 'LOT 조회'),
    result: lotResult(lot),
    evidence: ['LOT 공정 데이터', 'AI 판정 데이터', '잔류 리튬 판정 데이터'],
    recommendedChecks: lotChecks(lot),
  }
}

async function compareLots(lotIds: string[]): Promise<ToolResult> {
  const [a, b] = await Promise.all([
    lotService.getLotById(lotIds[0]),
    lotService.getLotById(lotIds[1]),
  ])
  const processKeys = [
    'd50',
    'd90',
    'metalImpurity',
    'lithiumInput',
    'additiveRatio',
    'processTime',
    'sinteringTemp',
    'humidity',
    'tankPressure',
  ] as const
  const processDelta = Object.fromEntries(
    processKeys.map((key) => [key, numericDelta(a[key], b[key])]),
  )

  return {
    ...baseTool('lot_compare', 'LOT 비교'),
    result: {
      a: lotResult(a),
      b: lotResult(b),
      deltaBMinusA: {
        defectProb: numericDelta(a.defectProb, b.defectProb),
        residualLithium: numericDelta(a.residualLithium, b.residualLithium),
        residualMargin: numericDelta(a.residualMargin, b.residualMargin),
        process: processDelta,
      },
    },
    evidence: ['두 LOT의 동일 공정 필드', 'AI 판정 데이터', '잔류 리튬 판정 데이터'],
    recommendedChecks: [
      '차이가 큰 공정값과 위험도·SPC 상태를 함께 비교하세요.',
      ...lotChecks(b).slice(0, 2),
    ],
  }
}

async function lookupIssue(issueId: string): Promise<ToolResult> {
  const issue = await issueService.getIssueById(issueId)
  const checks: string[] = []
  if (!issue.completed && !issue.assigneeUserId) checks.push('담당자를 먼저 지정하세요.')
  if (!issue.completed && !issue.hasAction) checks.push('조치 내용을 등록하고 처리 상태를 갱신하세요.')
  if (issue.completed) checks.push('완료 조치 내용과 관련 LOT 결과를 대조하세요.')
  if (checks.length === 0) checks.push('등록된 조치의 진행 상태를 확인하세요.')

  return {
    ...baseTool('issue_lookup', '이슈 조회'),
    result: issue,
    evidence: ['이슈 상세', '관련 LOT 분석 스냅샷'],
    recommendedChecks: checks,
  }
}

function issueFilters(pagePayload: unknown): issueService.IssueListQuery {
  const filters = asRecord(asRecord(pagePayload)?.filters) ?? {}
  return {
    search: asString(filters.search) || undefined,
    date: asString(filters.date) || undefined,
    lotId: asString(filters.lot) || undefined,
    riskLevel: asString(filters.risk) || undefined,
  }
}

function riskRank(value: unknown): number {
  const risk = asString(value).toLowerCase()
  if (['심각', '높음', 'critical', 'high', 'a'].includes(risk)) return 3
  if (['주의', '중간', 'warning', 'medium', 'b'].includes(risk)) return 2
  return 1
}

async function listIssues(pagePayload: unknown): Promise<ToolResult> {
  const listed = await issueService.listOpenIssues(issueFilters(pagePayload))
  const ordered = [...listed.issues].sort((a, b) => {
    const riskDifference = riskRank(b.riskLevel) - riskRank(a.riskLevel)
    if (riskDifference !== 0) return riskDifference
    if (a.hasAction !== b.hasAction) return a.hasAction ? 1 : -1
    return b.createdAt.localeCompare(a.createdAt)
  })
  const returned = ordered.slice(0, 10)
  return {
    ...baseTool('issue_list', '이슈 현황'),
    result: {
      total: listed.total,
      returned: returned.length,
      highRisk: listed.issues.filter((item) => riskRank(item.riskLevel) === 3).length,
      missingAction: listed.issues.filter((item) => !item.hasAction).length,
      items: returned,
    },
    evidence: ['현재 화면 필터를 적용한 열린 이슈'],
    recommendedChecks: ['고위험 → 조치 미등록 → 최근 등록 순으로 확인하세요.'],
  }
}

async function lookupInquiry(inquiryId: string, viewerUserId: string): Promise<ToolResult> {
  const { item } = await inquiryService.getInquiryByCode(inquiryId, viewerUserId)
  return {
    ...baseTool('inquiry_lookup', '문의 조회'),
    result: item,
    evidence: ['현재 로그인 사용자가 열람 가능한 문의 상세'],
    recommendedChecks: [
      item.status === '접수'
        ? '문의 내용을 확인하고 답변 대상을 지정하세요.'
        : '등록된 답변 내용과 완료 시각을 확인하세요.',
    ],
  }
}

function inquiryFilters(pagePayload: unknown) {
  const filters = asRecord(asRecord(pagePayload)?.filters) ?? {}
  const categoryMap: Record<string, string> = {
    system: '시스템 오류 제보',
    feature: '기능 개선 제안',
    business: '비즈니스 협업 문의',
  }
  const categoryKey = asString(filters.category)
  const status = asString(filters.status)
  return {
    category: categoryMap[categoryKey],
    status: status && status !== 'all' ? status : undefined,
    startDate: asString(filters.startDate) || undefined,
    endDate: asString(filters.endDate) || undefined,
    q: asString(filters.search) || undefined,
    page: 1,
    pageSize: 50,
  }
}

async function listInquiries(
  pagePayload: unknown,
  viewerUserId: string,
): Promise<ToolResult> {
  const filters = asRecord(asRecord(pagePayload)?.filters) ?? {}
  const listed = await inquiryService.listInquiries(
    inquiryFilters(pagePayload),
    viewerUserId,
  )
  const categoryKey = asString(filters.category)
  const visibleItems = categoryKey === 'etc'
    ? listed.items.filter((item) => ['기타', '불량 검사 문의'].includes(item.category))
    : listed.items
  const returned = visibleItems.slice(0, 10)
  const statusCounts = visibleItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1
    return acc
  }, {})

  return {
    ...baseTool('inquiry_list', '문의 현황'),
    result: {
      total: categoryKey === 'etc' ? visibleItems.length : listed.total,
      returned: returned.length,
      statusCounts,
      items: returned.map((item) => ({
        id: item.id,
        category: item.category,
        title: item.title,
        status: item.status,
        visibility: item.visibility,
        date: item.date,
        masked: Boolean(item.masked),
      })),
    },
    evidence: ['현재 로그인 사용자가 열람 가능한 문의와 현재 화면 필터'],
    recommendedChecks: ['답변 대기 문의를 등록일 순으로 먼저 확인하세요.'],
  }
}

function toolError(category: string, error: unknown): ToolResult {
  const raw = error instanceof Error ? error.message : ''
  const message = /(찾을 수 없습니다|열람할 수 있습니다|권한|올바르지 않습니다)/.test(raw)
    ? raw
    : '조회 중 오류가 발생했습니다.'
  return {
    ...baseTool('read_error', category),
    error: message,
    evidence: [],
    recommendedChecks: ['식별자와 조회 권한을 확인한 뒤 다시 요청하세요.'],
  }
}

/** Resolve only explicit entity lookups or menu-scoped operational list requests. */
export async function runChatReadTool(input: ChatReadToolInput): Promise<ToolResult | null> {
  const message = input.message.trim()
  if (!message) return null

  const route = input.route.toLowerCase()
  const lotIds = uniqueIds(message, LOT_ID_RE)
  const issueIds = uniqueIds(message, ISSUE_ID_RE)
  const inquiryIds = uniqueIds(message, INQUIRY_ID_RE)

  try {
    if (lotIds.length >= 2) return await compareLots(lotIds.slice(0, 2))
    if (lotIds.length === 1) return await lookupLot(lotIds[0])
    if (issueIds.length >= 1) return await lookupIssue(issueIds[0])
    if (inquiryIds.length >= 1) {
      return await lookupInquiry(inquiryIds[0], input.viewerUserId)
    }

    if (!LIST_INTENT_RE.test(message)) return null

    const issueScope = route.includes('/issue') || /이슈|issue/i.test(message)
    if (issueScope) return await listIssues(input.pagePayload)

    const inquiryScope = route.includes('/inquiry') || /문의|게시판|inquiry/i.test(message)
    if (inquiryScope) return await listInquiries(input.pagePayload, input.viewerUserId)
  } catch (error) {
    const category = lotIds.length
      ? 'LOT 조회'
      : issueIds.length || route.includes('/issue')
        ? '이슈 조회'
        : '문의 조회'
    return toolError(category, error)
  }

  return null
}
