/**
 * Doc-driven feature verification against:
 * - docs/references/issue-lot-api.md
 * - docs/references/multi-model-voting.md
 * - docs/references/ai-service-feature-catalog.md
 * - docs/references/scenario-smoke-checklist.md (API subset)
 *
 *   npx tsx scripts/verify-docs-features.ts
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import * as lotService from '../src/services/lot.service.js'
import { predictVoting, proxyChat } from '../src/services/aiProxy.js'

const AI = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')
const BE = `http://127.0.0.1:${process.env.PORT || 3001}`
const MOCK = 'LOT-DOC-VERIFY-99991'

type Row = { name: string; ok: boolean; detail?: string; skip?: boolean }
const rows: Row[] = []

function pass(name: string, ok: boolean, detail?: string) {
  rows.push({ name, ok, detail })
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '')
}

function skip(name: string, detail: string) {
  rows.push({ name, ok: true, detail, skip: true })
  console.log('SKIP', name, detail)
}

async function httpJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { res, json, text }
}

async function cleanup() {
  await query(`DELETE FROM issues WHERE lot_id = ?`, [MOCK])
  await query(`DELETE FROM lot_results WHERE lot_id = ?`, [MOCK])
  await query(`DELETE FROM judgment_lots WHERE lot_id = ?`, [MOCK])
  await query(`DELETE FROM analysis_lots WHERE lot_id = ?`, [MOCK])
  await query(`DELETE FROM lots WHERE id = ?`, [MOCK])
}

async function main() {
  console.log('DOC_VERIFY', { AI, BE })

  // --- ai-service-feature-catalog / multi-model-voting ---
  try {
    const { res, json } = await httpJson(`${AI}/health`)
    const j = json as { status?: string; model_version?: string }
    pass(
      'ai.health',
      res.ok && j.status === 'ok',
      `version=${j.model_version}`,
    )
  } catch (e) {
    pass('ai.health', false, e instanceof Error ? e.message : String(e))
  }

  const featBody = {
    d50: 4.5,
    d90: 9.0,
    metal_impurity: 0.024,
    lithium_input: 2.5,
    additive_ratio: 0.148,
    process_time: 72,
    sintering_temp: 800,
    humidity: 50,
    tank_pressure: 100,
    operator_id: 'OP_DOC',
  }

  for (const path of [
    '/predict-voting',
    '/predict',
    '/predict-capacity',
    '/predict-residual',
  ] as const) {
    try {
      const { res, json } = await httpJson(`${AI}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(featBody),
      })
      const j = json as Record<string, unknown>
      const ok =
        path === '/predict-voting'
          ? res.ok &&
            typeof j.probability === 'number' &&
            typeof j.capacity === 'number' &&
            typeof j.residual_li === 'number'
          : path === '/predict'
            ? res.ok && typeof j.probability === 'number'
            : path === '/predict-capacity'
              ? res.ok && typeof j.capacity === 'number'
              : res.ok && typeof j.residual_li === 'number'
      pass(`ai${path}`, ok, `http=${res.status}`)
    } catch (e) {
      pass(`ai${path}`, false, e instanceof Error ? e.message : String(e))
    }
  }

  // chat: no features → usage guide (scenario §3)
  try {
    const chat = await proxyChat({ message: '안녕' })
    pass(
      'ai.chat.no_features_guide',
      typeof chat.reply === 'string' && chat.reply.length > 0,
      `mode=${chat.mode} predict=${chat.predict == null ? 'null' : 'set'}`,
    )
  } catch (e) {
    pass('ai.chat.no_features_guide', false, e instanceof Error ? e.message : String(e))
  }

  // chat: with features — note: voting-only registry may leave predict null (known weak)
  try {
    const chat = await proxyChat({
      message: '이거 지금 어때?',
      features: featBody,
    })
    const hasPredict = chat.predict != null
    pass(
      'ai.chat.with_features',
      typeof chat.reply === 'string' && chat.reply.length > 0,
      `predict=${hasPredict ? 'set' : 'null'} mode=${chat.mode} (registry voting-only may leave predict null)`,
    )
  } catch (e) {
    pass('ai.chat.with_features', false, e instanceof Error ? e.message : String(e))
  }

  // security-chat JSON (catalog: smoke/compat)
  try {
    const { res, json } = await httpJson(`${AI}/security-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '리튬 투입비 규정 요약해줘' }),
    })
    const j = json as { reply?: string; error?: string | null }
    pass(
      'ai.security-chat.json',
      res.ok && typeof j.reply === 'string' && j.reply.length > 0,
      `http=${res.status} err=${j.error ?? ''}`,
    )
  } catch (e) {
    pass('ai.security-chat.json', false, e instanceof Error ? e.message : String(e))
  }

  // --- issue-lot-api: 3-stage score ---
  await cleanup()
  await query(
    `INSERT INTO lots (
      id, \`timestamp\`, d50, d90, metal_impurity, lithium_input, additive_ratio,
      process_time, sintering_temp, humidity, tank_pressure, operator_id
    ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [MOCK, 4.5, 9.0, 0.024, 2.5, 0.148, 72, 800, 50, 100, 'OP_DOC'],
  )
  const scored = await lotService.scoreAllLots({ lotIds: [MOCK], concurrency: 1 })
  pass('lot.score_3stage', scored.failed === 0 && scored.scored === 1, JSON.stringify(scored))

  const snap = await query<
    Array<{
      lr: string | null
      j: string | null
      a: string | null
      scored_at: Date | string | null
      chart: string | null
      risk: string | null
    }>
  >(
    `SELECT lr.lot_id AS lr, j.lot_id AS j, a.lot_id AS a, a.scored_at,
            CASE WHEN a.spc_chart_json IS NULL THEN NULL ELSE 'yes' END AS chart,
            a.risk_level AS risk
     FROM lots l
     LEFT JOIN lot_results lr ON lr.lot_id = l.id
     LEFT JOIN judgment_lots j ON j.lot_id = l.id
     LEFT JOIN analysis_lots a ON a.lot_id = l.id
     WHERE l.id = ?`,
    [MOCK],
  )
  const row = snap[0]
  pass('lot.stage1_lot_results', row?.lr === MOCK)
  pass('lot.stage2_judgment', row?.j === MOCK)
  pass('lot.stage3_analysis', row?.a === MOCK)
  pass('lot.scored_at', row?.scored_at != null, String(row?.scored_at))
  pass('lot.spc_chart_json', row?.chart === 'yes')

  // predictVoting direct (multi-model-voting)
  try {
    const v = await predictVoting(featBody)
    pass(
      'be.predictVoting',
      typeof v.probability === 'number' && typeof v.capacity === 'number',
      `prob=${v.probability} cap=${v.capacity}`,
    )
  } catch (e) {
    pass('be.predictVoting', false, e instanceof Error ? e.message : String(e))
  }

  // --- backend HTTP (issue-lot-api endpoints) ---
  try {
    const { res } = await httpJson(`${BE}/api/health`)
    pass('be.health', res.ok, `http=${res.status}`)
  } catch (e) {
    pass('be.health', false, e instanceof Error ? e.message : String(e))
    console.log('NOTE backend down — skipping HTTP API checks')
  }

  const beUp = rows.find((r) => r.name === 'be.health')?.ok
  if (beUp) {
    const endpoints: Array<{ name: string; path: string; check: (j: unknown) => boolean }> = [
      {
        name: 'api.lots.risk-top',
        path: '/api/lots/risk-top',
        check: (j) => Array.isArray((j as { lots?: unknown }).lots),
      },
      {
        name: 'api.lots.daily-kpi',
        path: '/api/lots/daily-kpi',
        check: (j) => typeof (j as { threshold?: unknown }).threshold === 'number',
      },
      {
        name: 'api.lots.q-cost',
        path: '/api/lots/q-cost',
        check: (j) => typeof (j as { totalQCost?: unknown }).totalQCost === 'number',
      },
      {
        name: 'api.issues',
        path: '/api/issues?limit=2',
        check: (j) => Array.isArray((j as { issues?: unknown }).issues),
      },
      {
        name: 'api.knowledge.past-issues',
        path: '/api/knowledge/past-issues?limit=2',
        check: (j) => Array.isArray((j as { items?: unknown }).items),
      },
      {
        name: 'api.knowledge.handover-history',
        path: '/api/knowledge/handover-history?status=pending',
        check: (j) => j != null,
      },
      {
        name: 'api.dashboard.lot-risks',
        path: '/api/dashboard/lot-risks',
        check: (j) => Array.isArray((j as { items?: unknown }).items),
      },
      {
        name: 'api.dashboard.production-trend',
        path: '/api/dashboard/production-trend',
        check: (j) => Array.isArray((j as { points?: unknown }).points),
      },
    ]

    for (const ep of endpoints) {
      try {
        const { res, json } = await httpJson(`${BE}${ep.path}`)
        pass(ep.name, res.ok && ep.check(json), `http=${res.status}`)
      } catch (e) {
        pass(ep.name, false, e instanceof Error ? e.message : String(e))
      }
    }

    try {
      const { res, json } = await httpJson(`${BE}/api/lots/${MOCK}`)
      const lot = (json as { lot?: { lotId?: string } }).lot
      pass('api.lots.detail', res.ok && lot?.lotId === MOCK, `http=${res.status}`)
    } catch (e) {
      pass('api.lots.detail', false, e instanceof Error ? e.message : String(e))
    }

    try {
      const list = await httpJson(`${BE}/api/issues?limit=1`)
      const issueId = (list.json as { issues?: Array<{ issueId: string }> }).issues?.[0]
        ?.issueId
      if (!issueId) {
        skip('api.issues.detail', 'no open issues')
      } else {
        const { res, json } = await httpJson(`${BE}/api/issues/${issueId}`)
        const issue = (json as { issue?: { analysis?: { scoredAt?: unknown } } }).issue
        pass(
          'api.issues.detail',
          res.ok && issue != null,
          `scoredAt=${issue?.analysis?.scoredAt != null ? 'yes' : 'no'}`,
        )
      }
    } catch (e) {
      pass('api.issues.detail', false, e instanceof Error ? e.message : String(e))
    }

    // scenario-smoke §6 control bounds API (Setting UI removed — API still required)
    try {
      const { res, json } = await httpJson(`${BE}/api/settings/control-bounds`)
      const bounds = (json as { bounds?: { sintering_temp?: unknown } }).bounds
      pass(
        'api.settings.control-bounds',
        res.ok && bounds?.sintering_temp != null,
        `http=${res.status}`,
      )
    } catch (e) {
      pass('api.settings.control-bounds', false, e instanceof Error ? e.message : String(e))
    }
  }

  // exports still present after orphan cleanup
  pass('export.getQCostSummary', typeof lotService.getQCostSummary === 'function')
  pass(
    'export.refreshSpcAndRiskScores',
    typeof lotService.refreshSpcAndRiskScores === 'function',
  )

  // scenario checklist — browser / JWT only
  skip('scenario.main_lot_to_chat', 'browser manual (SelectedLot wiring removed)')
  skip('scenario.setting_bounds_ui', 'Setting UI removed; API checked above')
  skip('scenario.approve_undo_ui', 'browser + JWT')

  await cleanup()

  const failed = rows.filter((r) => !r.ok && !r.skip)
  const skipped = rows.filter((r) => r.skip)
  console.log('RESULT', failed.length === 0 ? 'ALL_OK' : 'FAILED')
  console.log(
    'FAILED_LIST',
    failed.map((r) => r.name).join(',') || '(none)',
  )
  console.log(
    'SKIP_LIST',
    skipped.map((r) => r.name).join(',') || '(none)',
  )
  process.exit(failed.length === 0 ? 0 : 1)
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
