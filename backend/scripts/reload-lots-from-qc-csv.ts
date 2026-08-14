/**
 * Reload lots from cathode_qc_reg_data.csv (no residual_li).
 * Drops lots.residual_li; preserves child rows via FK checks off + same ids.
 */
import '../src/loadRootEnv.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mariadb from 'mariadb'

const NUM_VARS = [
  'd50',
  'd90',
  'metal_impurity',
  'lithium_input',
  'additive_ratio',
  'process_time',
  'sintering_temp',
  'humidity',
  'tank_pressure',
] as const

function resolveQcCsv(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../../ai-service/data/cathode_qc_reg_data.csv'),
    path.resolve(process.cwd(), '../ai-service/data/cathode_qc_reg_data.csv'),
    path.resolve(process.cwd(), 'ai-service/data/cathode_qc_reg_data.csv'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error('cathode_qc_reg_data.csv not found')
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

function loadRows(filePath: string): {
  id: string
  timestamp: string
  features: (number | null)[]
  operator_id: string | null
}[] {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const idx = (name: string) => header.indexOf(name)
  const iId = idx('id')
  const iTs = idx('timestamp')
  const iOp = idx('operator_id')
  if (iId < 0 || iTs < 0) throw new Error('CSV missing id/timestamp')

  const rows: {
    id: string
    timestamp: string
    features: (number | null)[]
    operator_id: string | null
  }[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const id = cols[iId]?.trim()
    if (!id) continue
    const tsRaw = cols[iTs]?.trim() || ''
    const timestamp = tsRaw.replace('T', ' ').slice(0, 19)
    rows.push({
      id,
      timestamp,
      features: NUM_VARS.map((k) => num(cols[idx(k)])),
      operator_id: cols[iOp]?.trim() || null,
    })
  }
  return rows
}

async function main() {
  const csvPath = resolveQcCsv()
  const rows = loadRows(csvPath)
  console.log('CSV_ROWS', rows.length, csvPath)

  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  try {
    const beforeJl = (await conn.query(
      'SELECT COUNT(*) AS c FROM JUDGMENT_LOTS',
    )) as { c: bigint | number }[]
    const jlBefore = Number(beforeJl[0]?.c ?? 0)

    await conn.query('ALTER TABLE LOTS DROP COLUMN IF EXISTS residual_li')
    console.log('DROPPED_residual_li')

    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    await conn.query('DELETE FROM LOTS')
    console.log('LOTS_CLEARED')

    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const placeholders = slice
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ')
      const params: unknown[] = []
      for (const r of slice) {
        params.push(r.id, r.timestamp, ...r.features, r.operator_id)
      }
      await conn.query(
        `INSERT INTO LOTS (
          id, \`timestamp\`, d50, d90, metal_impurity, lithium_input, additive_ratio,
          process_time, sintering_temp, humidity, tank_pressure, operator_id
        ) VALUES ${placeholders}`,
        params,
      )
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    console.log('LOTS_INSERTED', rows.length)

    const afterLots = (await conn.query('SELECT COUNT(*) AS c FROM LOTS')) as {
      c: bigint | number
    }[]
    const afterJl = (await conn.query(
      'SELECT COUNT(*) AS c FROM JUDGMENT_LOTS',
    )) as { c: bigint | number }[]
    const orphans = (await conn.query(
      `SELECT COUNT(*) AS c FROM JUDGMENT_LOTS j
       LEFT JOIN LOTS l ON l.id = j.lot_id
       WHERE l.id IS NULL`,
    )) as { c: bigint | number }[]
    const cols = (await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'LOTS'
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME],
    )) as { COLUMN_NAME: string }[]
    const sample = (await conn.query(
      'SELECT id, \`timestamp\`, d50, operator_id FROM LOTS ORDER BY id ASC LIMIT 1',
    )) as { id: string; timestamp: Date; d50: number; operator_id: string }[]

    console.log('VERIFY', {
      lots: Number(afterLots[0]?.c ?? 0),
      judgmentBefore: jlBefore,
      judgmentAfter: Number(afterJl[0]?.c ?? 0),
      judgmentOrphans: Number(orphans[0]?.c ?? 0),
      cols: cols.map((c) => c.COLUMN_NAME).join(', '),
      sample: sample[0],
    })

    if (Number(afterLots[0]?.c ?? 0) !== rows.length) {
      throw new Error('lots count mismatch')
    }
    if (Number(afterJl[0]?.c ?? 0) !== jlBefore) {
      throw new Error('judgment_lots count changed')
    }
    if (Number(orphans[0]?.c ?? 0) !== 0) {
      throw new Error('judgment_lots orphan lot_ids')
    }
    if (cols.some((c) => c.COLUMN_NAME === 'residual_li')) {
      throw new Error('residual_li still on lots')
    }
  } finally {
    await conn.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
