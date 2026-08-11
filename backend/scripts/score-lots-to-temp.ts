/**
 * Score lots via cascade voting → INSERT into MariaDB `temp` only.
 * Does not write judgment_lots / analysis_lots.
 *
 * Usage (from backend/):
 *   npx tsx scripts/score-lots-to-temp.ts
 *   npx tsx scripts/score-lots-to-temp.ts --limit=10000 --concurrency=4
 *
 * Requires: ai-service up (POST /predict-voting), DB DDL applied
 *   (DB/temp_judgment_like.sql), root .env DB_* .
 */
import '../src/loadRootEnv.js'
import { withConn } from '../src/db.js'
import {
  emptySpcHistory,
  scoreLotWithAi,
  type ProcessFeatures,
} from '../src/services/lotScore.js'
import {
  isProcessComplete,
  SPC_PARAM_KEYS,
  type SpcParamKey,
} from '../src/services/spcEngine.js'

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
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function rowToFeatures(row: LotRow): ProcessFeatures {
  return {
    d50: num(row.d50),
    d90: num(row.d90),
    metal_impurity: num(row.metal_impurity),
    lithium_input: num(row.lithium_input),
    additive_ratio: num(row.additive_ratio),
    process_time: num(row.process_time),
    sintering_temp: num(row.sintering_temp),
    humidity: num(row.humidity),
    tank_pressure: num(row.tank_pressure),
    operator_id: row.operator_id != null ? String(row.operator_id) : null,
    id: String(row.lot_id),
  }
}

async function ensureTempTable() {
  await withConn(async (conn) => {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`temp\` (
        lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
        quality_defect  TINYINT(1)   NOT NULL,
        capacity        DOUBLE       NULL,
        residual_li     DOUBLE       NULL,
        probability     DOUBLE       NULL,
        spc             VARCHAR(16)  NULL
      )
    `)
  })
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='))
  const truncate = !process.argv.includes('--no-truncate')
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 10000
  const concurrency = concurrencyArg ? Number(concurrencyArg.split('=')[1]) : 4
  const nLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10000
  const nConc = Math.min(Math.max(Number.isFinite(concurrency) ? concurrency : 4, 1), 16)

  await ensureTempTable()
  if (truncate) {
    await withConn(async (conn) => {
      await conn.query('TRUNCATE TABLE `temp`')
    })
    console.log('TEMP_TRUNCATED')
  }

  // User request: lots ORDER BY id ASC LIMIT N
  const selected = await withConn(async (conn) => {
    const rows = await conn.query(
      `SELECT id AS lot_id, \`timestamp\` AS recorded_at,
              d50, d90, metal_impurity, lithium_input, additive_ratio,
              process_time, sintering_temp, humidity, tank_pressure, operator_id
       FROM lots
       WHERE id <> 'LOT-SYS-HANDOVER'
       ORDER BY id ASC
       LIMIT ?`,
      [nLimit],
    )
    return rows as LotRow[]
  })

  // SPC history among selected lots in time order (id-selected set only).
  const byTime = [...selected].sort((a, b) => {
    const ta = new Date(a.recorded_at).getTime()
    const tb = new Date(b.recorded_at).getTime()
    if (ta !== tb) return ta - tb
    return String(a.lot_id).localeCompare(String(b.lot_id))
  })

  const history = emptySpcHistory()
  type Job = { row: LotRow; hist: Record<SpcParamKey, number[]> }
  const jobs: Job[] = []
  for (const row of byTime) {
    const features = rowToFeatures(row)
    const bag: Partial<Record<SpcParamKey, number | null>> = {}
    for (const k of SPC_PARAM_KEYS) bag[k] = features[k]
    const complete = isProcessComplete(bag)
    if (complete) {
      for (const k of SPC_PARAM_KEYS) history[k].push(Number(features[k]!))
    }
    const hist = {} as Record<SpcParamKey, number[]>
    for (const k of SPC_PARAM_KEYS) {
      hist[k] = complete ? history[k].slice() : []
    }
    jobs.push({ row, hist })
  }

  console.log('SCORE_TEMP_START', {
    selected: selected.length,
    jobs: jobs.length,
    concurrency: nConc,
    threshold: 0.4,
  })
  const started = Date.now()
  let ok = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < jobs.length; i += nConc) {
    const chunk = jobs.slice(i, i + nConc)
    const results = await Promise.allSettled(
      chunk.map(async ({ row, hist }) => {
        const features = rowToFeatures(row)
        const scored = await scoreLotWithAi(features, features, hist, features)
        await withConn(async (conn) => {
          await conn.query(
            `INSERT INTO \`temp\` (lot_id, quality_defect, capacity, residual_li, probability, spc)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               quality_defect = VALUES(quality_defect),
               capacity = VALUES(capacity),
               residual_li = VALUES(residual_li),
               probability = VALUES(probability),
               spc = VALUES(spc)`,
            [
              String(row.lot_id),
              scored.quality_defect === 1 ? 1 : 0,
              scored.capacity,
              scored.residual_lithium,
              scored.probability,
              scored.spc_status,
            ],
          )
        })
        return row.lot_id
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        ok++
      } else {
        failed++
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        errors.push(msg.slice(0, 200))
        if (errors.length <= 3) {
          console.error('FIRST_ERRORS', msg.slice(0, 400))
        }
      }
    }
    if (ok + failed === jobs.length || (ok + failed) % 50 === 0) {
      console.log(`PROGRESS ${ok + failed}/${jobs.length} ok=${ok} failed=${failed}`)
    }
  }

  console.log('SCORE_TEMP_DONE', {
    ok,
    failed,
    errors: errors.slice(0, 10),
    elapsed_ms: Date.now() - started,
  })
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
