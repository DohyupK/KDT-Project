/**
 * One mock lot E2E: insert → score pipeline → assert → delete.
 *   npx tsx scripts/mock-lot-e2e.ts
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import * as lotService from '../src/services/lot.service.js'

const MOCK_ID = 'LOT-MOCK-E2E-20260812'

type Check = { name: string; ok: boolean; detail?: string }

async function snapshot() {
  const rows = await query<
    Array<{
      lot: string | null
      j: string | null
      j_residual: number | null
      j_prob: number | null
      j_cap: number | null
      j_qd: number | null
      lr: string | null
      lr_residual: number | null
      lr_qd: number | null
      a: string | null
      scored_at: Date | string | null
      risk: string | null
      spc: string | null
    }>
  >(
    `SELECT l.id AS lot,
            j.lot_id AS j, j.residual_li AS j_residual, j.probability AS j_prob,
            j.capacity AS j_cap, j.quality_defect AS j_qd,
            lr.lot_id AS lr, lr.residual_li AS lr_residual, lr.quality_defect AS lr_qd,
            a.lot_id AS a, a.scored_at, a.risk_level AS risk, a.spc_status AS spc
     FROM lots l
     LEFT JOIN judgment_lots j ON j.lot_id = l.id
     LEFT JOIN lot_results lr ON lr.lot_id = l.id
     LEFT JOIN analysis_lots a ON a.lot_id = l.id
     WHERE l.id = ?`,
    [MOCK_ID],
  )
  return rows[0] ?? null
}

async function cleanup() {
  await query(`DELETE FROM issues WHERE lot_id = ?`, [MOCK_ID])
  await query(`DELETE FROM lot_results WHERE lot_id = ?`, [MOCK_ID])
  await query(`DELETE FROM judgment_lots WHERE lot_id = ?`, [MOCK_ID])
  await query(`DELETE FROM analysis_lots WHERE lot_id = ?`, [MOCK_ID])
  await query(`DELETE FROM lots WHERE id = ?`, [MOCK_ID])
}

async function main() {
  await cleanup()

  // 1) mock lots row (schema column names)
  await query(
    `INSERT INTO lots (
      id, \`timestamp\`, d50, d90, metal_impurity, lithium_input, additive_ratio,
      process_time, sintering_temp, humidity, tank_pressure, operator_id
    ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      MOCK_ID,
      4.5,
      9.0,
      0.024,
      2.5,
      0.148,
      72.0,
      800.0,
      50.0,
      100.0,
      'OP_MOCK',
    ],
  )
  console.log('INSERTED', MOCK_ID)

  const before = await snapshot()
  console.log('BEFORE_SCORE', before)

  // 2) run full score pipeline
  const score = await lotService.scoreAllLots({
    lotIds: [MOCK_ID],
    concurrency: 1,
  })
  console.log('SCORE', JSON.stringify(score))

  const after = await snapshot()
  console.log('AFTER_SCORE', after)

  const checks: Check[] = [
    { name: 'lots_row', ok: after?.lot === MOCK_ID },
    { name: 'lot_results_lot_id', ok: after?.lr === MOCK_ID, detail: String(after?.lr) },
    {
      name: 'lot_results_residual_not_null',
      ok: after?.lr_residual != null && Number.isFinite(Number(after.lr_residual)),
      detail: String(after?.lr_residual),
    },
    {
      name: 'lot_results_qd_not_null',
      ok: after?.lr_qd != null,
      detail: String(after?.lr_qd),
    },
    { name: 'judgment_lot_id', ok: after?.j === MOCK_ID },
    {
      name: 'judgment_residual_not_null',
      ok: after?.j_residual != null && Number.isFinite(Number(after.j_residual)),
      detail: String(after?.j_residual),
    },
    {
      name: 'judgment_probability_not_null',
      ok: after?.j_prob != null,
      detail: String(after?.j_prob),
    },
    {
      name: 'judgment_capacity_not_null',
      ok: after?.j_cap != null,
      detail: String(after?.j_cap),
    },
    { name: 'analysis_lot_id', ok: after?.a === MOCK_ID },
    {
      name: 'analysis_scored_at_not_null',
      ok: after?.scored_at != null,
      detail: String(after?.scored_at),
    },
    { name: 'score_failed_zero', ok: score.failed === 0 && score.scored === 1 },
  ]

  for (const c of checks) {
    console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail ?? '')
  }

  // 3) delete mock
  await cleanup()
  const gone = await snapshot()
  const deleted = gone == null
  console.log(deleted ? 'PASS' : 'FAIL', 'mock_deleted')

  const allOk = checks.every((c) => c.ok) && deleted
  console.log('RESULT', allOk ? 'ALL_OK' : 'FAILED')
  process.exit(allOk ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  try {
    await cleanup()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
