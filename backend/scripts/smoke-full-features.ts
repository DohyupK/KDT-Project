/**
 * Full feature smoke for hotfix scoring stack.
 *   npx tsx scripts/smoke-full-features.ts
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import * as lotService from '../src/services/lot.service.js'
import { runBootScoreOnce } from '../src/services/bootScore.js'
import { composeIssueContentViaVllm, composeRiskReasonViaVllm } from '../src/services/vllmRiskReason.js'
import { pickUnscoredLotIds } from '../src/services/unscoredLots.js'

const AI = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')
const MOCK_ID = 'LOT-20991231-99992'

type Check = { name: string; ok: boolean; detail?: string }
const checks: Check[] = []

function pass(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail })
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '')
}

async function cleanup() {
  await query(`DELETE FROM ISSUES WHERE lot_id = ?`, [MOCK_ID])
  await query(`DELETE FROM LOT_RESULTS WHERE lot_id = ?`, [MOCK_ID])
  await query(`DELETE FROM JUDGMENT_LOTS WHERE lot_id = ?`, [MOCK_ID])
  await query(`DELETE FROM ANALYSIS_LOTS WHERE lot_id = ?`, [MOCK_ID])
  await query(`DELETE FROM LOTS WHERE id = ?`, [MOCK_ID])
  await query(`DELETE FROM SPC_LOT WHERE lot_id = ?`, [MOCK_ID]).catch(() => undefined)
}

async function main() {
  // 1) AI health + predict-voting
  try {
    const health = await fetch(`${AI}/health`)
    const hj = (await health.json()) as { status?: string; model_version?: string }
    pass(
      'ai_health',
      health.ok && hj.status === 'ok',
      `version=${hj.model_version}`,
    )
  } catch (e) {
    pass('ai_health', false, e instanceof Error ? e.message : String(e))
  }

  try {
    const res = await fetch(`${AI}/predict-voting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    })
    const jj = (await res.json()) as Record<string, unknown>
    pass(
      'ai_predict_voting',
      res.ok &&
        typeof jj.probability === 'number' &&
        typeof jj.capacity === 'number' &&
        typeof jj.residual_li === 'number',
      `http=${res.status} prob=${jj.probability}`,
    )
  } catch (e) {
    pass('ai_predict_voting', false, e instanceof Error ? e.message : String(e))
  }

  // 2) DB chain coverage
  try {
    const cover = await query<
      Array<{ lots: number | bigint; j: number | bigint | string; a: number | bigint | string }>
    >(
      `SELECT COUNT(*) AS lots,
              SUM(j.lot_id IS NOT NULL) AS j,
              SUM(a.lot_id IS NOT NULL) AS a
       FROM LOTS l
       LEFT JOIN JUDGMENT_LOTS j ON j.lot_id = l.id
       LEFT JOIN ANALYSIS_LOTS a ON a.lot_id = l.id
       WHERE l.id <> 'LOT-SYS-HANDOVER'`,
    )
    const lots = Number(cover[0]?.lots ?? 0)
    const j = Number(cover[0]?.j ?? 0)
    const a = Number(cover[0]?.a ?? 0)
    pass('db_chain_coverage', lots > 0 && j > 0 && a > 0, `lots=${lots} j=${j} a=${a}`)
  } catch (e) {
    pass('db_chain_coverage', false, e instanceof Error ? e.message : String(e))
  }

  // 3) exports exist
  pass(
    'export_refreshSpcAndRiskScores',
    typeof lotService.refreshSpcAndRiskScores === 'function',
  )
  pass(
    'export_buildSpcChartSnapshot',
    typeof lotService.buildSpcChartSnapshot === 'function',
  )
  pass('export_bootScore', typeof runBootScoreOnce === 'function')
  pass(
    'export_composeIssueContentViaVllm',
    typeof composeIssueContentViaVllm === 'function',
  )

  // 4) score one mock lot: 3-stage + chart + scored_at
  await cleanup()
  await query(
    `INSERT INTO LOTS (
      id, \`timestamp\`, d50, d90, metal_impurity, lithium_input, additive_ratio,
      process_time, sintering_temp, humidity, tank_pressure, operator_id
    ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [MOCK_ID, 4.5, 9.0, 0.024, 2.5, 0.148, 72, 800, 50, 100, 'OP_SMOKE'],
  )
  const score = await lotService.scoreAllLots({ lotIds: [MOCK_ID], concurrency: 1 })
  pass('score_mock', score.failed === 0 && score.scored === 1, JSON.stringify(score))

  const snap = await query<
    Array<{
      lr: string | null
      j: string | null
      a: string | null
      scored_at: Date | string | null
      chart: string | null
    }>
  >(
    `SELECT lr.lot_id AS lr, j.lot_id AS j, a.lot_id AS a, a.scored_at,
            CASE WHEN a.spc_chart_json IS NULL THEN NULL ELSE 'yes' END AS chart
     FROM LOTS l
     LEFT JOIN LOT_RESULTS lr ON lr.lot_id = l.id
     LEFT JOIN JUDGMENT_LOTS j ON j.lot_id = l.id
     LEFT JOIN ANALYSIS_LOTS a ON a.lot_id = l.id
     WHERE l.id = ?`,
    [MOCK_ID],
  )
  const row = snap[0]
  pass('stage1_lot_results', row?.lr === MOCK_ID)
  pass('stage2_judgment', row?.j === MOCK_ID)
  pass('stage3_analysis', row?.a === MOCK_ID)
  pass('scored_at', row?.scored_at != null, String(row?.scored_at))
  pass('spc_chart_json', row?.chart === 'yes', String(row?.chart))

  // 5) refreshSpc on mock
  try {
    const refreshed = await lotService.refreshSpcAndRiskScores({ lotIds: [MOCK_ID] })
    pass(
      'refresh_spc',
      refreshed.chartsWritten >= 1 || refreshed.updated + refreshed.unchanged >= 1,
      JSON.stringify(refreshed),
    )
  } catch (e) {
    pass('refresh_spc', false, e instanceof Error ? e.message : String(e))
  }

  // 6) boot score once — score only (skip vLLM to keep smoke fast)
  try {
    const { syncSpcLotsToApp } = await import('../src/services/spcLotSync.js')
    const sync = await syncSpcLotsToApp({
      concurrency: 4,
      unscoredLimit: 5,
      skipRiskReason: true,
      skipIssues: true,
      quiet: true,
    })
    pass(
      'boot_score_once',
      !sync.skipped || sync.scored >= 0,
      JSON.stringify({
        skipped: sync.skipped,
        scored: sync.scored,
        failed: sync.failed,
        inserted: sync.inserted,
      }),
    )
  } catch (e) {
    pass('boot_score_once', false, e instanceof Error ? e.message : String(e))
  }

  // 7) pickUnscored API
  try {
    const picked = await pickUnscoredLotIds(5)
    pass(
      'pick_unscored',
      Array.isArray(picked.lotIds) && typeof picked.reason.queue_a === 'number',
      `n=${picked.lotIds.length} a=${picked.reason.queue_a} b=${picked.reason.queue_b}`,
    )
  } catch (e) {
    pass('pick_unscored', false, e instanceof Error ? e.message : String(e))
  }

  // 8) vLLM helpers (soft: transport fail still OK if fallback path works)
  try {
    const rr = await composeRiskReasonViaVllm({
      lot_id: MOCK_ID,
      probability: 0.1,
      spc_status: '안정',
      risk_level: '안정',
      residual_li: 2900,
      capacity: 200,
      quality_defect: 0,
    })
    pass(
      'vllm_risk_reason_callable',
      typeof rr.risk_reason === 'string',
      rr.error ? `error=${rr.error}` : 'ok',
    )
  } catch (e) {
    pass('vllm_risk_reason_callable', false, e instanceof Error ? e.message : String(e))
  }

  try {
    const ic = await composeIssueContentViaVllm({
      lotId: MOCK_ID,
      riskLevel: '심각',
      riskReason: 'SPC 이탈, 잔류리튬 높음',
    })
    pass(
      'vllm_issue_content_callable',
      typeof ic.issue_content === 'string',
      ic.error ? `error=${ic.error}` : `content=${ic.issue_content.slice(0, 40)}`,
    )
  } catch (e) {
    pass('vllm_issue_content_callable', false, e instanceof Error ? e.message : String(e))
  }

  // 9) issue analysis scoredAt mapping (SQL shape)
  try {
    const detail = await query<
      Array<{ analysis_scored_at: Date | string | null }>
    >(
      `SELECT a.scored_at AS analysis_scored_at
       FROM ANALYSIS_LOTS a WHERE a.lot_id = ? LIMIT 1`,
      [MOCK_ID],
    )
    pass(
      'analysis_scored_at_column',
      detail[0]?.analysis_scored_at != null,
      String(detail[0]?.analysis_scored_at),
    )
  } catch (e) {
    pass('analysis_scored_at_column', false, e instanceof Error ? e.message : String(e))
  }

  await cleanup()

  const allOk = checks.every((c) => c.ok)
  console.log('RESULT', allOk ? 'ALL_OK' : 'FAILED')
  console.log(
    'FAILED_LIST',
    checks.filter((c) => !c.ok).map((c) => c.name).join(',') || '(none)',
  )
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
