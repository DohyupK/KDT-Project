import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import {
  normalizeRiskLevel,
  residualMargin,
  getResidualUsl,
  DEFECT_JUDGE_THRESHOLD,
  type RiskLevel,
} from './lotScore.js'
import { getLotSpcDetail } from './lot.service.js'
import { normalizeSpcStatus, isProcessComplete, SPC_PARAM_KEYS } from './spcEngine.js'

const OPTIMAL_SINTERING_TEMP = 800

function isLotProcessComplete(row: Record<string, number | null | undefined>): boolean {
  const bag: Partial<Record<(typeof SPC_PARAM_KEYS)[number], number | null>> = {}
  for (const k of SPC_PARAM_KEYS) bag[k] = row[k] != null ? Number(row[k]) : null
  return isProcessComplete(bag)
}

/** Production-detail table columns (daily aggregate from lots + analysis_lots). */
export const PRODUCTION_DAILY_COLUMNS = [
  { key: 'metalImpurity', label: '금속 불순물' },
  { key: 'sinteringTemp', label: '소성 온도' },
  { key: 'humidity', label: '습도' },
  { key: 'lithiumInput', label: '리튬 투입량' },
  { key: 'additiveRatio', label: '첨가제 비율' },
  { key: 'tankPressure', label: '압력' },
  { key: 'processTime', label: '공정시간' },
] as const

/** @deprecated Prefer PRODUCTION_DAILY_COLUMNS — legacy FI labels */
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
  probability: number | null
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

export type ProductionTrendGrain = 'day' | 'week' | 'month'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseIsoDateOnly(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return dt
}

function formatIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addCalendarDays(date: string, days: number): string {
  const d = parseIsoDateOnly(date)
  if (!d) return date
  d.setDate(d.getDate() + days)
  return formatIsoDate(d)
}

/** Monday-start ISO week key as YYYY-MM-DD (week start). */
function weekBucketKey(value: Date | string): string {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  const day = d.getDay() // 0 Sun .. 6 Sat
  const diffToMon = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diffToMon)
  return formatIsoDate(d)
}

function monthBucketKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function bucketKeyForGrain(value: Date | string, grain: ProductionTrendGrain): string {
  if (grain === 'week') return weekBucketKey(value)
  if (grain === 'month') return monthBucketKey(value)
  return dateKey(value)
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
  const usl = await getResidualUsl()
  const where: string[] = []
  const params: unknown[] = []

  if (q.search?.trim()) {
    where.push('j.lot_id LIKE ?')
    params.push(`%${q.search.trim()}%`)
  }
  if (q.minProb != null && Number.isFinite(q.minProb)) {
    where.push('j.probability IS NOT NULL AND j.probability >= ?')
    params.push(q.minProb)
  }
  if (q.maxProb != null && Number.isFinite(q.maxProb)) {
    where.push('j.probability IS NOT NULL AND j.probability < ?')
    params.push(q.maxProb)
  }
  if (q.marginLevel === 'low') {
    where.push('j.residual_li IS NOT NULL AND (? - j.residual_li) <= 500')
    params.push(usl)
  } else if (q.marginLevel === 'caution') {
    where.push(
      'j.residual_li IS NOT NULL AND (? - j.residual_li) > 500 AND (? - j.residual_li) <= 1000',
    )
    params.push(usl, usl)
  } else if (q.marginLevel === 'sufficient') {
    where.push('j.residual_li IS NOT NULL AND (? - j.residual_li) > 1000')
    params.push(usl)
  }
  if (q.riskLevel && q.riskLevel !== 'all') {
    where.push('a.risk_level = ?')
    params.push(q.riskLevel)
  }
  if (q.spc && q.spc !== 'all') {
    where.push(
      `(COALESCE(j.spc, a.spc_status) = ? OR ( ? = '이탈' AND COALESCE(j.spc, a.spc_status) LIKE '%이탈%' ))`,
    )
    params.push(q.spc, q.spc)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const fromJoin = `FROM judgment_lots j
     INNER JOIN lots l ON l.id = j.lot_id
     LEFT JOIN analysis_lots a ON a.lot_id = j.lot_id`
  const countRows = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c ${fromJoin} ${whereSql}`,
    params,
  )
  const total = Number(countRows[0]?.c || 0)
  const offset = (page - 1) * pageSize

  const rows = await query<
    {
      lot_id: string
      recorded_at: Date | string
      residual_lithium: number | null
      probability: number | null
      j_spc: string | null
      a_spc: string | null
      risk_level: string | null
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
    }[]
  >(
    `SELECT j.lot_id, l.\`timestamp\` AS recorded_at, j.residual_li AS residual_lithium,
            j.probability, j.spc AS j_spc, a.spc_status AS a_spc,
            a.risk_level, a.risk_reason,
            l.d50, l.d90, l.metal_impurity, l.lithium_input, l.additive_ratio,
            l.process_time, l.sintering_temp, l.humidity, l.tank_pressure
     ${fromJoin} ${whereSql}
     ORDER BY l.\`timestamp\` DESC, j.lot_id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  const items = rows.map((r) => {
    const residual = r.residual_lithium != null ? Number(r.residual_lithium) : null
    const prob = r.probability != null ? Number(r.probability) : null
    const processComplete = isLotProcessComplete(r)
    const spcRaw = r.j_spc || r.a_spc
    const spcStatus = !processComplete
      ? '-'
      : spcRaw != null
        ? normalizeSpcStatus(spcRaw)
        : null
    return {
      lotId: r.lot_id,
      recordedAt: formatDateTime(r.recorded_at),
      defectProb: Number.isFinite(prob as number) ? prob : null,
      residualLithium: residual,
      residualMargin: residual != null ? residualMargin(residual, usl) : null,
      spcStatus,
      riskLevel: r.risk_level != null ? normalizeRiskLevel(r.risk_level) : null,
      riskReason: r.risk_reason,
    }
  })

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    residualUsl: usl,
  }
}

export async function getLotRiskDetail(lotId: string) {
  const usl = await getResidualUsl()
  const rows = await query<
    {
      lot_id: string
      recorded_at: Date | string
      residual_lithium: number | null
      probability: number | null
      j_spc: string | null
      a_spc: string | null
      risk_level: string | null
      risk_reason: string | null
      action_content: string | null
      d50: number | null
      d90: number | null
      metal_impurity: number | null
      lithium_input: number | null
      additive_ratio: number | null
      process_time: number | null
      sintering_temp: number | null
      humidity: number | null
      tank_pressure: number | null
    }[]
  >(
    `SELECT j.lot_id, l.\`timestamp\` AS recorded_at, j.residual_li AS residual_lithium,
            j.probability, j.spc AS j_spc, a.spc_status AS a_spc,
            a.risk_level, a.risk_reason,
            (SELECT i.action_content FROM issues i
             WHERE i.lot_id = j.lot_id
             ORDER BY i.created_at DESC LIMIT 1) AS action_content,
            l.d50, l.d90, l.metal_impurity, l.lithium_input, l.additive_ratio,
            l.process_time, l.sintering_temp, l.humidity, l.tank_pressure
     FROM judgment_lots j
     INNER JOIN lots l ON l.id = j.lot_id
     LEFT JOIN analysis_lots a ON a.lot_id = j.lot_id
     WHERE j.lot_id = ? LIMIT 1`,
    [lotId],
  )
  if (!rows[0]) throw new AppError(404, 'LOT를 찾을 수 없습니다.')
  const r = rows[0]
  const residual = r.residual_lithium != null ? Number(r.residual_lithium) : null
  const prob = r.probability != null ? Number(r.probability) : null
  const processComplete = isLotProcessComplete(r)
  const spcRaw = r.j_spc || r.a_spc
  const spcStatus = !processComplete
    ? '-'
    : spcRaw != null
      ? normalizeSpcStatus(spcRaw)
      : null

  let spc: Awaited<ReturnType<typeof getLotSpcDetail>> | null = null
  try {
    spc = await getLotSpcDetail(lotId)
  } catch {
    spc = null
  }

  const resolvedSpc = !processComplete
    ? '-'
    : spcStatus != null
      ? spcStatus
      : spc?.spcStatus
        ? normalizeSpcStatus(spc.spcStatus)
        : '-'

  return {
    lotId: r.lot_id,
    recordedAt: formatDateTime(r.recorded_at),
    defectProb: Number.isFinite(prob as number) ? prob : null,
    residualLithium: residual,
    residualMargin: residual != null ? residualMargin(residual, usl) : null,
    residualUsl: usl,
    spcStatus: resolvedSpc,
    riskLevel: r.risk_level != null ? normalizeRiskLevel(r.risk_level) : null,
    riskReason: r.risk_reason,
    actionContent: r.action_content,
    spc:
      resolvedSpc !== '-' && spc && spc.metrics.length > 0
        ? {
            metrics: spc.metrics,
          }
        : null,
  }
}

async function getAllProductionPoints() {
  const rows = await query<LotAggRow[]>(
    `SELECT l.\`timestamp\` AS recorded_at, 0 AS quality_defect,
            COALESCE(j.probability, a.probability) AS probability,
            l.metal_impurity, l.sintering_temp, l.humidity
     FROM lots l
     LEFT JOIN analysis_lots a ON a.lot_id = l.id
     LEFT JOIN judgment_lots j ON j.lot_id = l.id
     ORDER BY l.\`timestamp\` ASC`,
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
    if (r.probability != null) bucket.probs.push(Number(r.probability))
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

/**
 * Production volume trend for dashboard pink-box chart.
 * Aggregates judgment_lots (COUNT lot_id + quality_defect) by lots.timestamp.
 * Default window: last 7 calendar days ending on latest judgment lot date.
 */
export async function getProductionTrend(params: {
  from?: string
  to?: string
  grain?: string
} = {}) {
  const grainRaw = (params.grain || 'day').toLowerCase()
  const grain: ProductionTrendGrain =
    grainRaw === 'week' || grainRaw === 'month' ? grainRaw : 'day'

  let from = params.from && ISO_DATE_RE.test(params.from) ? params.from : undefined
  let to = params.to && ISO_DATE_RE.test(params.to) ? params.to : undefined

  if (!from || !to) {
    const latestRows = await query<Array<{ latest: Date | string | null }>>(
      `SELECT MAX(l.\`timestamp\`) AS latest
       FROM judgment_lots j
       INNER JOIN lots l ON l.id = j.lot_id`,
    )
    const latestRaw = latestRows[0]?.latest
    const latestKey = latestRaw != null ? dateKey(latestRaw) : formatIsoDate(new Date())
    to = to ?? latestKey
    from = from ?? addCalendarDays(to, -6)
  }

  if (from > to) {
    const tmp = from
    from = to
    to = tmp
  }

  const rows = await query<
    Array<{ recorded_at: Date | string; quality_defect: number | boolean }>
  >(
    `SELECT l.\`timestamp\` AS recorded_at, j.quality_defect
     FROM judgment_lots j
     INNER JOIN lots l ON l.id = j.lot_id
     WHERE DATE(l.\`timestamp\`) >= ? AND DATE(l.\`timestamp\`) <= ?
     ORDER BY l.\`timestamp\` ASC`,
    [from, to],
  )

  const byBucket = new Map<string, { production: number; defect: number }>()
  for (const r of rows) {
    const key = bucketKeyForGrain(r.recorded_at, grain)
    let bucket = byBucket.get(key)
    if (!bucket) {
      bucket = { production: 0, defect: 0 }
      byBucket.set(key, bucket)
    }
    bucket.production++
    if (Number(r.quality_defect) === 1) bucket.defect++
  }

  const points = [...byBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => {
      const goodCount = b.production - b.defect
      return {
        date,
        production: b.production,
        goodCount,
        defectCount: b.defect,
        defectRate: b.production > 0 ? b.defect / b.production : null,
      }
    })

  return { grain, from, to, points }
}

function dateFromLotId(lotId: string | null | undefined, fallback: Date | string): string {
  const m = String(lotId || '').match(/^LOT-(\d{8})(?:-|$)/i)
  if (m) {
    const raw = m[1]
    const y = Number(raw.slice(0, 4))
    const mo = Number(raw.slice(4, 6))
    const d = Number(raw.slice(6, 8))
    if (y >= 2000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${y}-${pad(mo)}-${pad(d)}`
    }
  }
  return dateKey(fallback)
}

export type ProductionDailyQuery = {
  page?: number
  pageSize?: number
  operatorId?: string
  d50Min?: number
  d50Max?: number
  d90Min?: number
  d90Max?: number
}

type DayBucket = {
  production: number
  good: number
  defect: number
  metal: number[]
  sinter: number[]
  humidity: number[]
  lithium: number[]
  additive: number[]
  pressure: number[]
  process: number[]
}

/**
 * Daily production detail for dashboard tab.
 * Date from lot_id YYYYMMDD; good/defect from analysis_lots.probability vs 0.8;
 * process metrics = day averages from lots. Window = last 7 days by lot_id date.
 */
export async function getProductionDaily(q: ProductionDailyQuery = {}) {
  const size = Math.min(Math.max(Number(q.pageSize) || 7, 1), 50)
  const safePage = Math.max(Number(q.page) || 1, 1)
  const thr = DEFECT_JUDGE_THRESHOLD

  const where: string[] = []
  const params: unknown[] = []
  if (q.operatorId && String(q.operatorId).trim()) {
    where.push('l.operator_id = ?')
    params.push(String(q.operatorId).trim())
  }
  if (q.d50Min != null && Number.isFinite(q.d50Min)) {
    where.push('l.d50 IS NOT NULL AND l.d50 >= ?')
    params.push(Number(q.d50Min))
  }
  if (q.d50Max != null && Number.isFinite(q.d50Max)) {
    where.push('l.d50 IS NOT NULL AND l.d50 <= ?')
    params.push(Number(q.d50Max))
  }
  if (q.d90Min != null && Number.isFinite(q.d90Min)) {
    where.push('l.d90 IS NOT NULL AND l.d90 >= ?')
    params.push(Number(q.d90Min))
  }
  if (q.d90Max != null && Number.isFinite(q.d90Max)) {
    where.push('l.d90 IS NOT NULL AND l.d90 <= ?')
    params.push(Number(q.d90Max))
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [operatorRows, rows] = await Promise.all([
    query<{ operator_id: string }[]>(
      `SELECT DISTINCT l.operator_id AS operator_id
       FROM lots l
       WHERE l.operator_id IS NOT NULL AND l.operator_id <> ''
       ORDER BY l.operator_id ASC`,
    ),
    query<
      {
        lot_id: string
        recorded_at: Date | string
        probability: number | null
        metal_impurity: number | null
        sintering_temp: number | null
        humidity: number | null
        lithium_input: number | null
        additive_ratio: number | null
        tank_pressure: number | null
        process_time: number | null
        operator_id: string | null
        d50: number | null
        d90: number | null
      }[]
    >(
      `SELECT l.id AS lot_id, l.\`timestamp\` AS recorded_at, a.probability,
              l.metal_impurity, l.sintering_temp, l.humidity, l.lithium_input,
              l.additive_ratio, l.tank_pressure, l.process_time, l.operator_id, l.d50, l.d90
       FROM lots l
       LEFT JOIN analysis_lots a ON a.lot_id = l.id
       ${whereSql}
       ORDER BY l.\`timestamp\` ASC`,
      params,
    ),
  ])

  const operators = operatorRows.map((r) => String(r.operator_id)).filter(Boolean)
  const byDate = new Map<string, DayBucket>()

  for (const r of rows) {
    const key = dateFromLotId(r.lot_id, r.recorded_at)
    let b = byDate.get(key)
    if (!b) {
      b = {
        production: 0,
        good: 0,
        defect: 0,
        metal: [],
        sinter: [],
        humidity: [],
        lithium: [],
        additive: [],
        pressure: [],
        process: [],
      }
      byDate.set(key, b)
    }
    b.production++
    if (r.probability != null && Number.isFinite(Number(r.probability))) {
      const p = Number(r.probability)
      if (p >= thr) b.defect++
      else b.good++
    }
    if (r.metal_impurity != null) b.metal.push(Number(r.metal_impurity))
    if (r.sintering_temp != null) b.sinter.push(Number(r.sintering_temp))
    if (r.humidity != null) b.humidity.push(Number(r.humidity))
    if (r.lithium_input != null) b.lithium.push(Number(r.lithium_input))
    if (r.additive_ratio != null) b.additive.push(Number(r.additive_ratio))
    if (r.tank_pressure != null) b.pressure.push(Number(r.tank_pressure))
    if (r.process_time != null) b.process.push(Number(r.process_time))
  }

  const allDates = [...byDate.keys()].sort((a, b) => a.localeCompare(b))
  const latest = allDates.length > 0 ? allDates[allDates.length - 1] : formatIsoDate(new Date())
  const windowStart = addCalendarDays(latest, -6)
  const windowDates = allDates.filter((d) => d >= windowStart && d <= latest).reverse()

  const total = windowDates.length
  const totalPages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(safePage, totalPages)
  const slice = windowDates.slice((page - 1) * size, page * size)

  const items = slice.map((date) => {
    const b = byDate.get(date)!
    return {
      date,
      production: b.production,
      goodCount: b.good,
      defectCount: b.defect,
      defectRate: b.production > 0 ? b.defect / b.production : null,
      metalImpurity: avg(b.metal),
      sinteringTemp: avg(b.sinter),
      humidity: avg(b.humidity),
      lithiumInput: avg(b.lithium),
      additiveRatio: avg(b.additive),
      tankPressure: avg(b.pressure),
      processTime: avg(b.process),
    }
  })

  return {
    items,
    total,
    page,
    pageSize: size,
    totalPages,
    from: windowStart,
    to: latest,
    threshold: thr,
    operators,
    columns: [...PRODUCTION_DAILY_COLUMNS],
  }
}

export async function exportLotsCsvByDate(date: string): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(400, 'date는 YYYY-MM-DD 형식이어야 합니다.')
  }
  const rows = await query<LotAggRow[]>(
    `SELECT l.id AS lot_id, l.\`timestamp\` AS recorded_at, l.d50, l.d90, l.metal_impurity, l.lithium_input, l.additive_ratio,
            l.process_time, l.sintering_temp, l.humidity, l.tank_pressure, l.operator_id,
            0 AS quality_defect,
            COALESCE(j.probability, a.probability) AS probability,
            j.residual_li AS residual_lithium, a.spc_status, a.risk_level, a.risk_reason
     FROM lots l
     LEFT JOIN analysis_lots a ON a.lot_id = l.id
     LEFT JOIN judgment_lots j ON j.lot_id = l.id
     WHERE DATE(l.\`timestamp\`) = ?
     ORDER BY l.\`timestamp\` ASC, l.id ASC`,
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
    'probability',
    'residual_lithium',
    'residual_margin',
    'spc_status',
    'risk_level',
    'risk_reason',
  ]
  const usl = await getResidualUsl()
  const lines = [header.join(',')]
  for (const r of rows) {
    const residual = r.residual_lithium != null ? Number(r.residual_lithium) : null
    const margin = residual != null ? residualMargin(residual, usl) : null
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
      r.probability,
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

/** Resolve default window for grain relative to `now` (local). */
export function defaultPeriodForGrain(
  grain: ProductionTrendGrain,
  now = new Date(),
): { from: string; to: string; label: string; mode: 'default' } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const today = `${y}-${pad(m + 1)}-${pad(d)}`

  if (grain === 'month') {
    const from = `${y}-${pad(m + 1)}-01`
    return {
      from,
      to: today,
      label: `당월 · ${y}년 ${m + 1}월`,
      mode: 'default',
    }
  }
  if (grain === 'week') {
    const day = now.getDay()
    const diffToMon = day === 0 ? -6 : 1 - day
    const mon = new Date(y, m, d + diffToMon)
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
    const from = formatIsoDate(mon)
    const to = today
    const label = `당주 · ${formatKoreanDate(mon)} ~ ${formatKoreanDate(sun)}`
    return { from, to, label, mode: 'default' }
  }
  return {
    from: today,
    to: today,
    label: `당일 · ${formatKoreanDate(now)}`,
    mode: 'default',
  }
}

function formatKoreanDate(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

export function labelForSelectedBucket(
  grain: ProductionTrendGrain,
  bucketKey: string,
): string {
  if (grain === 'month') {
    const [y, mo] = bucketKey.split('-').map(Number)
    return `${y}년 ${mo}월`
  }
  if (grain === 'week') {
    const start = parseIsoDateOnly(bucketKey)
    if (!start) return bucketKey
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    return `${formatKoreanDate(start)} ~ ${formatKoreanDate(end)}`
  }
  const day = parseIsoDateOnly(bucketKey)
  return day ? formatKoreanDate(day) : bucketKey
}

/**
 * Period-scoped defect drivers (clf / quality_defect=1 lots only).
 * Importance ∝ |mean_defect − mean_good| / σ (lots separation only).
 */
export async function getFeatureImportance(params: {
  topK?: number
  grain?: string
  from?: string
  to?: string
  bucket?: string
  mode?: string
} = {}) {
  const grainRaw = (params.grain || 'day').toLowerCase()
  const grain: ProductionTrendGrain =
    grainRaw === 'week' || grainRaw === 'month' ? grainRaw : 'day'

  let from = params.from && ISO_DATE_RE.test(params.from) ? params.from : undefined
  let to = params.to && ISO_DATE_RE.test(params.to) ? params.to : undefined
  let label = ''
  let mode: 'default' | 'selected' = params.mode === 'selected' ? 'selected' : 'default'

  if (params.bucket?.trim() && mode === 'selected') {
    const bucket = params.bucket.trim()
    label = labelForSelectedBucket(grain, bucket)
    if (grain === 'month') {
      from = `${bucket}-01`
      const [y, mo] = bucket.split('-').map(Number)
      const last = new Date(y, mo, 0).getDate()
      to = `${bucket}-${String(last).padStart(2, '0')}`
    } else if (grain === 'week') {
      from = bucket
      to = addCalendarDays(bucket, 6)
    } else {
      from = bucket
      to = bucket
    }
  } else {
    const def = defaultPeriodForGrain(grain)
    from = from ?? def.from
    to = to ?? def.to
    label = def.label
    mode = 'default'
  }

  if (from! > to!) {
    const tmp = from
    from = to
    to = tmp
  }

  type FeatRow = {
    quality_defect: number | boolean
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

  const rows = await query<FeatRow[]>(
    `SELECT j.quality_defect,
            l.d50, l.d90, l.metal_impurity, l.lithium_input, l.additive_ratio,
            l.process_time, l.sintering_temp, l.humidity, l.tank_pressure
     FROM judgment_lots j
     INNER JOIN lots l ON l.id = j.lot_id
     WHERE DATE(l.\`timestamp\`) >= ? AND DATE(l.\`timestamp\`) <= ?
       AND l.\`timestamp\` <= NOW()`,
    [from, to],
  )

  const defectRows = rows.filter((r) => Number(r.quality_defect) === 1)
  const goodRows = rows.filter((r) => Number(r.quality_defect) !== 1)
  const defectCount = defectRows.length

  if (defectCount === 0) {
    return {
      source: 'period-defect-empty',
      grain,
      from,
      to,
      label,
      mode,
      defectCount: 0,
      items: [] as Array<{ feature: string; label: string; importance: number; primary: boolean }>,
    }
  }

  const mean = (list: FeatRow[], key: (typeof SPC_PARAM_KEYS)[number]) => {
    const vals = list.map((r) => r[key]).filter((v): v is number => v != null && Number.isFinite(Number(v))).map(Number)
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }
  const stdev = (list: FeatRow[], key: (typeof SPC_PARAM_KEYS)[number]) => {
    const vals = list.map((r) => r[key]).filter((v): v is number => v != null && Number.isFinite(Number(v))).map(Number)
    if (vals.length < 2) return 1
    const m = vals.reduce((a, b) => a + b, 0) / vals.length
    const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length
    return Math.sqrt(v) || 1
  }

  const scored = SPC_PARAM_KEYS.map((key) => {
    const md = mean(defectRows, key)
    const mg = mean(goodRows.length ? goodRows : rows, key)
    if (md == null || mg == null) return { feature: key, score: 0 }
    const sep = Math.abs(md - mg) / stdev(rows, key)
    return { feature: key, score: sep }
  })

  const sum = scored.reduce((a, b) => a + b.score, 0)
  const normalized = scored
    .map((s) => ({
      feature: s.feature,
      label: FEATURE_LABELS[s.feature] || s.feature,
      importance: sum > 0 ? s.score / sum : 0,
    }))
    .sort((a, b) => b.importance - a.importance)

  const items = normalized.map((item, i) => ({
    ...item,
    primary: i < 4,
  }))

  return {
    source: 'period-defect-separation',
    grain,
    from,
    to,
    label,
    mode,
    defectCount,
    items,
  }
}
