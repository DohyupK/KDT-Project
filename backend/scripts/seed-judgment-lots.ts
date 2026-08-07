/**
 * Create judgment_lots (if needed) and seed from:
 *   cathode_clf_data.csv (id, quality_defect)
 *   cathode_reg_data.csv (id, capacity)
 *   cathode_qc_reg_data.csv (id, residual_li) ∩ lots.id
 */
import '../src/loadRootEnv.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mariadb from 'mariadb'

function resolveCsv(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, `../../ai-service/data/${name}`),
    path.resolve(process.cwd(), `../ai-service/data/${name}`),
    path.resolve(process.cwd(), `ai-service/data/${name}`),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`CSV not found: ${name}`)
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

function loadClfDefects(filePath: string): Map<string, number> {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const iId = header.indexOf('id')
  const iQd = header.indexOf('quality_defect')
  if (iId < 0 || iQd < 0) throw new Error('clf CSV missing id/quality_defect')
  const map = new Map<string, number>()
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const id = cols[iId]?.trim()
    if (!id) continue
    map.set(id, Number(cols[iQd]) === 1 ? 1 : 0)
  }
  return map
}

function loadCapacity(filePath: string): Map<string, number | null> {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const iId = header.indexOf('id')
  const iCap = header.indexOf('capacity')
  if (iId < 0 || iCap < 0) throw new Error('reg CSV missing id/capacity')
  const map = new Map<string, number | null>()
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const id = cols[iId]?.trim()
    if (!id) continue
    const raw = cols[iCap]?.trim()
    map.set(id, raw === '' || raw == null ? null : Number(raw))
  }
  return map
}

function loadResidual(filePath: string): Map<string, number | null> {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const iId = header.indexOf('id')
  const iRes = header.indexOf('residual_li')
  if (iId < 0 || iRes < 0) throw new Error('qc CSV missing id/residual_li')
  const map = new Map<string, number | null>()
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const id = cols[iId]?.trim()
    if (!id) continue
    const raw = cols[iRes]?.trim()
    map.set(id, raw === '' || raw == null ? null : Number(raw))
  }
  return map
}

const DDL = `
CREATE TABLE IF NOT EXISTS judgment_lots (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL,
  residual_li     DOUBLE       NULL,
  probability     DOUBLE       NULL,
  CONSTRAINT fk_judgment_lots_lot
    FOREIGN KEY (lot_id) REFERENCES lots(id)
    ON DELETE CASCADE
)`

async function main() {
  const clfPath = resolveCsv('cathode_clf_data.csv')
  const regPath = resolveCsv('cathode_reg_data.csv')
  const qcPath = resolveCsv('cathode_qc_reg_data.csv')
  const clf = loadClfDefects(clfPath)
  const reg = loadCapacity(regPath)
  const residualCsv = loadResidual(qcPath)
  console.log('CSV', {
    clf: clf.size,
    reg: reg.size,
    qc: residualCsv.size,
    clfPath,
    regPath,
    qcPath,
  })

  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  try {
    await conn.query(DDL)
    console.log('DDL_OK')

    const lotRows = (await conn.query('SELECT id FROM lots')) as { id: string }[]
    const lotIds = new Set(lotRows.map((r) => r.id))
    console.log('LOTS', lotIds.size)

    let joined = 0
    let skippedNoLot = 0
    let skippedNoPair = 0
    const batch: [string, number, number | null, number | null][] = []

    for (const [id, qd] of clf) {
      if (!reg.has(id)) {
        skippedNoPair++
        continue
      }
      if (!lotIds.has(id)) {
        skippedNoLot++
        continue
      }
      batch.push([id, qd, reg.get(id) ?? null, residualCsv.get(id) ?? null])
      joined++
    }

    const CHUNK = 500
    for (let i = 0; i < batch.length; i += CHUNK) {
      const slice = batch.slice(i, i + CHUNK)
      const placeholders = slice.map(() => '(?, ?, ?, ?)').join(', ')
      const params = slice.flat()
      await conn.query(
        `REPLACE INTO judgment_lots (lot_id, quality_defect, capacity, residual_li)
         VALUES ${placeholders}`,
        params,
      )
    }

    const countRows = (await conn.query(
      'SELECT COUNT(*) AS c FROM judgment_lots',
    )) as { c: bigint | number }[]
    const sample = (await conn.query(
      'SELECT lot_id, quality_defect, capacity, residual_li FROM judgment_lots ORDER BY lot_id ASC LIMIT 3',
    )) as {
      lot_id: string
      quality_defect: number
      capacity: number | null
      residual_li: number | null
    }[]
    const fk = (await conn.query(
      `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'judgment_lots' AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [process.env.DB_NAME],
    )) as {
      COLUMN_NAME: string
      REFERENCED_TABLE_NAME: string
      REFERENCED_COLUMN_NAME: string
    }[]

    console.log('SEED', {
      inserted: joined,
      skippedNoPair,
      skippedNoLot,
      tableCount: Number(countRows[0]?.c ?? 0),
      fk: fk.map(
        (f) =>
          `${f.COLUMN_NAME}->${f.REFERENCED_TABLE_NAME}.${f.REFERENCED_COLUMN_NAME}`,
      ),
      sample,
    })
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
