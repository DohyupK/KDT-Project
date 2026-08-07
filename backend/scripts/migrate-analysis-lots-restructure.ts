/**
 * Apply analysis_lots restructure to match DB/schema.sql.
 * Preserves existing rows. Handles both defect_prob+probability present.
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

async function indexExists(name: string): Promise<boolean> {
  const rows = await query<{ INDEX_NAME: string }[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'analysis_lots' AND INDEX_NAME = ?
     LIMIT 1`,
    [name],
  )
  return rows.length > 0
}

async function main() {
  let cols = await columnNames()
  const countBefore = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM analysis_lots`)
  console.log('BEFORE_COLS', [...cols].sort().join(', '))
  console.log('BEFORE_ROWS', Number(countBefore[0]?.c ?? 0))

  if (cols.has('defect_prob') && cols.has('probability')) {
    await query(
      `UPDATE analysis_lots
       SET probability = COALESCE(probability, defect_prob)
       WHERE probability IS NULL AND defect_prob IS NOT NULL`,
    )
    await query('ALTER TABLE analysis_lots DROP COLUMN defect_prob')
    console.log('MERGED defect_prob → probability, DROPPED defect_prob')
  } else if (cols.has('defect_prob') && !cols.has('probability')) {
    await query(`ALTER TABLE analysis_lots CHANGE COLUMN defect_prob probability DOUBLE NULL`)
    console.log('RENAMED defect_prob → probability')
  } else if (cols.has('probability')) {
    console.log('SKIP_RENAME probability already present')
  } else {
    throw new Error('Neither defect_prob nor probability found on analysis_lots')
  }

  for (const col of [
    'clf_model_version',
    'residual_model_version',
    'spc_limit_version',
    'scored_at',
    'updated_at',
    'defect_prob',
    'spc_chart_json', // not in schema.sql — drop if present
  ]) {
    const now = await columnNames()
    if (now.has(col)) {
      await query(`ALTER TABLE analysis_lots DROP COLUMN \`${col}\``)
      console.log('DROPPED', col)
    } else {
      console.log('SKIP_DROP', col)
    }
  }

  if (await indexExists('idx_analysis_scored')) {
    await query('ALTER TABLE analysis_lots DROP INDEX idx_analysis_scored')
    console.log('DROPPED_INDEX idx_analysis_scored')
  } else {
    console.log('SKIP_INDEX idx_analysis_scored')
  }

  const after = await columnNames()
  const countAfter = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM analysis_lots`)
  console.log('AFTER_COLS', [...after].sort().join(', '))
  console.log('AFTER_ROWS', Number(countAfter[0]?.c ?? 0))

  const expected = ['lot_id', 'probability', 'spc_status', 'risk_level', 'risk_reason', 'created_at']
  const missing = expected.filter((c) => !after.has(c))
  const unexpected = [...after].filter((c) => !expected.includes(c))
  if (missing.length || unexpected.length) {
    throw new Error(
      `Schema mismatch missing=${missing.join('|')} unexpected=${unexpected.join('|')}`,
    )
  }
  console.log('OK analysis_lots restructure complete (rows preserved)')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
