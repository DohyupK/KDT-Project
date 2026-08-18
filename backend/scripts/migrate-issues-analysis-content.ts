/**
 * ISSUES.analysis_content + drop AI_LIBRARY_ANALYSIS.lot_id.
 * Live DDL: DB/alter_issues_analysis_content.sql
 */
import '../src/loadRootEnv.js'
import { mariaDbPoolOptions } from '../src/db/config.js'
import { query } from '../src/db/connection.js'

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}

async function constraintExists(
  table: string,
  name: string,
  type: string,
): Promise<boolean> {
  const rows = await query<{ CONSTRAINT_NAME: string }[]>(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       AND CONSTRAINT_TYPE = ? AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [table, type, name],
  )
  return rows.length > 0
}

async function indexExists(table: string, name: string): Promise<boolean> {
  const rows = await query<{ INDEX_NAME: string }[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [table, name],
  )
  return rows.length > 0
}

async function main() {
  const opts = mariaDbPoolOptions()
  console.log(`TARGET ${opts.host}:${opts.port}/${opts.database} (user=${opts.user})`)

  if (!(await columnExists('ISSUES', 'analysis_content'))) {
    await query(
      `ALTER TABLE ISSUES
         ADD COLUMN analysis_content TEXT NULL COMMENT 'API_LLM diagnosis after completed_at'`,
    )
    console.log('ADDED ISSUES.analysis_content')
  } else {
    console.log('SKIP ISSUES.analysis_content')
  }

  if (await columnExists('AI_LIBRARY_ANALYSIS', 'lot_id')) {
    const del = (await query<{ affectedRows?: number }>(
      `DELETE FROM AI_LIBRARY_ANALYSIS WHERE lot_id IS NOT NULL`,
    )) as { affectedRows?: number }
    console.log('DELETED lot_id rows', del?.affectedRows ?? '?')

    if (await constraintExists('AI_LIBRARY_ANALYSIS', 'chk_ai_library_analysis_owner', 'CHECK')) {
      await query(
        `ALTER TABLE AI_LIBRARY_ANALYSIS DROP CONSTRAINT chk_ai_library_analysis_owner`,
      )
      console.log('DROPPED CHECK')
    }
    if (await constraintExists('AI_LIBRARY_ANALYSIS', 'fk_ai_library_analysis_lot', 'FOREIGN KEY')) {
      await query(
        `ALTER TABLE AI_LIBRARY_ANALYSIS DROP FOREIGN KEY fk_ai_library_analysis_lot`,
      )
      console.log('DROPPED_FK lot')
    }
    if (await indexExists('AI_LIBRARY_ANALYSIS', 'uq_ai_library_analysis_lot')) {
      await query(`ALTER TABLE AI_LIBRARY_ANALYSIS DROP INDEX uq_ai_library_analysis_lot`)
      console.log('DROPPED UNIQUE lot')
    }
    await query(`ALTER TABLE AI_LIBRARY_ANALYSIS DROP COLUMN lot_id`)
    console.log('DROPPED lot_id')
  } else {
    console.log('SKIP drop lot_id')
  }

  await query(
    `ALTER TABLE AI_LIBRARY_ANALYSIS
       MODIFY COLUMN user_id VARCHAR(50) NOT NULL,
       MODIFY COLUMN name VARCHAR(50) NOT NULL`,
  )
  console.log('MODIFIED user_id/name NOT NULL')
  console.log('OK ISSUES.analysis_content')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
