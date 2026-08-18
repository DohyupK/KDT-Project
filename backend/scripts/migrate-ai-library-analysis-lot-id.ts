/**
 * AI_LIBRARY_ANALYSIS: nullable user_id/name + lot_id XOR UNIQUE.
 * Live DDL: DB/alter_ai_library_analysis_lot_id.sql
 */
import '../src/loadRootEnv.js'
import { mariaDbPoolOptions } from '../src/db/config.js'
import { query } from '../src/db/connection.js'

const TABLE = 'AI_LIBRARY_ANALYSIS'

async function columnInfo(): Promise<{ COLUMN_NAME: string; IS_NULLABLE: string }[]> {
  return query<{ COLUMN_NAME: string; IS_NULLABLE: string }[]>(
    `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [TABLE],
  )
}

async function constraintExists(name: string, type: string): Promise<boolean> {
  const rows = await query<{ CONSTRAINT_NAME: string }[]>(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       AND CONSTRAINT_TYPE = ? AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [TABLE, type, name],
  )
  return rows.length > 0
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await query<{ INDEX_NAME: string }[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [TABLE, name],
  )
  return rows.length > 0
}

async function main() {
  const opts = mariaDbPoolOptions()
  console.log(`TARGET ${opts.host}:${opts.port}/${opts.database} (user=${opts.user})`)

  const before = await columnInfo()
  if (!before.length) {
    throw new Error(`${TABLE} not found in ${opts.database}`)
  }
  console.log(
    'BEFORE',
    before.map((c) => `${c.COLUMN_NAME}:${c.IS_NULLABLE}`).join(', '),
  )

  if (await constraintExists('fk_ai_library_analysis_user', 'FOREIGN KEY')) {
    await query(`ALTER TABLE ${TABLE} DROP FOREIGN KEY fk_ai_library_analysis_user`)
    console.log('DROPPED_FK fk_ai_library_analysis_user')
  } else {
    console.log('SKIP DROP_FK fk_ai_library_analysis_user')
  }

  await query(
    `ALTER TABLE ${TABLE}
       MODIFY COLUMN user_id VARCHAR(50) NULL,
       MODIFY COLUMN name VARCHAR(50) NULL`,
  )
  console.log('MODIFIED user_id/name NULL')

  const cols = new Set((await columnInfo()).map((c) => c.COLUMN_NAME))
  if (!cols.has('lot_id')) {
    await query(
      `ALTER TABLE ${TABLE}
         ADD COLUMN lot_id VARCHAR(64) NULL COMMENT 'LOTS.id — past-issue diagnosis cache'`,
    )
    console.log('ADDED lot_id')
  } else {
    console.log('SKIP ADD lot_id')
  }

  if (!(await constraintExists('fk_ai_library_analysis_user', 'FOREIGN KEY'))) {
    await query(
      `ALTER TABLE ${TABLE}
         ADD CONSTRAINT fk_ai_library_analysis_user
           FOREIGN KEY (user_id) REFERENCES USERS(user_id)
           ON DELETE CASCADE`,
    )
    console.log('ADDED_FK fk_ai_library_analysis_user')
  } else {
    console.log('SKIP FK user')
  }

  if (!(await constraintExists('fk_ai_library_analysis_lot', 'FOREIGN KEY'))) {
    await query(
      `ALTER TABLE ${TABLE}
         ADD CONSTRAINT fk_ai_library_analysis_lot
           FOREIGN KEY (lot_id) REFERENCES LOTS(id)
           ON DELETE CASCADE`,
    )
    console.log('ADDED_FK fk_ai_library_analysis_lot')
  } else {
    console.log('SKIP FK lot')
  }

  if (!(await indexExists('uq_ai_library_analysis_lot'))) {
    await query(`ALTER TABLE ${TABLE} ADD UNIQUE KEY uq_ai_library_analysis_lot (lot_id)`)
    console.log('ADDED UNIQUE uq_ai_library_analysis_lot')
  } else {
    console.log('SKIP UNIQUE lot_id')
  }

  if (!(await constraintExists('chk_ai_library_analysis_owner', 'CHECK'))) {
    await query(
      `ALTER TABLE ${TABLE}
         ADD CONSTRAINT chk_ai_library_analysis_owner CHECK (
           (user_id IS NOT NULL AND lot_id IS NULL)
           OR (user_id IS NULL AND lot_id IS NOT NULL)
         )`,
    )
    console.log('ADDED CHECK chk_ai_library_analysis_owner')
  } else {
    console.log('SKIP CHECK')
  }

  const after = await columnInfo()
  console.log(
    'AFTER',
    after.map((c) => `${c.COLUMN_NAME}:${c.IS_NULLABLE}`).join(', '),
  )
  const lot = after.find((c) => c.COLUMN_NAME === 'lot_id')
  const user = after.find((c) => c.COLUMN_NAME === 'user_id')
  const name = after.find((c) => c.COLUMN_NAME === 'name')
  if (!lot || user?.IS_NULLABLE !== 'YES' || name?.IS_NULLABLE !== 'YES') {
    throw new Error('ALTER did not leave user_id/name nullable with lot_id')
  }
  console.log('OK AI_LIBRARY_ANALYSIS lot_id XOR')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
