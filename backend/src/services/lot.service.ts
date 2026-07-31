import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import { buildIssueTitle, scoreLot, type RiskLevel } from './lotScore.js'

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

function toRisk(level: string): RiskLevel {
  if (level === '높음' || level === '중간') return level
  return '낮음'
}

function toDto(row: LotRow): LotDto {
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
    residualLithium: row.residual_lithium != null ? Number(row.residual_lithium) : null,
    spcStatus: row.spc_status,
    riskLevel: toRisk(row.risk_level),
    riskReason: row.risk_reason,
    scoredAt: row.scored_at ? formatDateTime(row.scored_at) : null,
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
     WHERE risk_level IN ('높음', '중간')
     ORDER BY FIELD(risk_level, '높음', '중간'), recorded_at DESC
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

/** Upsert lots from clf CSV and refresh provisional scores. */
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
    const sinteringTemp = num(cols[idx('sintering_temp')])
    const humidity = num(cols[idx('humidity')])
    const metalImpurity = num(cols[idx('metal_impurity')])
    const lithiumInput = num(cols[idx('lithium_input')])

    const scored = scoreLot({
      quality_defect: qualityDefect,
      sintering_temp: sinteringTemp,
      humidity,
      metal_impurity: metalImpurity,
      lithium_input: lithiumInput,
    })

    await query(
      `INSERT INTO lots (
        lot_id, recorded_at, d50, d90, metal_impurity, lithium_input, additive_ratio,
        process_time, sintering_temp, humidity, tank_pressure, operator_id, quality_defect,
        defect_prob, residual_lithium, spc_status, risk_level, risk_reason, scored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        recorded_at = VALUES(recorded_at),
        d50 = VALUES(d50), d90 = VALUES(d90),
        metal_impurity = VALUES(metal_impurity), lithium_input = VALUES(lithium_input),
        additive_ratio = VALUES(additive_ratio), process_time = VALUES(process_time),
        sintering_temp = VALUES(sintering_temp), humidity = VALUES(humidity),
        tank_pressure = VALUES(tank_pressure), operator_id = VALUES(operator_id),
        quality_defect = VALUES(quality_defect),
        defect_prob = VALUES(defect_prob), residual_lithium = VALUES(residual_lithium),
        spc_status = VALUES(spc_status), risk_level = VALUES(risk_level),
        risk_reason = VALUES(risk_reason), scored_at = NOW()`,
      [
        lotId,
        recordedAt,
        num(cols[idx('d50')]),
        num(cols[idx('d90')]),
        metalImpurity,
        lithiumInput,
        num(cols[idx('additive_ratio')]),
        num(cols[idx('process_time')]),
        sinteringTemp,
        humidity,
        num(cols[idx('tank_pressure')]),
        cols[idx('operator_id')]?.trim() || null,
        qualityDefect,
        scored.defect_prob,
        scored.residual_lithium,
        scored.spc_status,
        scored.risk_level,
        scored.risk_reason,
      ],
    )
    imported++
  }

  return { imported, path: filePath }
}

/** Create open issues for 높음/중간 lots that have no non-completed issue. */
export async function ensureIssuesForRiskLots(): Promise<number> {
  const lots = await query<
    { lot_id: string; recorded_at: Date | string; risk_level: string; risk_reason: string | null }[]
  >(
    `SELECT lot_id, recorded_at, risk_level, risk_reason FROM lots
     WHERE risk_level IN ('높음', '중간')`,
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
    const title = buildIssueTitle(lot.risk_reason || lot.risk_level, lot.lot_id)

    await query(
      `INSERT INTO issues (issue_id, lot_id, occurred_at, risk_level, status, title)
       VALUES (?, ?, ?, ?, '접수', ?)
       ON DUPLICATE KEY UPDATE lot_id = lot_id`,
      [issueId, lot.lot_id, occurred, lot.risk_level, title.slice(0, 255)],
    )
    created++
  }
  return created
}
