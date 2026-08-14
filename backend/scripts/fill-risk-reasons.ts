/**
 * Fill risk_reason via local vLLM for existing analysis_lots (no truncate/rescore).
 * Usage: npx tsx scripts/fill-risk-reasons.ts [--limit=N]
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import { fillRiskReasonsForLots } from '../src/services/lotRiskReason.service.js'

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined

  let lotIds: string[] | undefined
  if (limit != null && Number.isFinite(limit) && limit > 0) {
    const rows = await query<{ lot_id: string }[]>(
      `SELECT lot_id FROM ANALYSIS_LOTS
       WHERE lot_id <> 'LOT-SYS-HANDOVER'
       ORDER BY lot_id ASC
       LIMIT ?`,
      [limit],
    )
    lotIds = rows.map((r) => r.lot_id)
    console.log('LIMIT_IDS', lotIds.length)
  }

  const started = Date.now()
  const result = await fillRiskReasonsForLots(lotIds, { concurrency: 2 })
  console.log('DONE', JSON.stringify(result), `elapsed_ms=${Date.now() - started}`)

  const sample = await query(
    `SELECT lot_id, risk_level, spc_status, risk_reason
     FROM ANALYSIS_LOTS ORDER BY lot_id DESC LIMIT 5`,
  )
  console.log('SAMPLE', JSON.stringify(sample, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
