/**
 * Backfill scored_at + score newest lots missing judgment / lot_results / residual.
 *
 *   npx tsx scripts/backfill-judgment-lr-scored.ts
 *   npx tsx scripts/backfill-judgment-lr-scored.ts --limit=50
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import * as lotService from '../src/services/lot.service.js'
import { pickUnscoredLotIds } from '../src/services/unscoredLots.js'

async function backfillScoredAt(): Promise<number> {
  await query(
    `UPDATE analysis_lots
     SET scored_at = COALESCE(scored_at, created_at, NOW())
     WHERE scored_at IS NULL
       AND (probability IS NOT NULL OR spc_status IS NOT NULL OR risk_reason IS NOT NULL)`,
  )
  const after = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM analysis_lots WHERE scored_at IS NULL`,
  )
  return Number(after[0]?.c ?? 0)
}

async function snapshot() {
  const rows = await query<
    Array<{
      miss_j: number
      miss_lr: number
      miss_lr_res: number
      miss_scored: number
    }>
  >(
    `SELECT
       SUM(j.lot_id IS NULL) AS miss_j,
       SUM(lr.lot_id IS NULL) AS miss_lr,
       SUM(lr.lot_id IS NOT NULL AND lr.residual_li IS NULL) AS miss_lr_res,
       SUM(a.lot_id IS NOT NULL AND a.scored_at IS NULL) AS miss_scored
     FROM lots l
     LEFT JOIN judgment_lots j ON j.lot_id = l.id
     LEFT JOIN lot_results lr ON lr.lot_id = l.id
     LEFT JOIN analysis_lots a ON a.lot_id = l.id
     WHERE l.id <> 'LOT-SYS-HANDOVER'`,
  )
  return rows[0]
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 40

  console.log('BEFORE', await snapshot())
  const remainingNullScored = await backfillScoredAt()
  console.log('SCORED_AT_BACKFILL remaining_null=', remainingNullScored)

  const picked = await pickUnscoredLotIds(Number.isFinite(limit) ? limit : 40)
  console.log('PICK', { count: picked.lotIds.length, reason: picked.reason, sample: picked.lotIds.slice(0, 5) })

  if (picked.lotIds.length === 0) {
    console.log('AFTER', await snapshot())
    return
  }

  const result = await lotService.scoreAllLots({
    lotIds: picked.lotIds,
    concurrency: 4,
  })
  console.log('SCORE', JSON.stringify(result))
  console.log('AFTER', await snapshot())

  // Spot-check newest scored ids
  for (const id of picked.lotIds.slice(0, 3)) {
    const row = await query<
      Array<{
        j: string | null
        lr: string | null
        residual: number | null
        scored_at: Date | string | null
      }>
    >(
      `SELECT j.lot_id AS j, lr.lot_id AS lr, lr.residual_li AS residual, a.scored_at
       FROM lots l
       LEFT JOIN judgment_lots j ON j.lot_id = l.id
       LEFT JOIN lot_results lr ON lr.lot_id = l.id
       LEFT JOIN analysis_lots a ON a.lot_id = l.id
       WHERE l.id = ?`,
      [id],
    )
    console.log('CHECK', id, row[0])
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
