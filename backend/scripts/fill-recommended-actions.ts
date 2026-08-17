/**
 * Backfill lot_recommended_actions for scored LOTs.
 * Usage: npm run fill:recommended-actions [-- LOT-001 LOT-002]
 *        npm run fill:recommended-actions -- --limit=20
 *        npm run fill:recommended-actions -- --summary-only
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import {
  buildRuleSummary,
  fillRecommendedActionsForLots,
} from '../src/services/lotRecommendedAction.service.js'

async function rewriteSummariesFromStoredDrivers(): Promise<number> {
  const rows = await query<
    {
      lot_id: string
      drivers_json: Record<string, unknown> | null
      probability: number | null
      residual_li: number | null
      risk_level: string | null
    }[]
  >(
    `SELECT r.lot_id, r.drivers_json, a.probability, a.risk_level, j.residual_li
     FROM LOT_RECOMMENDED_ACTIONS r
     LEFT JOIN ANALYSIS_LOTS a ON a.lot_id = r.lot_id
     LEFT JOIN JUDGMENT_LOTS j ON j.lot_id = r.lot_id
     WHERE r.lot_id <> 'LOT-SYS-HANDOVER'`,
  )
  let updated = 0
  for (const row of rows) {
    const summary = buildRuleSummary(
      row.drivers_json && typeof row.drivers_json === 'object' ? row.drivers_json : {},
      {
        probability: row.probability,
        residualLi: row.residual_li,
        riskLevel: row.risk_level,
      },
    )
    await query(`UPDATE LOT_RECOMMENDED_ACTIONS SET summary = ? WHERE lot_id = ?`, [
      summary.slice(0, 1024),
      row.lot_id,
    ])
    updated++
  }
  return updated
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const forceFlag = process.argv.includes('--force')
  const summaryOnly = process.argv.includes('--summary-only')
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined
  const lotIds = process.argv.slice(2).filter((a) => !a.startsWith('--'))

  if (summaryOnly) {
    const started = Date.now()
    const updated = await rewriteSummariesFromStoredDrivers()
    console.log('DONE', JSON.stringify({ updated, mode: 'summary-only' }), `elapsed_ms=${Date.now() - started}`)
    process.exit(0)
  }

  let ids = lotIds.length > 0 ? lotIds : undefined
  if (ids == null && limit != null && Number.isFinite(limit) && limit > 0) {
    const rows = await query<{ lot_id: string }[]>(
      `SELECT lot_id FROM ANALYSIS_LOTS
       WHERE lot_id <> 'LOT-SYS-HANDOVER'
       ORDER BY lot_id DESC
       LIMIT ?`,
      [limit],
    )
    ids = rows.map((r) => r.lot_id)
    console.log('LIMIT_IDS', ids.length)
  }

  const started = Date.now()
  const result = await fillRecommendedActionsForLots(ids, {
    concurrency: 2,
    force: forceFlag || lotIds.length > 0,
  })
  console.log('DONE', JSON.stringify(result), `elapsed_ms=${Date.now() - started}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
