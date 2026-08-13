import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import { pickUnscoredLotIds } from '../src/services/unscoredLots.js'
import fs from 'node:fs'
import path from 'node:path'

async function main() {
  const counts = await query<
    Array<Record<string, number | string>>
  >(
    `SELECT
      (SELECT COUNT(*) FROM lots WHERE id <> 'LOT-SYS-HANDOVER') AS lots,
      (SELECT COUNT(*) FROM judgment_lots) AS judgment,
      (SELECT COUNT(*) FROM lot_results) AS lot_results,
      (SELECT COUNT(*) FROM analysis_lots) AS analysis,
      (SELECT COUNT(*) FROM analysis_lots WHERE scored_at IS NULL) AS scored_at_null,
      (SELECT COUNT(*) FROM lots l LEFT JOIN judgment_lots j ON j.lot_id=l.id
        WHERE l.id<>'LOT-SYS-HANDOVER' AND j.lot_id IS NULL) AS miss_judgment,
      (SELECT COUNT(*) FROM lots l LEFT JOIN lot_results lr ON lr.lot_id=l.id
        WHERE l.id<>'LOT-SYS-HANDOVER' AND lr.lot_id IS NULL) AS miss_lr,
      (SELECT COUNT(*) FROM lot_results WHERE residual_li IS NULL) AS lr_residual_null,
      (SELECT COUNT(*) FROM lot_results WHERE quality_defect IS NULL) AS lr_qd_null`,
  )
  console.log('COUNTS', counts[0])

  const newest = await query(
    `SELECT l.id,
      (j.lot_id IS NOT NULL) AS has_j,
      (lr.lot_id IS NOT NULL) AS has_lr,
      lr.residual_li AS residual,
      lr.quality_defect AS qd,
      a.scored_at IS NOT NULL AS has_scored_at
     FROM lots l
     LEFT JOIN judgment_lots j ON j.lot_id=l.id
     LEFT JOIN lot_results lr ON lr.lot_id=l.id
     LEFT JOIN analysis_lots a ON a.lot_id=l.id
     WHERE l.id <> 'LOT-SYS-HANDOVER'
     ORDER BY l.\`timestamp\` DESC, l.id DESC
     LIMIT 8`,
  )
  console.log('NEWEST', newest)

  const pick = await pickUnscoredLotIds(15)
  console.log('PICK_REASON', pick.reason)
  console.log('PICK_SAMPLE', pick.lotIds.slice(0, 8))

  const uniq = await query(
    `SHOW INDEX FROM lot_results WHERE Key_name='uq_lot_results_lot_id'`,
  )
  console.log('UNIQUE_LR', uniq.length > 0)

  const feeder = fs.readFileSync(
    path.resolve('../frontend/plant_feeder_live.py'),
    'utf8',
  )
  console.log('FEEDER_STUB', feeder.includes('Immediate lot_results stub'))
  console.log('FEEDER_DELIVER_BY_LOT_ID', /UPDATE \{T_RES\} SET residual_li = \{PH\}.*WHERE lot_id/.test(feeder) || feeder.includes('WHERE lot_id ='))
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
