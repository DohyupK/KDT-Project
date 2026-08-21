/**
 * Route-strict page-context hydrate: re-query this page's API with the
 * screen filters and overwrite pagePayload lists. Never mix other pages.
 */
import * as lotService from './lot.service.js'
import * as issueService from './issue.service.js'
import * as dashboardService from './dashboard.service.js'
import type { LotRiskListQuery } from './dashboard.service.js'
import { runChatReadTool } from './chatReadTools.service.js'

export type PageContextIn = {
  route?: string | null
  focusId?: string | null
  focusPayload?: unknown
  pagePayload?: unknown
  lastEvent?: {
    type?: string
    target?: string
    entityId?: string | null
    ts?: string
  } | null
  supplementHints?: string[] | null
}

export type PageContextOut = {
  route: string
  focusId: string | null
  focusPayload: unknown
  pagePayload: unknown
  lastEvent: PageContextIn['lastEvent']
  supplement: Record<string, unknown> | null
}

const MAX_CHARS = 6_000
const DASHBOARD_PAGE_SIZE = 8
const MAIN_PAGE_SIZE = 8
const ISSUE_PAGE_SIZE = 5
const DEFAULT_HYDRATE_TIMEOUT_MS = 1_200

function hydrateTimeoutMs(): number {
  const configured = Number(process.env.PAGE_CHAT_HYDRATE_TIMEOUT_MS)
  if (!Number.isFinite(configured)) return DEFAULT_HYDRATE_TIMEOUT_MS
  return Math.max(100, Math.min(5_000, Math.floor(configured)))
}

async function withHydrateTimeout<T>(
  route: string,
  work: Promise<T>,
  fallback: T,
): Promise<T> {
  const timeoutMs = hydrateTimeoutMs()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.debug('[page-chat] hydrate timeout; using current screen data', {
        route,
        timeout_ms: timeoutMs,
      })
      resolve(fallback)
    }, timeoutMs)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function truncate(value: unknown): unknown {
  if (value == null) return value
  try {
    const raw = JSON.stringify(value)
    if (raw.length <= MAX_CHARS) return value
    return { _truncated: true, _originalChars: raw.length, preview: raw.slice(0, MAX_CHARS) }
  } catch {
    return { _error: 'unserializable' }
  }
}

function payloadThin(payload: unknown): boolean {
  if (payload == null) return true
  try {
    const s = JSON.stringify(payload)
    return s.length < 40 || s === '{}' || s === '[]' || s === 'null'
  } catch {
    return true
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asStr(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

function isLotId(id: string): boolean {
  return /^LOT[-_]/i.test(id)
}

function isIssueId(id: string): boolean {
  return /^ISS[-_]/i.test(id)
}

function mapSpcToFilter(spcStatus: string | null | undefined): string {
  const raw = (spcStatus || '').trim()
  if (!raw) return '안정'
  if (raw.includes('이탈') || raw.includes('이상')) return '이상'
  if (raw.includes('주의')) return '주의'
  return '안정'
}

function omitAll(value: string): string | undefined {
  const v = value.trim()
  if (!v || v === 'all') return undefined
  return v
}

function lotRiskQueryFromPayload(pagePayload: Record<string, unknown>): LotRiskListQuery {
  const lotRisks = asRecord(pagePayload.lotRisks) ?? {}
  const filter = asRecord(lotRisks.filter) ?? {}
  const probLevel = asStr(filter.probLevel)
  const probParams =
    probLevel === 'high'
      ? { minProb: 0.4 }
      : probLevel === 'mid'
        ? { minProb: 0.2, maxProb: 0.4 }
        : probLevel === 'low'
          ? { maxProb: 0.2 }
          : {}
  return {
    page: asPositiveInt(lotRisks.page, 1),
    pageSize: DASHBOARD_PAGE_SIZE,
    search: asStr(filter.lotQuery) || asStr(filter.search) || undefined,
    marginLevel: omitAll(asStr(filter.marginLevel)),
    residualLevel: omitAll(asStr(filter.residualLevel)),
    riskLevel: omitAll(asStr(filter.grade) || asStr(filter.riskLevel)),
    spc: omitAll(asStr(filter.spc)),
    ...probParams,
  }
}

function mapLotRiskItem(item: {
  lotId: string
  recordedAt?: string
  defectProb: number | null
  residualLithium: number | null
  residualMargin: number | null
  spcStatus: string | null
  riskLevel: string | null
  riskReason?: string | null
}) {
  return {
    lotId: item.lotId,
    recordedAt: item.recordedAt,
    defectProb: item.defectProb,
    residualLithium: item.residualLithium,
    residualMargin: item.residualMargin,
    spcStatus: item.spcStatus,
    riskLevel: item.riskLevel,
    riskReason: item.riskReason ?? null,
    grade: item.riskLevel,
    prob: item.defectProb,
    predLi: item.residualLithium,
    margin: item.residualMargin,
    spc: item.spcStatus,
  }
}

function mapIssueRow(item: {
  issueId: string
  lotId: string
  riskLevel: string
  spcStatus: string | null
  createdAt: string
  issueContent: string
  hasAction: boolean
}) {
  return {
    issueId: item.issueId,
    lotId: item.lotId,
    riskLevel: item.riskLevel,
    risk: item.riskLevel,
    spcStatus: item.spcStatus,
    spc: item.spcStatus,
    createdAt: item.createdAt,
    date: item.createdAt.slice(0, 10),
    issueContent: item.issueContent.slice(0, 200),
    hasAction: item.hasAction,
  }
}

function mergeRecord(base: unknown, overlay: Record<string, unknown>): Record<string, unknown> {
  const current = asRecord(base) ?? {}
  return { ...current, ...overlay }
}

async function hydrateDashboard(
  pagePayload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const lotRisks = asRecord(pagePayload.lotRisks)
  if (!lotRisks) return pagePayload

  const query = lotRiskQueryFromPayload(pagePayload)
  const listed = await dashboardService.listLotRisks(query)
  const next: Record<string, unknown> = {
    ...pagePayload,
    lotRisks: {
      ...lotRisks,
      page: listed.page,
      total: listed.total,
      totalPages: listed.totalPages,
      items: listed.items.map(mapLotRiskItem),
    },
  }

  const selectedLot = asRecord(pagePayload.selectedLot)
  const selectedId = asStr(selectedLot?.lotId)
  if (selectedLot && selectedId) {
    const row = listed.items.find((item) => item.lotId === selectedId)
    if (row) {
      next.selectedLot = mergeRecord(selectedLot, {
        lotId: row.lotId,
        detail: mergeRecord(selectedLot.detail, {
          lotId: row.lotId,
          defectProb: row.defectProb,
          residualLithium: row.residualLithium,
          residualMargin: row.residualMargin,
          spcStatus: row.spcStatus,
          riskLevel: row.riskLevel,
          riskReason: row.riskReason,
        }),
      })
    }
  }

  return next
}

async function hydrateIssue(
  pagePayload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!('filters' in pagePayload)) return pagePayload

  const filters = asRecord(pagePayload.filters) ?? {}
  const search = asStr(filters.search)
  const date = asStr(filters.date)
  const lotId = asStr(filters.lot)
  const riskLevel = asStr(filters.risk)
  const spc = asStr(filters.spc)
  const assignment = asStr(filters.assignment)
  const page = asPositiveInt(pagePayload.page, 1)

  const listed = await issueService.listOpenIssues({
    search: search || undefined,
    date: date || undefined,
    lotId: lotId || undefined,
    riskLevel: riskLevel || undefined,
  })

  let rows = listed.issues
  if (spc) {
    rows = rows.filter((item) => mapSpcToFilter(item.spcStatus) === spc)
  }

  const byId = new Map(rows.map((item) => [item.issueId, item]))
  const next: Record<string, unknown> = { ...pagePayload, filters, page }

  if (assignment === 'assigned' || assignment === 'unassigned') {
    const feItems = Array.isArray(pagePayload.issues) ? pagePayload.issues : []
    next.issues = feItems
      .map((raw) => {
        const fe = asRecord(raw)
        if (!fe) return null
        const id = asStr(fe.issueId)
        if (!id) return null
        const db = byId.get(id)
        return db
          ? {
              ...fe,
              ...mapIssueRow(db),
              assignee: fe.assignee,
              processStatus: fe.processStatus,
              completed: fe.completed,
            }
          : fe
      })
      .filter(Boolean)
    const feTotal = Number(pagePayload.totalOpen)
    next.totalOpen =
      Number.isFinite(feTotal) && feTotal >= 0
        ? Math.floor(feTotal)
        : (next.issues as unknown[]).length
  } else {
    const start = (page - 1) * ISSUE_PAGE_SIZE
    next.totalOpen = rows.length
    next.issues = rows.slice(start, start + ISSUE_PAGE_SIZE).map(mapIssueRow)
  }

  const selected = asRecord(pagePayload.selected)
  const selectedId = asStr(selected?.issueId)
  if (selected && isIssueId(selectedId)) {
    try {
      const detail = await issueService.getIssueById(selectedId)
      next.selected = mergeRecord(selected, {
        issueId: detail.issueId,
        lotId: detail.lotId,
        risk: detail.riskLevel,
        riskLevel: detail.riskLevel,
        issueContent: detail.issueContent.slice(0, 400),
        assignee: detail.assigneeName,
        completed: detail.completed,
        action: (detail.actionContent ?? '').slice(0, 400),
        analysis: detail.analysis,
      })
    } catch {
      // keep FE selected
    }
  }

  return next
}

async function hydrateMain(
  pagePayload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const hasMain =
    'riskTop' in pagePayload || 'dailyKpi' in pagePayload || 'qCost' in pagePayload
  if (!hasMain) return pagePayload

  const next: Record<string, unknown> = { ...pagePayload }
  const riskTop = asRecord(pagePayload.riskTop)
  if (riskTop) {
    const top = await lotService.getRiskTop({
      page: asPositiveInt(riskTop.page, 1),
      pageSize: MAIN_PAGE_SIZE,
    })
    next.riskTop = {
      ...riskTop,
      page: top.page,
      total: top.total,
      totalPages: top.totalPages,
      lots: top.lots.map((lot) => ({
        lotId: lot.lotId,
        defectProb: lot.defectProb,
        riskScore: lot.defectProb,
        status: lot.riskLevel,
        riskLevel: lot.riskLevel,
        riskReason: lot.riskReason,
        recordedAt: lot.recordedAt,
        residualLithium: lot.residualLithium,
        residualMargin: lot.residualMargin,
        spcStatus: lot.spcStatus,
      })),
    }
  }

  if ('dailyKpi' in pagePayload) {
    next.dailyKpi = await lotService.getDailyProbabilityKpi()
  }

  const qCost = asRecord(pagePayload.qCost)
  if (qCost) {
    const from = asStr(qCost.from)
    const to = asStr(qCost.to)
    next.qCost = {
      ...qCost,
      ...(await lotService.getQCostSummary({
        from: from || undefined,
        to: to || undefined,
      })),
    }
  }

  return next
}

async function hydratePagePayload(
  route: string,
  pagePayload: unknown,
): Promise<unknown> {
  if (payloadThin(pagePayload)) return pagePayload
  const payload = asRecord(pagePayload)
  if (!payload) return pagePayload

  const r = route.toLowerCase()
  try {
    if (r.includes('/dashboard')) return await hydrateDashboard(payload)
    if (r.includes('/issue')) return await hydrateIssue(payload)
    if (r.includes('/main')) return await hydrateMain(payload)
  } catch (err) {
    console.debug('[page-chat] hydrate skipped', {
      route,
      error: err instanceof Error ? err.message : String(err),
    })
    return pagePayload
  }
  return pagePayload
}

async function hydrateFocus(
  route: string,
  focusId: string | null,
  focusPayload: unknown,
): Promise<unknown> {
  if (!focusId) return focusPayload
  const r = route.toLowerCase()
  try {
    if (r.includes('/dashboard') && isLotId(focusId)) {
      // Chat hydration must remain read-only. The dashboard detail service may
      // generate a missing recommendation, so use the pure LOT lookup here.
      const detail = await lotService.getLotById(focusId)
      return mergeRecord(focusPayload, {
        lotId: detail.lotId,
        defectProb: detail.defectProb,
        residualLithium: detail.residualLithium,
        residualMargin: detail.residualMargin,
        spcStatus: detail.spcStatus,
        riskLevel: detail.riskLevel,
        riskReason: detail.riskReason,
        grade: detail.riskLevel,
        prob: detail.defectProb,
        predLi: detail.residualLithium,
        margin: detail.residualMargin,
        spc: detail.spcStatus,
      })
    }
    if (r.includes('/issue') && isIssueId(focusId)) {
      const detail = await issueService.getIssueById(focusId)
      return mergeRecord(focusPayload, {
        issueId: detail.issueId,
        lotId: detail.lotId,
        riskLevel: detail.riskLevel,
        risk: detail.riskLevel,
        spcStatus: detail.spcStatus,
        spc: detail.spcStatus,
        createdAt: detail.createdAt,
        issueContent: detail.issueContent,
        assignee: detail.assigneeName,
        completed: detail.completed,
        actionContent: detail.actionContent,
        analysis: detail.analysis,
      })
    }
    if (r.includes('/main') && isLotId(focusId)) {
      const lot = await lotService.getLotById(focusId)
      return mergeRecord(focusPayload, {
        lotId: lot.lotId,
        defectProb: lot.defectProb,
        riskScore: lot.defectProb,
        status: lot.riskLevel,
        riskLevel: lot.riskLevel,
        riskReason: lot.riskReason,
        residualLithium: lot.residualLithium,
        residualMargin: lot.residualMargin,
        spcStatus: lot.spcStatus,
      })
    }
  } catch {
    return focusPayload
  }
  return focusPayload
}

/**
 * Re-query this route's DB with screen filters. Never attach other-page rows.
 */
export async function enrichPageContext(
  input: PageContextIn | null | undefined,
  request: { message?: string; viewerUserId?: string } = {},
): Promise<PageContextOut | null> {
  if (!input || typeof input !== 'object') return null
  const route = String(input.route || '/').trim() || '/'
  const focusId = input.focusId != null ? String(input.focusId) : null

  const fallback: [unknown, unknown, Record<string, unknown> | null] = [
    input.pagePayload ?? null,
    input.focusPayload ?? null,
    null,
  ]
  const [pagePayload, focusPayload, supplement] = await withHydrateTimeout(
    route,
    Promise.all([
      hydratePagePayload(route, input.pagePayload ?? null),
      hydrateFocus(route, focusId, input.focusPayload ?? null),
      request.viewerUserId
        ? runChatReadTool({
            message: request.message ?? '',
            route,
            pagePayload: input.pagePayload ?? null,
            viewerUserId: request.viewerUserId,
          })
        : Promise.resolve(null),
    ]),
    fallback,
  )

  const out: PageContextOut = {
    route,
    focusId,
    focusPayload: truncate(focusPayload),
    pagePayload: truncate(pagePayload),
    lastEvent: input.lastEvent ?? null,
    supplement: truncate(supplement) as Record<string, unknown> | null,
  }

  console.debug('[page-chat] enrich', {
    route: out.route,
    focusId: out.focusId,
    hasFocus: out.focusPayload != null,
    hasPage: out.pagePayload != null,
    hasLastEvent: out.lastEvent != null,
    hasSupplement: out.supplement != null,
  })

  return out
}
