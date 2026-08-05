import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import {
  normalizeRiskLevel,
  residualMargin,
  RESIDUAL_USL,
  type RiskLevel,
} from './lotScore.js'
import { getLotSpcDetail } from './lot.service.js'

const OPTIMAL_SINTERING_TEMP = 800
const RAW_PROCESS_FEATURES = new Set([
  'd50',
  'd90',
  'metal_impurity',
  'lithium_input',
  'additive_ratio',
  'process_time',
  'sintering_temp',
  'humidity',
  'tank_pressure',
])

/** Fixed production-detail FI columns (clf global SHAP Top-4). */
export const FIXED_FI_COLUMNS = [
  { key: 'metal_impurity', label: '금속 불순물' },
  { key: 'temp_dev_from_800', label: '소성온도 이탈' },
  { key: 'humidity', label: '습도' },
  { key: 'temp_x_humidity', label: '소성온도×습도' },
] as const

const FEATURE_LABELS: Record<string, string> = {
  metal_impurity: '금속 불순물',
  temp_dev_from_800: '소성온도 이탈',
  humidity: '습도',
  temp_x_humidity: '소성온도×습도',
  flag_metal_ge10pct: '금속불순물 고위험 구간',
  process_time: '공정 시간',
  sintering_temp: '소성 온도',
  lithium_input: '리튬 투입량',
  additive_ratio: '첨가제 비율',
  d50: '입도 d50',
  d90: '입도 d90',
  tank_pressure: '탱크 압력',
}

type LotAggRow = {
  lot_id: string
  recorded_at: Date | string
  quality_defect: number | boolean
  defect_prob: number | null
  residual_lithium: number | null
  spc_status: string | null
  risk_level: string
  risk_reason: string | null
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
  scored_at: Date | string | null
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (value == null) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function dateKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function clampRate(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function holtForecast(values: number[], steps: number): number[] {
  if (values.length === 0) return []
  if (values.length === 1) return Array.from({ length: steps }, () => clampRate(values[0]))

  const alpha = 0.5
  const beta = 0.3
  let level = values[0]
  let trend = values[1] - values[0]
  for (let i = 1; i < values.length; i++) {
    const previousLevel = level
    level = alpha * values[i] + (1 - alpha) * (level + trend)
    trend = beta * (level - previousLevel) + (1 - beta) * trend
  }
  return Array.from({ length: steps }, (_, index) => clampRate(level + (index + 1) * trend))
}

function domainAverages(rows: LotAggRow[]) {
  const metal: number[] = []
  const tempDev: number[] = []
  const humidity: number[] = []
  const tempXHum: number[] = []
  for (const r of rows) {
    if (r.metal_impurity != null) metal.push(Number(r.metal_impurity))
    if (r.sintering_temp != null) {
      tempDev.push(Math.abs(Number(r.sintering_temp) - OPTIMAL_SINTERING_TEMP))
    }
    if (r.humidity != null) humidity.push(Number(r.humidity))
    if (r.sintering_temp != null && r.humidity != null) {
      tempXHum.push(Number(r.sintering_temp) * Number(r.humidity))
    }
  }
  return {
    metal_impurity: avg(metal),
    temp_dev_from_800: avg(tempDev),
    humidity: avg(humidity),
    temp_x_humidity: avg(tempXHum),
  }
}

export type LotRiskListQuery = {
  page?: number
  pageSize?: number
  search?: string
  riskLevel?: string
  spc?: string
  /** min defect prob inclusive, 0–1 */
  minProb?: number
  maxProb?: number
  marginLevel?: string
}

export async function listLotRisks(q: LotRiskListQuery) {
  const pageSize = Math.min(Math.max(Number(q.pageSize) || 5, 1), 50)
  const page = Math.max(Number(q.page) || 1, 1)
  const where: string[] = [
    'scored_at IS NOT NULL',
    `risk_level IN ('심각', 'A', '높음', '주의', 'B', '중간')`,
  ]
  const params: unknown[] = []

  if (q.search?.trim()) {
    where.push('lot_id LIKE ?')
    params.push(`%${q.search.trim()}%`)
  }
  if (q.riskLevel && q.riskLevel !== 'all') {
    const risk = normalizeRiskLevel(q.riskLevel)
    where.push(`risk_level IN (?, ?, ?)`)
    if (risk === '심각') params.push('심각', '높음', 'A')
    else if (risk === '주의') params.push('주의', '중간', 'B')
    else params.push('안정', '낮음', 'C')
  }
  if (q.spc && q.spc !== 'all') {
    if (q.spc === '이탈') {
      where.push(`spc_status LIKE '%이탈%'`)
    } else if (q.spc === '주의') {
      where.push(`(spc_status LIKE '%주의%' OR spc_status = '주의')`)
    } else if (q.spc === '안정') {
      where.push(`(spc_status = '안정' OR spc_status = '정상' OR spc_status IS NULL)`)
    }
  }
  if (q.minProb != null && Number.isFinite(q.minProb)) {
    where.push('defect_prob >= ?')
    params.push(q.minProb)
  }
  if (q.maxProb != null && Number.isFinite(q.maxProb)) {
    where.push('defect_prob < ?')
    params.push(q.maxProb)
  }
  if (q.marginLevel === 'low') {
    where.push('residual_lithium IS NOT NULL AND (? - residual_lithium) <= 500')
    params.push(RESIDUAL_USL)
  } else if (q.marginLevel === 'caution') {
    where.push(
      'residual_lithium IS NOT NULL AND (? - residual_lithium) > 500 AND (? - residual_lithium) <= 1000',
    )
    params.push(RESIDUAL_USL, RESIDUAL_USL)
  } else if (q.marginLevel === 'sufficient') {
    where.push('residual_lithium IS NOT NULL AND (? - residual_lithium) > 1000')
    params.push(RESIDUAL_USL)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const countRows = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM lots ${whereSql}`,
    params,
  )
  const total = Number(countRows[0]?.c || 0)
  const offset = (page - 1) * pageSize

  const rows = await query<LotAggRow[]>(
    `SELECT lot_id, recorded_at, quality_defect, defect_prob, residual_lithium,
            spc_status, risk_level, risk_reason, d50, d90, metal_impurity, lithium_input,
            additive_ratio, process_time, sintering_temp, humidity, tank_pressure,
            operator_id, scored_at
     FROM lots ${whereSql}
     ORDER BY recorded_at DESC, lot_id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  const items = rows.map((r) => {
    const residual = r.residual_lithium != null ? Number(r.residual_lithium) : null
    return {
      lotId: r.lot_id,
      recordedAt: formatDateTime(r.recorded_at),
      defectProb: r.defect_prob != null ? Number(r.defect_prob) : null,
      residualLithium: residual,
      residualMargin: residual != null ? residualMargin(residual) : null,
      spcStatus: r.spc_status,
      riskLevel: normalizeRiskLevel(r.risk_level),
      riskReason: r.risk_reason,
    }
  })

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    residualUsl: RESIDUAL_USL,
  }
}

export async function getLotRiskDetail(lotId: string) {
  const rows = await query<LotAggRow[]>(
    `SELECT lot_id, recorded_at, quality_defect, defect_prob, residual_lithium,
            spc_status, risk_level, risk_reason, d50, d90, metal_impurity, lithium_input,
            additive_ratio, process_time, sintering_temp, humidity, tank_pressure,
            operator_id, scored_at
     FROM lots WHERE lot_id = ? LIMIT 1`,
    [lotId],
  )
  if (!rows[0]) throw new AppError(404, 'LOT를 찾을 수 없습니다.')
  const r = rows[0]
  const residual = r.residual_lithium != null ? Number(r.residual_lithium) : null
  const spc = await getLotSpcDetail(lotId)

  return {
    lotId: r.lot_id,
    recordedAt: formatDateTime(r.recorded_at),
    defectProb: r.defect_prob != null ? Number(r.defect_prob) : null,
    residualLithium: residual,
    residualMargin: residual != null ? residualMargin(residual) : null,
    residualUsl: RESIDUAL_USL,
    spcStatus: r.spc_status,
    riskLevel: normalizeRiskLevel(r.risk_level) as RiskLevel,
    riskReason: r.risk_reason,
    actionContent: null as string | null,
    spc,
  }
}

async function getAllProductionPoints() {
  const rows = await query<LotAggRow[]>(
    `SELECT recorded_at, quality_defect, defect_prob,
            metal_impurity, sintering_temp, humidity
     FROM lots
     ORDER BY recorded_at ASC`,
  )

  const byDate = new Map<
    string,
    { production: number; good: number; defect: number; probs: number[] }
  >()
  for (const r of rows) {
    const key = dateKey(r.recorded_at)
    let bucket = byDate.get(key)
    if (!bucket) {
      bucket = { production: 0, good: 0, defect: 0, probs: [] }
      byDate.set(key, bucket)
    }
    bucket.production++
    if (Number(r.quality_defect) === 1) bucket.defect++
    else bucket.good++
    if (r.defect_prob != null) bucket.probs.push(Number(r.defect_prob))
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      production: b.production,
      goodCount: b.good,
      defectCount: b.defect,
      defectRate: b.production > 0 ? b.defect / b.production : null,
      aiDefectRate: b.probs.length ? avg(b.probs) : null,
    }))
}

export async function getProductionTrend() {
  const points = await getAllProductionPoints()
  const actualPoints = points.slice(-5)
  const rates = points
    .map((point) => point.defectRate)
    .filter((rate): rate is number => rate != null && Number.isFinite(rate))
  const forecasts = holtForecast(rates, 2)
  const latestDate = actualPoints.at(-1)?.date
  const forecastPoints =
    latestDate == null
      ? []
      : forecasts.map((defectRate, index) => ({
          date: addDays(latestDate, index + 1),
          defectRate,
        }))

  return { actualPoints, forecastPoints }
}

export async function getProductionDaily(page = 1, pageSize = 5) {
  const size = Math.min(Math.max(pageSize, 1), 50)
  const safePage = Math.max(page, 1)
  const all = [...(await getAllProductionPoints())].reverse()
  const total = all.length
  const totalPages = Math.max(1, Math.ceil(total / size))
  const slice = all.slice((safePage - 1) * size, safePage * size)

  // Enrich FI averages for the page dates
  const dateSet = new Set(slice.map((p) => p.date))
  const rows = await query<LotAggRow[]>(
    `SELECT recorded_at, quality_defect, metal_impurity, sintering_temp, humidity, scored_at
     FROM lots ORDER BY recorded_at ASC`,
  )
  const byDate = new Map<string, LotAggRow[]>()
  for (const r of rows) {
    const key = dateKey(r.recorded_at)
    if (!dateSet.has(key)) continue
    const list = byDate.get(key) || []
    list.push(r)
    byDate.set(key, list)
  }

  const items = slice.map((p) => {
    const dayRows = byDate.get(p.date) || []
    const fi = domainAverages(dayRows)
    const scored = dayRows.filter((r) => r.scored_at != null).length
    const dataStatus =
      dayRows.length === 0
        ? '데이터 없음'
        : scored === dayRows.length
          ? '집계 완료'
          : scored > 0
            ? '부분 채점'
            : '수집 중'

    return {
      date: p.date,
      production: p.production,
      goodCount: p.goodCount,
      defectCount: p.defectCount,
      defectRate: p.defectRate,
      metalImpurity: fi.metal_impurity,
      tempDevFrom800: fi.temp_dev_from_800,
      humidity: fi.humidity,
      tempXHumidity: fi.temp_x_humidity,
      dataStatus,
    }
  })

  return {
    items,
    total,
    page: safePage,
    pageSize: size,
    totalPages,
    columns: FIXED_FI_COLUMNS,
  }
}

export async function exportLotsCsvByDate(date: string): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(400, 'date는 YYYY-MM-DD 형식이어야 합니다.')
  }
  const rows = await query<LotAggRow[]>(
    `SELECT lot_id, recorded_at, d50, d90, metal_impurity, lithium_input, additive_ratio,
            process_time, sintering_temp, humidity, tank_pressure, operator_id,
            quality_defect, defect_prob, residual_lithium, spc_status, risk_level, risk_reason
     FROM lots
     WHERE DATE(recorded_at) = ?
     ORDER BY recorded_at ASC, lot_id ASC`,
    [date],
  )

  const header = [
    'lot_id',
    'recorded_at',
    'd50',
    'd90',
    'metal_impurity',
    'lithium_input',
    'additive_ratio',
    'process_time',
    'sintering_temp',
    'humidity',
    'tank_pressure',
    'operator_id',
    'quality_defect',
    'defect_prob',
    'residual_lithium',
    'residual_margin',
    'spc_status',
    'risk_level',
    'risk_reason',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    const residual = r.residual_lithium != null ? Number(r.residual_lithium) : null
    const margin = residual != null ? residualMargin(residual) : null
    const vals = [
      r.lot_id,
      formatDateTime(r.recorded_at),
      r.d50,
      r.d90,
      r.metal_impurity,
      r.lithium_input,
      r.additive_ratio,
      r.process_time,
      r.sintering_temp,
      r.humidity,
      r.tank_pressure,
      r.operator_id,
      Number(r.quality_defect) === 1 ? 1 : 0,
      r.defect_prob,
      residual,
      margin,
      r.spc_status,
      normalizeRiskLevel(r.risk_level),
      r.risk_reason,
    ].map((v) => {
      if (v == null) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
    })
    lines.push(vals.join(','))
  }
  return `\uFEFF${lines.join('\n')}`
}

function resolveShapPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../../../../ai-service/models/shap_xgb_importance.json'),
    path.resolve(here, '../../../ai-service/models/shap_xgb_importance.json'),
    path.resolve(process.cwd(), '../ai-service/models/shap_xgb_importance.json'),
    path.resolve(process.cwd(), 'ai-service/models/shap_xgb_importance.json'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

export function getFeatureImportance(topK = 4) {
  const k = Math.min(Math.max(topK, 1), 4)
  const shapPath = resolveShapPath()
  if (!shapPath) {
    const fallbackFeatures = ['metal_impurity', 'humidity', 'process_time', 'sintering_temp']
    return {
      source: 'fallback',
      items: fallbackFeatures.slice(0, k).map((feature, i) => ({
        feature,
        label: FEATURE_LABELS[feature],
        importance: 1 - i * 0.15,
      })),
    }
  }
  const raw = JSON.parse(fs.readFileSync(shapPath, 'utf8')) as Array<{
    feature: string
    importance: number
  }>
  const items = raw.filter((row) => RAW_PROCESS_FEATURES.has(row.feature)).slice(0, k).map((row) => ({
    feature: row.feature,
    label: FEATURE_LABELS[row.feature] || row.feature,
    importance: row.importance,
  }))
  return { source: shapPath, items }
}
