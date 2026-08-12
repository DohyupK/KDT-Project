/**
 * Drop analysis_lots.defect_prob only (keep other legacy cols).
 * Merges NULL probability from defect_prob first.
 * Usage: npm run migrate:analysis-drop-defect-prob
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

async function columnNames(): Promise<Set<string>> {
  const rows = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'analysis_lots'`,
  )
  return new Set(rows.map((r) => r.COLUMN_NAME))
}

async function main() {
  const before = await columnNames()
  console.log('BEFORE_COLS', [...before].sort().join(', '))
  if (!before.has('defect_prob')) {
    console.log('SKIP defect_prob already absent')
    return
  }
  if (!before.has('probability')) {
    throw new Error('analysis_lots.probability missing — cannot drop defect_prob safely')
  }

  const merged = await query<{ affectedRows?: number }>(
    `UPDATE analysis_lots
     SET probability = COALESCE(probability, defect_prob)
     WHERE probability IS NULL AND defect_prob IS NOT NULL`,
  )
  console.log('MERGED_NULL_PROBABILITY', merged)

  await query('ALTER TABLE analysis_lots DROP COLUMN defect_prob')
  console.log('DROPPED defect_prob')

  const after = await columnNames()
  console.log('AFTER_COLS', [...after].sort().join(', '))
  if (after.has('defect_prob')) {
    throw new Error('defect_prob still present after DROP')
  }
  const rows = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM analysis_lots`)
  console.log('ROWS', Number(rows[0]?.c ?? 0))
  console.log('OK analysis_lots.defect_prob removed')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
