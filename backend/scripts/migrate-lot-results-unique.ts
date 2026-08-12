/**
 * Dedupe lot_results by lot_id (keep MIN(seq)), then add UNIQUE(lot_id).
 *   npx tsx scripts/migrate-lot-results-unique.ts
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

async function main() {
  const dupes = await query<Array<{ lot_id: string; c: number }>>(
    `SELECT lot_id, COUNT(*) AS c FROM lot_results GROUP BY lot_id HAVING COUNT(*) > 1 LIMIT 20`,
  )
  console.log('DUPES_SAMPLE', dupes.length, dupes.slice(0, 5))

  await query(
    `DELETE lr FROM lot_results lr
     INNER JOIN (
       SELECT lot_id, MIN(seq) AS keep_seq
       FROM lot_results
       GROUP BY lot_id
       HAVING COUNT(*) > 1
     ) d ON lr.lot_id = d.lot_id AND lr.seq <> d.keep_seq`,
  )
  console.log('DEDUPE_DONE')

  const idx = await query<Array<{ Key_name: string }>>(
    `SHOW INDEX FROM lot_results WHERE Key_name = 'uq_lot_results_lot_id'`,
  )
  if (idx.length === 0) {
    await query(`ALTER TABLE lot_results ADD UNIQUE KEY uq_lot_results_lot_id (lot_id)`)
    console.log('ADDED_UNIQUE')
  } else {
    console.log('UNIQUE_EXISTS')
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
