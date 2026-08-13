/**
 * Smoke: MariaDB + ai-service (/health, /predict-voting).
 *   npx tsx scripts/smoke-db-ai.ts
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

const AI = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')

async function main() {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = []

  try {
    const rows = await query<Array<{ ok: number; db: string }>>(
      `SELECT 1 AS ok, DATABASE() AS db`,
    )
    checks.push({
      name: 'db_select',
      ok: Number(rows[0]?.ok) === 1 && !!rows[0]?.db,
      detail: `db=${rows[0]?.db}`,
    })
  } catch (err) {
    checks.push({
      name: 'db_select',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const cover = await query<
      Array<{ lots: number | bigint; j: number | bigint | string; a: number | bigint | string }>
    >(
      `SELECT COUNT(*) AS lots,
              SUM(j.lot_id IS NOT NULL) AS j,
              SUM(a.lot_id IS NOT NULL) AS a
       FROM lots l
       LEFT JOIN judgment_lots j ON j.lot_id = l.id
       LEFT JOIN analysis_lots a ON a.lot_id = l.id
       WHERE l.id <> 'LOT-SYS-HANDOVER'`,
    )
    const lots = Number(cover[0]?.lots ?? 0)
    const j = Number(cover[0]?.j ?? 0)
    const a = Number(cover[0]?.a ?? 0)
    checks.push({
      name: 'db_chain_tables',
      ok: lots > 0 && j > 0 && a > 0,
      detail: `lots=${lots} judgment=${j} analysis=${a}`,
    })
  } catch (err) {
    checks.push({
      name: 'db_chain_tables',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const health = await fetch(`${AI}/health`)
    const hj = (await health.json()) as { status?: string; model_version?: string }
    checks.push({
      name: 'ai_health',
      ok: health.ok && hj.status === 'ok',
      detail: `status=${hj.status} version=${hj.model_version}`,
    })
  } catch (err) {
    checks.push({
      name: 'ai_health',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const body = {
      d50: 4.5,
      d90: 9.0,
      metal_impurity: 0.024,
      lithium_input: 2.5,
      additive_ratio: 0.148,
      process_time: 72,
      sintering_temp: 800,
      humidity: 50,
      tank_pressure: 100,
      operator_id: 'OP_SMOKE',
    }
    const res = await fetch(`${AI}/predict-voting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const jj = (await res.json()) as Record<string, unknown>
    const ok =
      res.ok &&
      typeof jj.probability === 'number' &&
      typeof jj.capacity === 'number' &&
      typeof jj.residual_li === 'number'
    checks.push({
      name: 'ai_predict_voting',
      ok,
      detail: `http=${res.status} prob=${jj.probability} cap=${jj.capacity} res=${jj.residual_li}`,
    })
  } catch (err) {
    checks.push({
      name: 'ai_predict_voting',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  for (const c of checks) {
    console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail ?? '')
  }
  const allOk = checks.every((c) => c.ok)
  console.log('RESULT', allOk ? 'ALL_OK' : 'FAILED')
  process.exit(allOk ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
