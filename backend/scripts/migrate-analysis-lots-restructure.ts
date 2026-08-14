/**
 * Apply analysis_lots restructure to match DB/schema.sql.
 * Preserves existing rows. Handles both defect_prob+probability present.
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

async function columnNames(): Promise<Set<string>> {
  const rows = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ANALYSIS_LOTS'`,
  )
  return new Set(rows.map((r) => r.COLUMN_NAME))
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await query<{ INDEX_NAME: string }[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ANALYSIS_LOTS' AND INDEX_NAME = ?
     LIMIT 1`,
    [name],
  )
  return rows.length > 0
}

async function main() {
  let cols = await columnNames()
  const countBefore = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM ANALYSIS_LOTS`)
  console.log('BEFORE_COLS', [...cols].sort().join(', '))
  console.log('BEFORE_ROWS', Number(countBefore[0]?.c ?? 0))

  if (cols.has('defect_prob') && cols.has('probability')) {
    await query(
      `UPDATE ANALYSIS_LOTS
       SET probability = COALESCE(probability, defect_prob)
       WHERE probability IS NULL AND defect_prob IS NOT NULL`,
    )
    await query('ALTER TABLE ANALYSIS_LOTS DROP COLUMN defect_prob')
    console.log('MERGED defect_prob → probability, DROPPED defect_prob')
  } else if (cols.has('defect_prob') && !cols.has('probability')) {
    await query(`ALTER TABLE ANALYSIS_LOTS CHANGE COLUMN defect_prob probability DOUBLE NULL`)
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
    'updated_at',
    'defect_prob',
  ]) {
    const now = await columnNames()
    if (now.has(col)) {
      await query(`ALTER TABLE ANALYSIS_LOTS DROP COLUMN \`${col}\``)
      console.log('DROPPED', col)
    } else {
      console.log('SKIP_DROP', col)
    }
  }

  cols = await columnNames()
  if (!cols.has('scored_at')) {
    await query(
      `ALTER TABLE ANALYSIS_LOTS
       ADD COLUMN scored_at DATETIME NULL COMMENT '마지막 채점 시각' AFTER created_at`,
    )
    await query(
      `UPDATE ANALYSIS_LOTS
       SET scored_at = COALESCE(scored_at, created_at)
       WHERE scored_at IS NULL`,
    )
    console.log('ADDED scored_at')
  } else {
    console.log('SKIP_ADD scored_at')
  }

  if (!(await indexExists('idx_analysis_scored'))) {
    await query('ALTER TABLE ANALYSIS_LOTS ADD INDEX idx_analysis_scored (scored_at)')
    console.log('ADDED_INDEX idx_analysis_scored')
  } else {
    console.log('SKIP_INDEX idx_analysis_scored')
  }

  const after = await columnNames()
  const countAfter = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM ANALYSIS_LOTS`)
  console.log('AFTER_COLS', [...after].sort().join(', '))
  console.log('AFTER_ROWS', Number(countAfter[0]?.c ?? 0))

  const expected = ['lot_id', 'probability', 'spc_status', 'risk_level', 'risk_reason', 'created_at']
  const optional = ['spc_chart_json']
  const missing = expected.filter((c) => !after.has(c))
  const unexpected = [...after].filter((c) => !expected.includes(c) && !optional.includes(c))
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
