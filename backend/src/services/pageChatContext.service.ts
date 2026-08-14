/**
 * Hybrid page-context supplement: when FE payload is thin, fetch allowlisted
 * route summaries (top-N / KPI only — never full table dumps).
 */
import * as lotService from './lot.service.js'
import * as issueService from './issue.service.js'
import * as dashboardService from './dashboard.service.js'

export type PageContextIn = {
  route?: string | null
  focusId?: string | null
  focusPayload?: unknown
  pagePayload?: unknown
  supplementHints?: string[] | null
}

export type PageContextOut = {
  route: string
  focusId: string | null
  focusPayload: unknown
  pagePayload: unknown
  supplement: Record<string, unknown> | null
}

const MAX_CHARS = 6_000

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

async function supplementForRoute(
  route: string,
  hints: string[],
): Promise<Record<string, unknown> | null> {
  const out: Record<string, unknown> = {}
  const r = route.toLowerCase()
  // These pages must never get LOT/handover/past-issue bleed from other routes.
  if (
    r.includes('/knowledge') ||
    r.includes('/inquiry') ||
    r.includes('/setting')
  ) {
    return null
  }

  try {
    const onMain = r.includes('/main')
    if (onMain || hints.includes('risk-top') || hints.includes('daily-kpi') || hints.includes('q-cost')) {
      if ((onMain && hints.length === 0) || hints.includes('risk-top')) {
        const top = await lotService.getRiskTop({ page: 1, pageSize: 5 })
        out.riskTop = {
          total: top.total,
          page: top.page,
          lots: top.lots.slice(0, 5).map((l) => ({
            lotId: l.lotId,
            recordedAt: l.recordedAt,
            riskLevel: l.riskLevel,
            spcStatus: l.spcStatus,
            defectProb: l.defectProb,
          })),
        }
      }
      if ((onMain && hints.length === 0) || hints.includes('daily-kpi')) {
        out.dailyKpi = await lotService.getDailyProbabilityKpi()
      }
      if ((onMain && hints.length === 0) || hints.includes('q-cost')) {
        out.qCost = await lotService.getQCostSummary({})
      }
    }

    if (r.includes('/dashboard') || hints.some((h) => h.startsWith('dashboard'))) {
      const risks = await dashboardService.listLotRisks({ page: 1, pageSize: 5 })
      out.lotRisks = {
        total: risks.total,
        items: risks.items.slice(0, 5),
      }
    }

    if (r.includes('/issue') || hints.includes('issues')) {
      const listed = await issueService.listOpenIssues({})
      out.issues = {
        total: listed.total,
        items: listed.issues.slice(0, 5).map((i) => ({
          issueId: i.issueId,
          lotId: i.lotId,
          riskLevel: i.riskLevel,
          spcStatus: i.spcStatus,
          createdAt: i.createdAt,
        })),
      }
    }

    // past-issues hint only when not on knowledge (knowledge returns early above)
    if (hints.includes('past-issues')) {
      const past = await issueService.listPastIssues()
      out.pastIssues = {
        total: past.total,
        items: past.items.slice(0, 5),
      }
    }

    if (r.includes('/management') || r.includes('/spc') || hints.includes('spc')) {
      out.spcPage = {
        note: 'SPC page embeds Grafana; no dense LOT series in this supplement.',
        route: '/management',
      }
    }
  } catch (err) {
    out._supplementError = err instanceof Error ? err.message : String(err)
  }

  return Object.keys(out).length ? out : null
}

/**
 * Merge FE page_context with optional server supplement.
 * Priority for LLM: focusPayload > pagePayload > supplement.
 */
export async function enrichPageContext(
  input: PageContextIn | null | undefined,
): Promise<PageContextOut | null> {
  if (!input || typeof input !== 'object') return null
  const route = String(input.route || '/').trim() || '/'
  const hints = Array.isArray(input.supplementHints)
    ? input.supplementHints.map(String)
    : []

  let supplement: Record<string, unknown> | null = null
  // Only supplement when FE payload is thin. Do not fetch LOT/risk because
  // hints alone are present on a rich page (avoids inventing off-screen %).
  const thin = payloadThin(input.pagePayload)
  const routeLower = route.toLowerCase()
  const noSupplementRoutes =
    routeLower.includes('/knowledge') ||
    routeLower.includes('/inquiry') ||
    routeLower.includes('/setting')
  if (thin && !noSupplementRoutes) {
    supplement = await supplementForRoute(route, hints)
  }

  const out: PageContextOut = {
    route,
    focusId: input.focusId != null ? String(input.focusId) : null,
    focusPayload: truncate(input.focusPayload ?? null),
    pagePayload: truncate(input.pagePayload ?? null),
    supplement: supplement ? (truncate(supplement) as Record<string, unknown>) : null,
  }

  console.debug('[page-chat] enrich', {
    route: out.route,
    focusId: out.focusId,
    hasFocus: out.focusPayload != null,
    hasPage: out.pagePayload != null,
    hasSupplement: out.supplement != null,
  })

  return out
}
