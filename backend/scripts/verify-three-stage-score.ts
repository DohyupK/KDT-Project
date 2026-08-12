/**
 * One-lot check: lot_results fill → judgment qd/residual → analysis scored_at.
 * Usage: npx tsx scripts/verify-three-stage-score.ts [--lot=LOT-...]
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import * as lotService from '../src/services/lot.service.js'

async function pickLotId(explicit?: string): Promise<string> {
  if (explicit) return explicit
  const rows = await query<Array<{ id: string }>>(
    `SELECT l.id
     FROM lots l
     LEFT JOIN lot_results lr ON lr.lot_id = l.id
     WHERE l.id <> 'LOT-SYS-HANDOVER'
       AND (
         lr.lot_id IS NULL
         OR lr.residual_li IS NULL
         OR lr.quality_defect IS NULL
       )
     ORDER BY l.\`timestamp\` DESC, l.id DESC
     LIMIT 1`,
  )
  if (!rows[0]) {
    const latest = await lotService.getLatestLotIds(1)
    if (!latest[0]) throw new Error('no lots available')
    return latest[0]
  }
  return rows[0].id
}

async function snapshot(lotId: string) {
  const lr = await query<
    Array<{ quality_defect: number | null; residual_li: number | null }>
  >(
    `SELECT quality_defect, residual_li FROM lot_results WHERE lot_id = ? LIMIT 1`,
    [lotId],
  )
  const j = await query<
    Array<{
      quality_defect: number | null
      residual_li: number | null
      capacity: number | null
      probability: number | null
    }>
  >(
    `SELECT quality_defect, residual_li, capacity, probability
     FROM judgment_lots WHERE lot_id = ? LIMIT 1`,
    [lotId],
  )
  const a = await query<
    Array<{
      probability: number | null
      risk_level: string | null
      scored_at: Date | string | null
    }>
  >(
    `SELECT probability, risk_level, scored_at FROM analysis_lots WHERE lot_id = ? LIMIT 1`,
    [lotId],
  )
  return { lr: lr[0] ?? null, j: j[0] ?? null, a: a[0] ?? null }
}

async function main() {
  const lotArg = process.argv.find((a) => a.startsWith('--lot='))
  const lotId = await pickLotId(lotArg?.split('=')[1])
  const before = await snapshot(lotId)
  console.log('VERIFY_LOT', lotId)
  console.log('BEFORE', JSON.stringify(before))

  const result = await lotService.scoreAllLots({
    lotIds: [lotId],
    concurrency: 1,
  })
  console.log('SCORE', JSON.stringify(result))

  const after = await snapshot(lotId)
  console.log('AFTER', JSON.stringify(after))

  const okLr =
    after.lr != null &&
    after.lr.quality_defect != null &&
    after.lr.residual_li != null
  const okJ =
    after.j != null &&
    after.j.quality_defect != null &&
    after.j.residual_li != null &&
    after.j.probability != null
  const okA = after.a != null && after.a.scored_at != null
  const feederPreserved =
    before.lr?.residual_li != null
      ? Number(before.lr.residual_li) === Number(after.lr?.residual_li)
      : true

  console.log('CHECKS', {
    lot_results_filled: okLr,
    judgment_from_lr: okJ,
    analysis_scored_at: okA,
    feeder_residual_preserved: feederPreserved,
  })
  if (!okLr || !okJ || !okA || !feederPreserved || result.failed > 0) {
    process.exitCode = 1
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
