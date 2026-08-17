/**
 * ADD judgment_lots.probability + backfill from analysis_lots.probability.
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

async function main() {
  await query(
    `ALTER TABLE JUDGMENT_LOTS
     ADD COLUMN IF NOT EXISTS probability DOUBLE NULL`,
  )
  console.log('COLUMN_OK probability')

  const res = await query<unknown>(
    `UPDATE JUDGMENT_LOTS j
     INNER JOIN ANALYSIS_LOTS a ON a.lot_id = j.lot_id
     SET j.probability = a.probability
     WHERE j.probability IS NULL AND a.probability IS NOT NULL`,
  )
  const affected =
    res && typeof res === 'object' && 'affectedRows' in res
      ? Number((res as { affectedRows: number }).affectedRows)
      : res
  console.log('BACKFILL', { affectedRows: affected })

  const sample = await query<
    { lot_id: string; probability: number | null; residual_li: number | null }[]
  >(
    `SELECT lot_id, probability, residual_li FROM JUDGMENT_LOTS
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
