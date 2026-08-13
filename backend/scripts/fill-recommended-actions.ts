/**
 * Backfill lot_recommended_actions for scored LOTs.
 * Usage: npm run fill:recommended-actions [-- LOT-001 LOT-002]
 *        npm run fill:recommended-actions -- --limit=20
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import { fillRecommendedActionsForLots } from '../src/services/lotRecommendedAction.service.js'

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const forceFlag = process.argv.includes('--force')
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined
  const lotIds = process.argv.slice(2).filter((a) => !a.startsWith('--'))

  let ids = lotIds.length > 0 ? lotIds : undefined
  if (ids == null && limit != null && Number.isFinite(limit) && limit > 0) {
    const rows = await query<{ lot_id: string }[]>(
      `SELECT lot_id FROM analysis_lots
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
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
