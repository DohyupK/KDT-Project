import { createHash } from 'node:crypto'
import { query } from '../db/connection.js'
import { proxyExplainLot, proxyLotRecommendedAction } from './aiProxy.js'
import { parseSpcChartSnapshot } from './lot.service.js'
import type { ProcessFeatures } from './lotScore.js'

export type RecommendedActionRow = {
  lot_id: string
  summary: string
  steps_json: unknown
  sources_json: unknown
  drivers_json: unknown
  status: string
  error_message: string | null
  content_hash: string | null
  generated_at: Date | string
}

export type RecommendedActionDto = {
  summary: string
  steps: Array<{ order: number; text: string; docId?: string | null }>
  sources: Array<{ docId: string; title?: string | null; path?: string | null }>
  driversJson: Record<string, unknown> | null
  status: string
  errorMessage: string | null
  generatedAt: string | null
}

type LotContext = {
  lot_id: string
  probability: number | null
  spc_status: string | null
  risk_level: string | null
  residual_li: number | null
  spc_chart_json: unknown
  d50: number | null
  d90: number | null
  metal_impurity: number | null
  lithium_input: number | null
  additive_ratio: number | null
  process_time: number | null
  sintering_temp: number | null
  humidity: number | null
  tank_pressure: number | null
}

function featuresFromRow(row: LotContext): Record<string, number | string | null> {
  return {
    d50: row.d50,
    d90: row.d90,
    metal_impurity: row.metal_impurity,
    lithium_input: row.lithium_input,
    additive_ratio: row.additive_ratio,
    process_time: row.process_time,
    sintering_temp: row.sintering_temp,
    humidity: row.humidity,
    tank_pressure: row.tank_pressure,
    operator_id: 'OP-001',
    id: row.lot_id,
  }
}

function spcRefsFromChart(spc_chart_json: unknown): Record<string, number> {
  const snap = parseSpcChartSnapshot(spc_chart_json)
  if (!snap?.metrics?.length) return {}
  const refs: Record<string, number> = {}
  for (const m of snap.metrics) {
    if (m.key && m.centerLine != null && Number.isFinite(Number(m.centerLine))) {
      refs[m.key] = Number(m.centerLine)
    }
  }
  return refs
}

function contentHash(input: {
  lotId: string
  riskLevel: string | null
  probability: number | null
  residualLi: number | null
  spcStatus: string | null
  drivers: Record<string, unknown>
}): string {
  const payload = JSON.stringify({
    lotId: input.lotId,
    riskLevel: input.riskLevel,
    probability: input.probability,
    residualLi: input.residualLi,
    spcStatus: input.spcStatus,
    drivers: input.drivers,
    summaryFormat: 2,
  })
  return createHash('sha1').update(payload).digest('hex')
}

type DriverCause = {
  labelKo?: string
  directionKo?: string
  valueText?: string
  refLabel?: string | null
}

const STABLE_SUMMARY =
  '위험 신호가 기준 범위 내입니다. STD-001에 따라 표준 샘플링·일상 모니터링을 유지합니다.'

function roundDecimalText(text: string): string {
  return text.replace(/(\d+\.\d+)/g, (raw) => {
    const n = Number(raw)
    return Number.isFinite(n) ? n.toFixed(2) : raw
  })
}

function causeClause(c: DriverCause): string {
  const label = c.labelKo || ''
  const direction = c.directionKo || '변동'
  const valueText = roundDecimalText(c.valueText || '')
  let refBit = ''
  if (c.refLabel) {
    if (['상승', '과다', '연장', '초과'].includes(direction)) {
      refBit = `, ${c.refLabel} 초과`
    } else if (['하락', '단축'].includes(direction)) {
      refBit = `, ${c.refLabel} 미만`
    } else {
      refBit = `, ${c.refLabel} 대비`
    }
  }
  return `${label} ${direction}(${valueText}${refBit})`
}

/** Defect: share≥5% only (else top 1). Residual: top 2 with share≥1%. */
function topCausesForSummary(
  causes: DriverCause[],
  kind: 'defect' | 'residual',
): DriverCause[] {
  const sorted = [...causes].sort(
    (a, b) => (Number(b.sharePct) || 0) - (Number(a.sharePct) || 0),
  )
  if (kind === 'defect') {
    const strong = sorted.filter((c) => (Number(c.sharePct) || 0) >= 5)
    if (strong.length > 0) return strong.slice(0, 2)
    return sorted.slice(0, 1)
  }
  const meaningful = sorted.filter((c) => (Number(c.sharePct) || 0) >= 1)
  return (meaningful.length > 0 ? meaningful : sorted.slice(0, 1)).slice(0, 2)
}

/** Rule-based summary: defect paragraph + residual paragraph, 2-decimal values. */
export function buildRuleSummary(
  drivers: Record<string, unknown>,
  opts: {
    probability: number | null
    residualLi: number | null
    riskLevel: string | null
  },
): string {
  if (opts.riskLevel === '안정') return STABLE_SUMMARY

  const defect = topCausesForSummary(
    (drivers.defect_causes as DriverCause[] | undefined) || [],
    'defect',
  )
  const residual = topCausesForSummary(
    (drivers.residual_causes as DriverCause[] | undefined) || [],
    'residual',
  )

  const probPct =
    opts.probability != null ? `${(opts.probability * 100).toFixed(2)}%` : '높은'
  const resTxt =
    opts.residualLi != null ? `${opts.residualLi.toFixed(2)} ppm` : '상향'

  const para1 =
    defect.length > 0
      ? `${defect.slice(0, 2).map(causeClause).join('과 ')}이(가) 불량확률 ${probPct}에 주요 영향을 미치고 있습니다.`
      : `불량확률에 영향을 미치고 있는 주요 인자를 확인하세요. (불량확률 ${probPct})`

  const para2 =
    residual.length > 0
      ? `잔류리튬 예측 ${resTxt}에 ${residual.slice(0, 2).map(causeClause).join('과 ')}이(가) 주요 영향을 미치고 있습니다.`
      : ''

  return para2 ? `${para1}\n\n${para2}` : para1
}

export async function loadLotContext(lotId: string): Promise<LotContext | null> {
  const rows = await query<LotContext[]>(
    `SELECT j.lot_id, a.probability, a.spc_status, a.risk_level, a.spc_chart_json,
            j.residual_li,
            l.d50, l.d90, l.metal_impurity, l.lithium_input, l.additive_ratio,
            l.process_time, l.sintering_temp, l.humidity, l.tank_pressure
     FROM lots l
     LEFT JOIN analysis_lots a ON a.lot_id = l.id
     LEFT JOIN judgment_lots j ON j.lot_id = l.id
     WHERE l.id = ? LIMIT 1`,
    [lotId],
  )
  return rows[0] ?? null
}

export async function getRecommendedActionForLot(
  lotId: string,
): Promise<RecommendedActionDto | null> {
  const rows = await query<RecommendedActionRow[]>(
    `SELECT lot_id, summary, steps_json, sources_json, drivers_json, status,
            error_message, content_hash, generated_at
     FROM lot_recommended_actions WHERE lot_id = ? LIMIT 1`,
    [lotId],
  )
  const r = rows[0]
  if (!r) return null
  const steps = Array.isArray(r.steps_json) ? r.steps_json : []
  const sources = Array.isArray(r.sources_json) ? r.sources_json : []
  return {
    summary: r.summary || '',
    steps: steps.map((s: { order?: number; text?: string; doc_id?: string }) => ({
      order: Number(s.order) || 0,
      text: String(s.text || ''),
      docId: s.doc_id ?? null,
    })),
    sources: sources.map((s: { doc_id?: string; title?: string; path?: string }) => ({
      docId: String(s.doc_id || ''),
      title: s.title ?? null,
      path: s.path ?? null,
    })),
    driversJson:
      r.drivers_json && typeof r.drivers_json === 'object'
        ? (r.drivers_json as Record<string, unknown>)
        : null,
    status: r.status,
    errorMessage: r.error_message,
    generatedAt:
      r.generated_at instanceof Date
        ? r.generated_at.toISOString()
        : r.generated_at
          ? String(r.generated_at)
          : null,
  }
}

async function upsertRecommendedAction(
  lotId: string,
  data: {
    summary: string
    steps: unknown[]
    sources: unknown[]
    driversJson: Record<string, unknown>
    status: string
    errorMessage: string | null
    contentHash: string
  },
): Promise<void> {
  await query(
    `INSERT INTO lot_recommended_actions (
       lot_id, summary, steps_json, sources_json, drivers_json,
       status, error_message, content_hash, generated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       summary = VALUES(summary),
       steps_json = VALUES(steps_json),
       sources_json = VALUES(sources_json),
       drivers_json = VALUES(drivers_json),
       status = VALUES(status),
       error_message = VALUES(error_message),
       content_hash = VALUES(content_hash),
       generated_at = NOW()`,
    [
      lotId,
      data.summary.slice(0, 1024),
      JSON.stringify(data.steps),
      JSON.stringify(data.sources),
      JSON.stringify(data.driversJson),
      data.status,
      data.errorMessage,
      data.contentHash,
    ],
  )
}

export async function generateRecommendedActionForLot(
  lotId: string,
  opts: { force?: boolean; quiet?: boolean } = {},
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const ctx = await loadLotContext(lotId)
  if (!ctx?.lot_id) {
    return { ok: false, error: 'lot_not_found' }
  }
  if (ctx.probability == null && ctx.risk_level == null) {
    return { ok: false, error: 'not_scored' }
  }

  const features = featuresFromRow(ctx)
  const spcRefs = spcRefsFromChart(ctx.spc_chart_json)

  let driversJson: Record<string, unknown> = {}
  try {
    const explained = await proxyExplainLot({ features, spc_refs: spcRefs })
    driversJson = explained.drivers_json || {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!opts.quiet) console.warn('[lot-recommended-action] explain fail', lotId, msg)
    driversJson = { defect_causes: [], residual_causes: [] }
  }

  const hash = contentHash({
    lotId,
    riskLevel: ctx.risk_level,
    probability: ctx.probability,
    residualLi: ctx.residual_li,
    spcStatus: ctx.spc_status,
    drivers: driversJson,
  })

  if (!opts.force) {
    const existing = await query<{ content_hash: string | null; status: string }[]>(
      `SELECT content_hash, status FROM lot_recommended_actions WHERE lot_id = ? LIMIT 1`,
      [lotId],
    )
    if (
      existing[0]?.content_hash === hash &&
      existing[0]?.status === 'ready'
    ) {
      return { ok: true, skipped: true }
    }
  }

  try {
    const composed = await proxyLotRecommendedAction({
      lot_id: lotId,
      risk_level: ctx.risk_level,
      probability: ctx.probability,
      residual_li: ctx.residual_li,
      spc_status: ctx.spc_status,
      drivers_json: driversJson,
    })

    const finalDrivers = (composed.drivers_json || driversJson) as Record<string, unknown>

    await upsertRecommendedAction(lotId, {
      summary: buildRuleSummary(finalDrivers, {
        probability: ctx.probability,
        residualLi: ctx.residual_li,
        riskLevel: ctx.risk_level,
      }),
      steps: composed.steps || [],
      sources: composed.sources || [],
      driversJson: finalDrivers,
      status: composed.status || 'ready',
      errorMessage: composed.error,
      contentHash: hash,
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await upsertRecommendedAction(lotId, {
      summary: '',
      steps: [],
      sources: [],
      driversJson,
      status: 'error',
      errorMessage: msg.slice(0, 255),
      contentHash: hash,
    })
    return { ok: false, error: msg }
  }
}

export type FillRecommendedActionsResult = {
  updated: number
  skipped: number
  failed: number
  errors: string[]
}

export async function fillRecommendedActionsForLots(
  lotIds?: string[],
  opts: { concurrency?: number; quiet?: boolean; force?: boolean } = {},
): Promise<FillRecommendedActionsResult> {
  const concurrency = Math.min(Math.max(opts.concurrency ?? 2, 1), 4)
  let ids = lotIds
  if (ids == null) {
    const rows = await query<{ lot_id: string }[]>(
      `SELECT a.lot_id FROM analysis_lots a WHERE a.lot_id <> 'LOT-SYS-HANDOVER'`,
    )
    ids = rows.map((r) => r.lot_id)
  }
  if (ids.length === 0) {
    return { updated: 0, skipped: 0, failed: 0, errors: [] }
  }

  let updated = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency)
    const results = await Promise.allSettled(
      chunk.map((id) =>
        generateRecommendedActionForLot(id, { force: opts.force, quiet: opts.quiet }),
      ),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.skipped) skipped++
        else if (r.value.ok) updated++
        else {
          failed++
          if (r.value.error) errors.push(r.value.error.slice(0, 200))
        }
      } else {
        failed++
        errors.push(
          r.reason instanceof Error ? r.reason.message : String(r.reason).slice(0, 200),
        )
      }
    }
  }

  return { updated, skipped, failed, errors: errors.slice(0, 20) }
}

/** Re-export for batch from score path with inline features. */
export async function generateFromFeatures(
  lotId: string,
  scored: {
    probability: number | null
    risk_level: string | null
    spc_status: string | null
  },
  features: ProcessFeatures,
  spcChartJson: unknown,
): Promise<void> {
  const spcRefs = spcRefsFromChart(spcChartJson)
  const featBody: Record<string, number | string | null> = {
    ...features,
    operator_id: features.operator_id ?? 'OP-001',
    id: lotId,
  }
  let driversJson: Record<string, unknown> = {}
  try {
    const explained = await proxyExplainLot({ features: featBody, spc_refs: spcRefs })
    driversJson = explained.drivers_json || {}
  } catch {
    driversJson = { defect_causes: [], residual_causes: [] }
  }

  const residualRows = await query<{ residual_li: number | null }[]>(
    `SELECT residual_li FROM judgment_lots WHERE lot_id = ? LIMIT 1`,
    [lotId],
  )
  const residualLi = residualRows[0]?.residual_li ?? null

  const hash = contentHash({
    lotId,
    riskLevel: scored.risk_level,
    probability: scored.probability,
    residualLi,
    spcStatus: scored.spc_status,
    drivers: driversJson,
  })

  const existing = await query<{ content_hash: string | null; status: string }[]>(
    `SELECT content_hash, status FROM lot_recommended_actions WHERE lot_id = ? LIMIT 1`,
    [lotId],
  )
  if (
    existing[0]?.content_hash === hash &&
    existing[0]?.status === 'ready'
  ) {
    return
  }

  const composed = await proxyLotRecommendedAction({
    lot_id: lotId,
    risk_level: scored.risk_level,
    probability: scored.probability,
    residual_li: residualLi,
    spc_status: scored.spc_status,
    drivers_json: driversJson,
  })

  const finalDrivers = (composed.drivers_json || driversJson) as Record<string, unknown>

  await upsertRecommendedAction(lotId, {
    summary: buildRuleSummary(finalDrivers, {
      probability: scored.probability,
      residualLi,
      riskLevel: scored.risk_level,
    }),
    steps: composed.steps || [],
    sources: composed.sources || [],
    driversJson: finalDrivers,
    status: composed.status || 'ready',
    errorMessage: composed.error,
    contentHash: hash,
  })
}
