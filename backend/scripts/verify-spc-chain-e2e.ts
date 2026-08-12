/**
 * Full chain: SPC_LOT → lots → (score) → judgment_lots + analysis_lots (+ lot_results).
 *   npx tsx scripts/verify-spc-chain-e2e.ts
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import { syncSpcLotsToApp } from '../src/services/spcLotSync.js'

const MOCK_ID = 'LOT-20991231-99991'

type Snap = {
  spc: string | null
  lot: string | null
  j: string | null
  j_prob: number | null
  j_cap: number | null
  j_res: number | null
  j_qd: number | null
  a: string | null
  scored_at: Date | string | null
  lr: string | null
}

async function snapshot(): Promise<Snap | null> {
  const rows = await query<Snap[]>(
    `SELECT s.lot_id AS spc, l.id AS lot,
            j.lot_id AS j, j.probability AS j_prob, j.capacity AS j_cap,
            j.residual_li AS j_res, j.quality_defect AS j_qd,
            a.lot_id AS a, a.scored_at, lr.lot_id AS lr
     FROM (SELECT ? AS lot_id) x
     LEFT JOIN SPC_LOT s ON s.lot_id = x.lot_id
     LEFT JOIN lots l ON l.id = x.lot_id
     LEFT JOIN judgment_lots j ON j.lot_id = x.lot_id
     LEFT JOIN analysis_lots a ON a.lot_id = x.lot_id
     LEFT JOIN lot_results lr ON lr.lot_id = x.lot_id`,
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
  await query(`DELETE FROM SPC_LOT WHERE lot_id = ?`, [MOCK_ID])
}

async function main() {
  await cleanup()

  // Discover max seq if column exists; else insert without seq.
  const cols = await query<Array<{ Field: string }>>(`SHOW COLUMNS FROM SPC_LOT`)
  const names = new Set(cols.map((c) => c.Field))
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const produced = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  if (names.has('seq')) {
    const mx = await query<Array<{ m: number | null }>>(`SELECT COALESCE(MAX(seq), 0) AS m FROM SPC_LOT`)
    const seq = Number(mx[0]?.m ?? 0) + 900000
    await query(
      `INSERT INTO SPC_LOT (
        seq, lot_id, produced_at, d50, d90, metal_impurity, lithium_input, additive_ratio,
        process_time, sintering_temp, humidity, tank_pressure, operator_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [seq, MOCK_ID, produced, 4.5, 9.0, 0.024, 2.5, 0.148, 72, 800, 50, 100, 'OP_MOCK'],
    )
  } else {
    await query(
      `INSERT INTO SPC_LOT (
        lot_id, produced_at, d50, d90, metal_impurity, lithium_input, additive_ratio,
        process_time, sintering_temp, humidity, tank_pressure, operator_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [MOCK_ID, produced, 4.5, 9.0, 0.024, 2.5, 0.148, 72, 800, 50, 100, 'OP_MOCK'],
    )
  }
  console.log('INSERTED_SPC', MOCK_ID)

  const before = await snapshot()
  console.log('BEFORE_SYNC', JSON.stringify(before))

  // Mirror only (SPC → lots). Full score of all missing can be huge; score this mock alone next.
  const sync = await syncSpcLotsToApp({
    skipScore: true,
    quiet: false,
  })
  console.log('SYNC_MIRROR', JSON.stringify(sync))

  const mid = await snapshot()
  console.log('AFTER_MIRROR', JSON.stringify(mid))

  const { scoreAllLots } = await import('../src/services/lot.service.js')
  const score = await scoreAllLots({ lotIds: [MOCK_ID], concurrency: 1 })
  console.log('SCORE', JSON.stringify(score))

  const after = await snapshot()
  console.log('AFTER_SCORE', JSON.stringify(after))

  const checks = [
    { name: 'spc_row', ok: after?.spc === MOCK_ID },
    { name: 'lots_from_spc', ok: after?.lot === MOCK_ID },
    { name: 'judgment_row', ok: after?.j === MOCK_ID },
    {
      name: 'judgment_fields',
      ok:
        after?.j_prob != null &&
        after?.j_cap != null &&
        after?.j_res != null &&
        after?.j_qd != null,
      detail: `prob=${after?.j_prob} cap=${after?.j_cap} res=${after?.j_res} qd=${after?.j_qd}`,
    },
    { name: 'analysis_row', ok: after?.a === MOCK_ID },
    {
      name: 'analysis_scored_at',
      ok: after?.scored_at != null,
      detail: String(after?.scored_at),
    },
    { name: 'lot_results_row', ok: after?.lr === MOCK_ID, detail: String(after?.lr) },
    {
      name: 'sync_inserted_mock',
      ok: sync.inserted >= 1 && !sync.skipped,
      detail: `inserted=${sync.inserted} skipped=${sync.skipped}`,
    },
    {
      name: 'score_ok',
      ok: score.failed === 0 && score.scored === 1,
      detail: JSON.stringify(score),
    },
  ]

  for (const c of checks) {
    console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail ?? '')
  }

  await cleanup()
  const gone = await snapshot()
  const deleted = !gone?.spc && !gone?.lot
  console.log(deleted ? 'PASS' : 'FAIL', 'cleanup')

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
