import { createHash } from 'node:crypto'
import { query } from '../db/connection.js'
import { proxyExplainLot, proxyLotRecommendedAction } from './aiProxy.js'
import { parseSpcChartSnapshot } from './lot.service.js'
import type { ProcessFeatures } from './lotScore.js'
import { getStandardDefaults } from './standard.js'

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
    summaryFormat: 5,
  })
  return createHash('sha1').update(payload).digest('hex')
}

type DriverCause = {
  feature?: string
  labelKo?: string
  directionKo?: string
  valueText?: string
  refLabel?: string | null
  /** Relative contribution (%). Used to rank causes in summaries. */
  sharePct?: number | null
}

const FEATURE_QMS: Record<string, Array<{ docId: string; title: string }>> = {
  humidity: [
    { docId: 'QMS-GUD-001', title: '습도 트러블슈팅' },
    { docId: 'QMS-ACT-003', title: '드라이룸 점검' },
  ],
  d50: [{ docId: 'QMS-GUD-005', title: '입도 트러블슈팅' }],
  d90: [{ docId: 'QMS-GUD-005', title: '입도 트러블슈팅' }],
  sintering_temp: [
    { docId: 'QMS-GUD-002', title: '소성온도 트러블슈팅' },
    { docId: 'QMS-ACT-001', title: '소성로 점검' },
  ],
  temp_dev_from_800: [
    { docId: 'QMS-GUD-002', title: '소성온도 트러블슈팅' },
    { docId: 'QMS-ACT-001', title: '소성로 점검' },
  ],
  lithium_input: [
    { docId: 'QMS-GUD-004', title: '잔류리튬 트러블슈팅' },
    { docId: 'QMS-ACT-002', title: '배합비 재검토' },
  ],
  metal_impurity: [{ docId: 'QMS-GUD-003', title: '금속이물 트러블슈팅' }],
  process_time: [{ docId: 'QMS-SOP-002', title: '공정시간 SOP' }],
}

const DOC_PATH: Record<string, string> = {
  'QMS-GUD-001': 'Confidential/qms-source/QMS-GUD-001_습도트러블슈팅.docx',
  'QMS-GUD-002': 'Confidential/qms-source/QMS-GUD-002_소성온도트러블슈팅.docx',
  'QMS-GUD-003': 'Confidential/qms-source/QMS-GUD-003_금속이물트러블슈팅.docx',
  'QMS-GUD-004': 'Confidential/qms-source/QMS-GUD-004_잔류리튬트러블슈팅.docx',
  'QMS-GUD-005': 'Confidential/qms-source/QMS-GUD-005_입도트러블슈팅.docx',
  'QMS-ACT-001': 'Confidential/qms-source/QMS-ACT-001_소성로점검절차.docx',
  'QMS-ACT-002': 'Confidential/qms-source/QMS-ACT-002_배합비재검토절차.docx',
  'QMS-ACT-003': 'Confidential/qms-source/QMS-ACT-003_드라이룸점검절차.docx',
  'QMS-ACT-005': 'Confidential/qms-source/QMS-ACT-005_전수검사운영절차.docx',
  'QMS-MAN-001': 'Confidential/qms-source/QMS-MAN-001_SPC운영매뉴얼.docx',
  'QMS-RULE-003': 'Confidential/qms-source/QMS-RULE-003_검사수준운영규정.docx',
  'QMS-STD-001': 'Confidential/qms-source/QMS-STD-001_공정흐름및검사시점기준.docx',
  'QMS-SOP-002': 'Confidential/qms-source/QMS-SOP-002_공정시간관리SOP.docx',
}

const STABLE_STEPS = [
  { order: 1, text: '표준 샘플링(검사 수준 3) 유지', doc_id: 'QMS-RULE-003' },
  { order: 2, text: '공정·SPC 일상 모니터링 지속', doc_id: 'QMS-STD-001' },
]

const STABLE_SUMMARY =
  '위험 신호가 기준 범위 내입니다. STD-001에 따라 표준 샘플링·일상 모니터링을 유지합니다.'

/** Same as voting_config.defect_rule.blend_threshold — below this, not judged defect. */
export const DEFECT_ACTION_PROB_THRESHOLD = 0.55

function roundDecimalText(text: string): string {
  return text.replace(/(\d+\.\d+)/g, (raw) => {
    const n = Number(raw)
    return Number.isFinite(n) ? n.toFixed(2) : raw
  })
}

function josaIGa(word: string): string {
  if (!word) return '이'
  const last = word.codePointAt(word.length - 1)
  if (last == null) return '이'
  if (last >= 0xac00 && last <= 0xd7a3) {
    return (last - 0xac00) % 28 === 0 ? '가' : '이'
  }
  return '이'
}

function isDecrease(direction: string): boolean {
  return ['감소', '하락', '단축'].includes(direction)
}

function itemText(c: DriverCause): string {
  const label = c.labelKo || ''
  const valueText = roundDecimalText(c.valueText || '')
  return `${label}(${valueText})`
}

function joinGroup(items: DriverCause[]): string {
  const texts = items.map(itemText)
  const last = texts[texts.length - 1] || ''
  const body = texts.join('·')
  return `${body}${josaIGa(last)}`
}

/** 증가끼리 · 감소끼리 묶어 "A(x)·B(y)이 증가하며, C(z)이 감소하여" */
function groupedCausePhrase(causes: DriverCause[]): string {
  const up = causes.filter((c) => !isDecrease(c.directionKo || '증가'))
  const down = causes.filter((c) => isDecrease(c.directionKo || ''))
  const parts: string[] = []
  if (up.length && down.length) {
    parts.push(`${joinGroup(up)} 증가하며`)
    parts.push(`${joinGroup(down)} 감소하여`)
  } else if (up.length) {
    parts.push(`${joinGroup(up)} 증가하여`)
  } else if (down.length) {
    parts.push(`${joinGroup(down)} 감소하여`)
  }
  return parts.join(', ')
}

/** Raisers only (drivers already SHAP>0). Top 3 by share, skip <1% noise. */
function topCausesForSummary(causes: DriverCause[]): DriverCause[] {
  const sorted = [...causes].sort(
    (a, b) => (Number(b.sharePct) || 0) - (Number(a.sharePct) || 0),
  )
  const meaningful = sorted.filter((c) => (Number(c.sharePct) || 0) >= 1)
  return (meaningful.length > 0 ? meaningful : sorted.slice(0, 1)).slice(0, 3)
}

function isDefectJudged(probability: number | null | undefined): boolean {
  return probability != null && Number.isFinite(probability) && probability >= DEFECT_ACTION_PROB_THRESHOLD
}

/** Rule-based summary: defect paragraph + residual paragraph, 2-decimal values. */
export function buildRuleSummary(
  drivers: Record<string, unknown>,
  opts: {
    probability: number | null
    residualLi: number | null
    riskLevel: string | null
    spcStatus?: string | null
  },
): string {
  if (opts.riskLevel === '안정') return STABLE_SUMMARY

  const includeDefect = isDefectJudged(opts.probability)
  const defect = includeDefect
    ? topCausesForSummary(
        (drivers.defect_causes as DriverCause[] | undefined) || [],
      )
    : []
  const residual = topCausesForSummary(
    (drivers.residual_causes as DriverCause[] | undefined) || [],
  )

  const probPct =
    opts.probability != null ? `${(opts.probability * 100).toFixed(2)}%` : '높은'
  const resTxt =
    opts.residualLi != null ? `${opts.residualLi.toFixed(2)} ppm` : '상향'

  let para1 = ''
  if (includeDefect) {
    const phrase = groupedCausePhrase(defect)
    para1 =
      phrase.length > 0
        ? `${phrase} 불량확률 ${probPct}에 주요 영향을 미쳤습니다.`
        : `불량확률을 높인 주요 인자를 확인하세요. (불량확률 ${probPct})`
  }

  const resPhrase = groupedCausePhrase(residual)
  const para2 =
    resPhrase.length > 0
      ? `${resPhrase} 잔류리튬 예측 ${resTxt}에 주요 영향을 미쳤습니다.`
      : ''

  if (para1 && para2) return `${para1}\n\n${para2}`
  if (para1) return para1
  if (para2) return para2

  const spc = (opts.spcStatus || '').trim()
  if (spc && spc !== '안정' && spc !== '-') {
    return `SPC ${spc}가 확인되어 운영 기준을 재확인합니다.`
  }
  const residualCaution = getStandardDefaults().residual_caution
  if (opts.residualLi != null && opts.residualLi >= residualCaution) {
    return `잔류리튬 예측 ${resTxt}이 주의 기준(${residualCaution} ppm)을 초과했습니다.`
  }
  return `위험등급 ${opts.riskLevel || '주의'}입니다. 공정 모니터링을 유지합니다.`
}

export function buildRuleSteps(
  drivers: Record<string, unknown>,
  opts: {
    probability: number | null
    spcStatus?: string | null
    riskLevel?: string | null
    residualLi?: number | null
  },
): Array<{ order: number; text: string; doc_id: string }> {
  if (opts.riskLevel === '안정') return STABLE_STEPS.map((s) => ({ ...s }))

  const seen = new Set<string>()
  const steps: Array<{ order: number; text: string; doc_id: string }> = []
  let order = 1
  const buckets: DriverCause[][] = []
  if (isDefectJudged(opts.probability)) {
    buckets.push((drivers.defect_causes as DriverCause[] | undefined) || [])
  }
  buckets.push((drivers.residual_causes as DriverCause[] | undefined) || [])
  for (const bucket of buckets) {
    for (const c of bucket) {
      const feat = String(c.feature || '')
      for (const doc of FEATURE_QMS[feat] || []) {
        if (seen.has(doc.docId)) continue
        seen.add(doc.docId)
        steps.push({
          order,
          text: `${doc.title} 절차에 따라 점검·개선`,
          doc_id: doc.docId,
        })
        order += 1
      }
    }
  }
  const spc = (opts.spcStatus || '').trim()
  if (spc && spc !== '안정' && spc !== '-') {
    for (const [docId, title] of [
      ['QMS-MAN-001', 'SPC 운영'],
      ['QMS-ACT-005', '전수검사 운영'],
    ] as const) {
      if (seen.has(docId)) continue
      seen.add(docId)
      steps.push({ order, text: `${title} 기준 재확인`, doc_id: docId })
      order += 1
    }
  }
  const residualCaution = getStandardDefaults().residual_caution
  if (
    steps.length === 0 &&
    opts.residualLi != null &&
    opts.residualLi >= residualCaution
  ) {
    for (const doc of FEATURE_QMS.lithium_input || []) {
      if (seen.has(doc.docId)) continue
      seen.add(doc.docId)
      steps.push({
        order,
        text: `${doc.title} 절차에 따라 점검·개선`,
        doc_id: doc.docId,
      })
      order += 1
    }
  }
  return steps.slice(0, 6)
}

function sourcesFromSteps(
  steps: Array<{ doc_id: string }>,
): Array<{ doc_id: string; title: string; path: string }> {
  const out: Array<{ doc_id: string; title: string; path: string }> = []
  const seen = new Set<string>()
  for (const s of steps) {
    const did = s.doc_id
    if (!did || seen.has(did)) continue
    seen.add(did)
    let title = did
    for (const docs of Object.values(FEATURE_QMS)) {
      const hit = docs.find((d) => d.docId === did)
      if (hit) {
        title = hit.title
        break
      }
    }
    out.push({
      doc_id: did,
      title,
      path: DOC_PATH[did] || `Confidential/qms-source/${did}_${title}.docx`,
    })
  }
  return out
}

/** Rewrite stored recommended-action rows from existing drivers (no SHAP/AI). */
export async function rewriteStoredRecommendedActions(): Promise<number> {
  const rows = await query<
    {
      lot_id: string
      drivers_json: Record<string, unknown> | null
      probability: number | null
      residual_li: number | null
      risk_level: string | null
      spc_status: string | null
    }[]
  >(
    `SELECT r.lot_id, r.drivers_json,
            COALESCE(j.probability, a.probability) AS probability,
            a.risk_level, a.spc_status, j.residual_li
     FROM LOT_RECOMMENDED_ACTIONS r
     LEFT JOIN ANALYSIS_LOTS a ON a.lot_id = r.lot_id
     LEFT JOIN JUDGMENT_LOTS j ON j.lot_id = r.lot_id
     WHERE r.lot_id <> 'LOT-SYS-HANDOVER'`,
  )
  let updated = 0
  for (const row of rows) {
    const drivers =
      row.drivers_json && typeof row.drivers_json === 'object' ? row.drivers_json : {}
    const opts = {
      probability: row.probability,
      residualLi: row.residual_li,
      riskLevel: row.risk_level,
      spcStatus: row.spc_status,
    }
    const summary = buildRuleSummary(drivers, opts)
    const steps = buildRuleSteps(drivers, opts)
    const sources = sourcesFromSteps(steps)
    const hash = contentHash({
      lotId: row.lot_id,
      riskLevel: row.risk_level,
      probability: row.probability,
      residualLi: row.residual_li,
      spcStatus: row.spc_status,
      drivers,
    })
    await query(
      `UPDATE LOT_RECOMMENDED_ACTIONS
       SET summary = ?, steps_json = ?, sources_json = ?, content_hash = ?, generated_at = NOW()
       WHERE lot_id = ?`,
      [
        summary.slice(0, 1024),
        JSON.stringify(steps),
        JSON.stringify(sources),
        hash,
        row.lot_id,
      ],
    )
    updated++
  }
  return updated
}

export async function loadLotContext(lotId: string): Promise<LotContext | null> {
  const rows = await query<LotContext[]>(
    `SELECT j.lot_id, COALESCE(j.probability, a.probability) AS probability,
            a.spc_status, a.risk_level, a.spc_chart_json,
            j.residual_li,
            l.d50, l.d90, l.metal_impurity, l.lithium_input, l.additive_ratio,
            l.process_time, l.sintering_temp, l.humidity, l.tank_pressure
     FROM LOTS l
     LEFT JOIN ANALYSIS_LOTS a ON a.lot_id = l.id
     LEFT JOIN JUDGMENT_LOTS j ON j.lot_id = l.id
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
     FROM LOT_RECOMMENDED_ACTIONS WHERE lot_id = ? LIMIT 1`,
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
    `INSERT INTO LOT_RECOMMENDED_ACTIONS (
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
    const existing = await query<{ content_hash: string | null; status: string; summary: string | null }[]>(
      `SELECT content_hash, status, summary FROM LOT_RECOMMENDED_ACTIONS WHERE lot_id = ? LIMIT 1`,
      [lotId],
    )
    if (
      existing[0]?.content_hash === hash &&
      existing[0]?.status === 'ready' &&
      (existing[0]?.summary || '').trim()
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
    const steps = buildRuleSteps(finalDrivers, {
      probability: ctx.probability,
      spcStatus: ctx.spc_status,
      riskLevel: ctx.risk_level,
      residualLi: ctx.residual_li,
    })

    await upsertRecommendedAction(lotId, {
      summary: buildRuleSummary(finalDrivers, {
        probability: ctx.probability,
        residualLi: ctx.residual_li,
        riskLevel: ctx.risk_level,
        spcStatus: ctx.spc_status,
      }),
      steps,
      sources: sourcesFromSteps(steps),
      driversJson: finalDrivers,
      status: 'ready',
      errorMessage: composed.error,
      contentHash: hash,
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const steps = buildRuleSteps(driversJson, {
      probability: ctx.probability,
      spcStatus: ctx.spc_status,
      riskLevel: ctx.risk_level,
      residualLi: ctx.residual_li,
    })
    await upsertRecommendedAction(lotId, {
      summary: buildRuleSummary(driversJson, {
        probability: ctx.probability,
        residualLi: ctx.residual_li,
        riskLevel: ctx.risk_level,
        spcStatus: ctx.spc_status,
      }),
      steps,
      sources: sourcesFromSteps(steps),
      driversJson,
      status: 'ready',
      errorMessage: msg.slice(0, 255),
      contentHash: hash,
    })
    return { ok: true }
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
      `SELECT a.lot_id FROM ANALYSIS_LOTS a WHERE a.lot_id <> 'LOT-SYS-HANDOVER'`,
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
    `SELECT residual_li FROM JUDGMENT_LOTS WHERE lot_id = ? LIMIT 1`,
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
    `SELECT content_hash, status FROM LOT_RECOMMENDED_ACTIONS WHERE lot_id = ? LIMIT 1`,
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
  const steps = buildRuleSteps(finalDrivers, {
    probability: scored.probability,
    spcStatus: scored.spc_status,
    riskLevel: scored.risk_level,
    residualLi,
  })

  await upsertRecommendedAction(lotId, {
    summary: buildRuleSummary(finalDrivers, {
      probability: scored.probability,
      residualLi,
      riskLevel: scored.risk_level,
      spcStatus: scored.spc_status,
    }),
    steps,
    sources: sourcesFromSteps(steps),
    driversJson: finalDrivers,
    status: composed.status || 'ready',
    errorMessage: composed.error,
    contentHash: hash,
  })
}
