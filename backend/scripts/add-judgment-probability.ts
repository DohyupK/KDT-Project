/**
 * ADD judgment_lots.probability + backfill from analysis_lots.defect_prob.
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

async function main() {
  await query(
    `ALTER TABLE judgment_lots
     ADD COLUMN IF NOT EXISTS probability DOUBLE NULL`,
  )
  console.log('COLUMN_OK probability')

  const res = await query<unknown>(
    `UPDATE judgment_lots j
     INNER JOIN analysis_lots a ON a.lot_id = j.lot_id
     SET j.probability = a.defect_prob
     WHERE j.probability IS NULL AND a.defect_prob IS NOT NULL`,
  )
  const affected =
    res && typeof res === 'object' && 'affectedRows' in res
      ? Number((res as { affectedRows: number }).affectedRows)
      : res
  console.log('BACKFILL', { affectedRows: affected })

  const sample = await query<
    { lot_id: string; probability: number | null; residual_li: number | null }[]
  >(
    `SELECT lot_id, probability, residual_li FROM judgment_lots
     WHERE probability IS NOT NULL
     ORDER BY lot_id DESC LIMIT 3`,
  )
  console.log('SAMPLE', sample)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
