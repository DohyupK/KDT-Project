import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import {
  buildIssueTitle,
  emptySpcHistory,
  normalizeRiskLevel,
  pushCompleteLotHistory,
  residualMargin,
  scoreLotWithAi,
  type ProcessFeatures,
  type RiskLevel,
  RESIDUAL_USL,
} from './lotScore.js'
import { evaluateLotSpc, isProcessComplete, loadPhase1Limits, SPC_PARAM_KEYS, type SpcParamKey } from './spcEngine.js'

export type LotDto = {
  lotId: string
  recordedAt: string
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
  defectProb: number | null
  residualLithium: number | null
  /** USL(4000) − residual; null if residual missing */
  residualMargin: number | null
  spcStatus: string | null
  riskLevel: RiskLevel
  riskReason: string | null
  scoredAt: string | null
}

type LotRow = {
  lot_id: string
  recorded_at: Date | string
  d50: number | null
  d90: number | null
  metal_impurity: number | null
  lithium_input: number | null
  additive_ratio: number | null
  process_time: number | null
  sintering_temp: number | null
  humidity: number | null
  tank_pressure: number | null
  operator_id: string | null
  quality_defect: number | boolean
  defect_prob: number | null
  residual_lithium: number | null
  spc_status: string | null
  risk_level: string
  risk_reason: string | null
  scored_at: Date | string | null
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (value == null) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function toDto(row: LotRow): LotDto {
  const residual = row.residual_lithium != null ? Number(row.residual_lithium) : null
  return {
    lotId: row.lot_id,
    recordedAt: formatDateTime(row.recorded_at),
    d50: row.d50 != null ? Number(row.d50) : null,
    d90: row.d90 != null ? Number(row.d90) : null,
    metalImpurity: row.metal_impurity != null ? Number(row.metal_impurity) : null,
    lithiumInput: row.lithium_input != null ? Number(row.lithium_input) : null,
    additiveRatio: row.additive_ratio != null ? Number(row.additive_ratio) : null,
    processTime: row.process_time != null ? Number(row.process_time) : null,
    sinteringTemp: row.sintering_temp != null ? Number(row.sintering_temp) : null,
    humidity: row.humidity != null ? Number(row.humidity) : null,
    tankPressure: row.tank_pressure != null ? Number(row.tank_pressure) : null,
    operatorId: row.operator_id,
    qualityDefect: Boolean(row.quality_defect),
    defectProb: row.defect_prob != null ? Number(row.defect_prob) : null,
    residualLithium: residual,
    residualMargin: residual != null ? residualMargin(residual, RESIDUAL_USL) : null,
    spcStatus: row.spc_status,
    riskLevel: normalizeRiskLevel(row.risk_level),
    riskReason: row.risk_reason,
    scoredAt: row.scored_at ? formatDateTime(row.scored_at) : null,
  }
}

function rowToFeatures(row: LotRow): ProcessFeatures {
  return {
    d50: row.d50 != null ? Number(row.d50) : null,
    d90: row.d90 != null ? Number(row.d90) : null,
    metal_impurity: row.metal_impurity != null ? Number(row.metal_impurity) : null,
    lithium_input: row.lithium_input != null ? Number(row.lithium_input) : null,
    additive_ratio: row.additive_ratio != null ? Number(row.additive_ratio) : null,
    process_time: row.process_time != null ? Number(row.process_time) : null,
    sintering_temp: row.sintering_temp != null ? Number(row.sintering_temp) : null,
    humidity: row.humidity != null ? Number(row.humidity) : null,
    tank_pressure: row.tank_pressure != null ? Number(row.tank_pressure) : null,
    operator_id: row.operator_id,
    id: row.lot_id,
    timestamp: formatDateTime(row.recorded_at),
  }
}

const LOT_SELECT = `SELECT lot_id, recorded_at, d50, d90, metal_impurity, lithium_input,
  additive_ratio, process_time, sintering_temp, humidity, tank_pressure, operator_id,
  quality_defect, defect_prob, residual_lithium, spc_status, risk_level, risk_reason, scored_at
  FROM lots`

export async function getLotById(lotId: string): Promise<LotDto> {
  const rows = await query<LotRow[]>(`${LOT_SELECT} WHERE lot_id = ? LIMIT 1`, [lotId])
  if (!rows[0]) throw new AppError(404, 'LOT를 찾을 수 없습니다.')
  return toDto(rows[0])
}

export async function getRiskTop(limit = 10): Promise<LotDto[]> {
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50)
  const rows = await query<LotRow[]>(
    `${LOT_SELECT}
     WHERE risk_level IN ('심각', '주의', '높음', '중간', 'A', 'B')
     ORDER BY FIELD(risk_level, '심각', 'A', '높음', '주의', 'B', '중간'), recorded_at DESC
     LIMIT ?`,
    [n],
  )
  return rows.map(toDto)
}

function resolveCsvPath(): string {
  const envPath = process.env.LOT_CSV_PATH
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath)

  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../../../../ai-service/data/cathode_clf_data.csv'),
    path.resolve(here, '../../../ai-service/data/cathode_clf_data.csv'),
    path.resolve(process.cwd(), '../ai-service/data/cathode_clf_data.csv'),
    path.resolve(process.cwd(), 'ai-service/data/cathode_clf_data.csv'),
    path.resolve(process.cwd(), '../practice/cathode_clf_data.csv'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new AppError(500, 'cathode_clf_data.csv 경로를 찾을 수 없습니다. LOT_CSV_PATH를 설정하세요.')
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Upsert process features from clf CSV.
 * Scoring is separate (`scoreAllLots`) so import stays fast without ai-service.
 */
export async function importLotsFromCsv(csvPath?: string): Promise<{ imported: number; path: string }> {
  const filePath = csvPath && fs.existsSync(csvPath) ? csvPath : resolveCsvPath()
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new AppError(400, 'CSV에 데이터가 없습니다.')

  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const idx = (name: string) => header.indexOf(name)

  let imported = 0
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const lotId = cols[idx('id')]?.trim()
    if (!lotId) continue

    const recordedRaw = cols[idx('timestamp')]?.trim() || ''
    const recordedAt = recordedRaw.replace('T', ' ').slice(0, 19)
    const qualityDefect = Number(cols[idx('quality_defect')] ?? 0) === 1 ? 1 : 0

    await query(
      `INSERT INTO lots (
        lot_id, recorded_at, d50, d90, metal_impurity, lithium_input, additive_ratio,
        process_time, sintering_temp, humidity, tank_pressure, operator_id, quality_defect,
        risk_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '안정')
      ON DUPLICATE KEY UPDATE
        recorded_at = VALUES(recorded_at),
        d50 = VALUES(d50), d90 = VALUES(d90),
        metal_impurity = VALUES(metal_impurity), lithium_input = VALUES(lithium_input),
        additive_ratio = VALUES(additive_ratio), process_time = VALUES(process_time),
        sintering_temp = VALUES(sintering_temp), humidity = VALUES(humidity),
        tank_pressure = VALUES(tank_pressure), operator_id = VALUES(operator_id),
        quality_defect = VALUES(quality_defect)`,
      [
        lotId,
        recordedAt,
        num(cols[idx('d50')]),
        num(cols[idx('d90')]),
        num(cols[idx('metal_impurity')]),
        num(cols[idx('lithium_input')]),
        num(cols[idx('additive_ratio')]),
        num(cols[idx('process_time')]),
        num(cols[idx('sintering_temp')]),
        num(cols[idx('humidity')]),
        num(cols[idx('tank_pressure')]),
        cols[idx('operator_id')]?.trim() || null,
        qualityDefect,
      ],
    )
    imported++
  }

  return { imported, path: filePath }
}

async function updateLotScore(
  lotId: string,
  scored: Awaited<ReturnType<typeof scoreLotWithAi>>,
  seed?: {
    recordedAt: string
    qualityDefect: number
    features: ProcessFeatures
  },
) {
  if (seed) {
    const f = seed.features
    await query(
      `INSERT INTO lots (
        lot_id, recorded_at, d50, d90, metal_impurity, lithium_input, additive_ratio,
        process_time, sintering_temp, humidity, tank_pressure, operator_id, quality_defect,
        defect_prob, residual_lithium, spc_status, risk_level, risk_reason, scored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        defect_prob = VALUES(defect_prob),
        residual_lithium = VALUES(residual_lithium),
        spc_status = VALUES(spc_status),
        risk_level = VALUES(risk_level),
        risk_reason = VALUES(risk_reason),
        scored_at = NOW()`,
      [
        lotId,
        seed.recordedAt,
        f.d50,
        f.d90,
        f.metal_impurity,
        f.lithium_input,
        f.additive_ratio,
        f.process_time,
        f.sintering_temp,
        f.humidity,
        f.tank_pressure,
        f.operator_id,
        seed.qualityDefect,
        scored.defect_prob,
        scored.residual_lithium,
        scored.spc_status,
        scored.risk_level,
        scored.risk_reason,
      ],
    )
    return
  }
  await query(
    `UPDATE lots SET
      defect_prob = ?, residual_lithium = ?, spc_status = ?,
      risk_level = ?, risk_reason = ?, scored_at = NOW()
     WHERE lot_id = ?`,
    [
      scored.defect_prob,
      scored.residual_lithium,
      scored.spc_status,
      scored.risk_level,
      scored.risk_reason,
      lotId,
    ],
  )
}

export type ScoreLotsOptions = {
  /** Max lots to score (after ordering). */
  limit?: number
  /** Skip first N lots in time order. */
  offset?: number
  concurrency?: number
  onProgress?: (done: number, total: number, lotId: string) => void
}

type SampleRow = {
  lot_id: string
  recorded_at: Date | string
  d50: number | null
  d90: number | null
  metal_impurity: number | null
  lithium_input: number | null
  additive_ratio: number | null
  process_time: number | null
  sintering_temp: number | null
  humidity: number | null
  tank_pressure: number | null
  operator_id: string | null
  quality_defect?: number | boolean
  residual_li?: number | null
}

function sampleToFeatures(row: SampleRow): ProcessFeatures {
  return {
    d50: row.d50 != null ? Number(row.d50) : null,
    d90: row.d90 != null ? Number(row.d90) : null,
    metal_impurity: row.metal_impurity != null ? Number(row.metal_impurity) : null,
    lithium_input: row.lithium_input != null ? Number(row.lithium_input) : null,
    additive_ratio: row.additive_ratio != null ? Number(row.additive_ratio) : null,
    process_time: row.process_time != null ? Number(row.process_time) : null,
    sintering_temp: row.sintering_temp != null ? Number(row.sintering_temp) : null,
    humidity: row.humidity != null ? Number(row.humidity) : null,
    tank_pressure: row.tank_pressure != null ? Number(row.tank_pressure) : null,
    operator_id: row.operator_id,
    id: row.lot_id,
    timestamp: formatDateTime(row.recorded_at),
  }
}

const SAMPLE_FEATURE_SELECT = `lot_id, recorded_at, d50, d90, metal_impurity, lithium_input,
  additive_ratio, process_time, sintering_temp, humidity, tank_pressure, operator_id`

/**
 * Re-score using sample-table SSOT:
 * - defect_prob ← cathode_clf_samples → /predict
 * - residual_lithium ← cathode_residual_samples → /predict-residual
 * - SPC ← listwise-complete process features only (Phase I + Nelson 2–8)
 */
export async function scoreAllLots(options: ScoreLotsOptions = {}): Promise<{
  scored: number
  failed: number
  errors: string[]
}> {
  const offset = Math.max(0, options.offset ?? 0)
  const limit = options.limit != null ? Math.max(1, options.limit) : undefined
  const concurrency = Math.min(Math.max(options.concurrency ?? 4, 1), 16)

  const clfRows = await query<SampleRow[]>(
    `SELECT ${SAMPLE_FEATURE_SELECT}, quality_defect
     FROM cathode_clf_samples
     ORDER BY recorded_at ASC, lot_id ASC`,
  )
  const residualRows = await query<SampleRow[]>(
    `SELECT ${SAMPLE_FEATURE_SELECT}, residual_li
     FROM cathode_residual_samples`,
  )
  const residualById = new Map(residualRows.map((r) => [r.lot_id, r]))

  const slice = limit != null ? clfRows.slice(offset, offset + limit) : clfRows.slice(offset)
  const history = emptySpcHistory()

  for (let i = 0; i < offset && i < clfRows.length; i++) {
    pushCompleteLotHistory(history, sampleToFeatures(clfRows[i]))
  }

  let scored = 0
  let failed = 0
  const errors: string[] = []

  type Job = {
    clf: SampleRow
    residual: SampleRow | undefined
    histSnapshot: Record<SpcParamKey, number[]>
  }
  const jobs: Job[] = []

  for (const clf of slice) {
    const features = sampleToFeatures(clf)
    const bag: Partial<Record<SpcParamKey, number | null>> = {}
    for (const k of SPC_PARAM_KEYS) bag[k] = features[k]
    const complete = isProcessComplete(bag)
    if (complete) {
      for (const k of SPC_PARAM_KEYS) history[k].push(Number(features[k]))
    }
    const histSnapshot = {} as Record<SpcParamKey, number[]>
    for (const k of SPC_PARAM_KEYS) {
      histSnapshot[k] = complete ? history[k].slice() : []
    }
    jobs.push({ clf, residual: residualById.get(clf.lot_id), histSnapshot })
  }

  for (let i = 0; i < jobs.length; i += concurrency) {
    const chunk = jobs.slice(i, i + concurrency)
    const results = await Promise.allSettled(
      chunk.map(async ({ clf, residual, histSnapshot }) => {
        if (!residual) {
          throw new Error(`cathode_residual_samples missing lot_id=${clf.lot_id}`)
        }
        const clfFeatures = sampleToFeatures(clf)
        const residualFeatures = sampleToFeatures(residual)
        const scoredRow = await scoreLotWithAi(
          clfFeatures,
          residualFeatures,
          histSnapshot,
          clfFeatures,
        )
        await updateLotScore(clf.lot_id, scoredRow, {
          recordedAt: formatDateTime(clf.recorded_at),
          qualityDefect: Number(clf.quality_defect) === 1 ? 1 : 0,
          features: clfFeatures,
        })
        return clf.lot_id
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        scored++
        options.onProgress?.(scored + failed, jobs.length, r.value)
      } else {
        failed++
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        errors.push(msg.slice(0, 200))
        options.onProgress?.(scored + failed, jobs.length, '?')
      }
    }
  }

  return { scored, failed, errors: errors.slice(0, 20) }
}

const COMPLETE_PROCESS_SQL = `d50 IS NOT NULL AND d90 IS NOT NULL AND metal_impurity IS NOT NULL
  AND lithium_input IS NOT NULL AND additive_ratio IS NOT NULL AND process_time IS NOT NULL
  AND sintering_temp IS NOT NULL AND humidity IS NOT NULL AND tank_pressure IS NOT NULL`

/** Create open issues for complete-case 심각/주의 lots only. */
export async function ensureIssuesForRiskLots(): Promise<number> {
  const lots = await query<
    { lot_id: string; recorded_at: Date | string; risk_level: string; risk_reason: string | null }[]
  >(
    `SELECT lot_id, recorded_at, risk_level, risk_reason FROM lots
     WHERE risk_level IN ('심각', '주의')
       AND (${COMPLETE_PROCESS_SQL})`,
  )

  let created = 0
  for (const lot of lots) {
    const existing = await query<{ c: number }[]>(
      `SELECT COUNT(*) AS c FROM issues
       WHERE lot_id = ? AND status <> '완료'`,
      [lot.lot_id],
    )
    if (Number(existing[0]?.c) > 0) continue

    const occurred = formatDateTime(lot.recorded_at)
    const day = occurred.slice(2, 10).replace(/-/g, '')
    const suffix = lot.lot_id.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || String(created + 1)
    const issueId = `ISS-${day}-${suffix}`.slice(0, 32)
    const risk = normalizeRiskLevel(lot.risk_level)
    const title = buildIssueTitle(lot.risk_reason || risk, lot.lot_id)

    await query(
      `INSERT INTO issues (issue_id, lot_id, occurred_at, risk_level, status, title)
       VALUES (?, ?, ?, ?, '접수', ?)
       ON DUPLICATE KEY UPDATE lot_id = lot_id`,
      [issueId, lot.lot_id, occurred, risk, title.slice(0, 255)],
    )
    created++
  }
  return created
}

/** SPC series + per-param status for LOT detail (recomputed from Phase I limits). */
export async function getLotSpcDetail(lotId: string): Promise<{
  lotId: string
  spcStatus: string
  metrics: Array<{
    key: SpcParamKey
    label: string
    status: string
    currentValue: number
    centerLine: number
    upperControlLimit: number
    lowerControlLimit: number
    data: Array<{ timestamp: string; value: number }>
  }>
}> {
  const targetRows = await query<LotRow[]>(`${LOT_SELECT} WHERE lot_id = ? LIMIT 1`, [lotId])
  if (!targetRows[0]) throw new AppError(404, 'LOT를 찾을 수 없습니다.')
  const target = targetRows[0]
  const targetAt = new Date(target.recorded_at).getTime()

  const prior = await query<LotRow[]>(
    `${LOT_SELECT}
     WHERE recorded_at < ? OR (recorded_at = ? AND lot_id <= ?)
     ORDER BY recorded_at ASC, lot_id ASC`,
    [target.recorded_at, target.recorded_at, lotId],
  )

  const history = emptySpcHistory()
  const timestamps: string[] = []
  for (const row of prior) {
    const features = rowToFeatures(row)
    if (!pushCompleteLotHistory(history, features)) continue
    timestamps.push(formatDateTime(row.recorded_at))
  }

  if (timestamps.length === 0) {
    return { lotId, spcStatus: target.spc_status || '안정', metrics: [] }
  }

  const evaled = evaluateLotSpc(history)
  const limits = loadPhase1Limits()
  const window = 30
  const metrics = evaled.params
    .filter((p) => p.status === '이탈' || p.status === '주의')
    .map((p) => {
      const series = history[p.key]
      const start = Math.max(0, series.length - window)
      const data = series.slice(start).map((value, i) => ({
        timestamp: timestamps[start + i] || String(start + i),
        value,
      }))
      const lim = limits[p.key]
      return {
        key: p.key,
        label: lim.label,
        status: p.status,
        currentValue: p.value,
        centerLine: lim.CL_I,
        upperControlLimit: lim.UCL_I,
        lowerControlLimit: lim.LCL_I,
        data,
      }
    })

  void targetAt
  return {
    lotId,
    spcStatus: evaled.status,
    metrics,
  }
}
