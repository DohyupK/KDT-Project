/**
 * Drop handover_history: lot_id, risk_level, cause, manager (+ FK/index).
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

const EXPECTED = [
  'history_id',
  'handover_content',
  'action',
  'handover_from',
  'handover_to',
  'assignee_user_id',
  'category',
  'created_at',
  'archived_at',
] as const

async function colsOrdered(): Promise<string[]> {
  const rows = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'HANDOVER_HISTORY'
     ORDER BY ORDINAL_POSITION`,
  )
  return rows.map((r) => r.COLUMN_NAME)
}

async function fkExists(name: string): Promise<boolean> {
  const rows = await query<{ CONSTRAINT_NAME: string }[]>(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'HANDOVER_HISTORY'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [name],
  )
  return rows.length > 0
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await query<{ INDEX_NAME: string }[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'HANDOVER_HISTORY' AND INDEX_NAME = ?
     LIMIT 1`,
    [name],
  )
  return rows.length > 0
}

async function main() {
  console.log('BEFORE', (await colsOrdered()).join(', '))

  if (await fkExists('fk_handover_lot')) {
    await query('ALTER TABLE HANDOVER_HISTORY DROP FOREIGN KEY fk_handover_lot')
    console.log('DROPPED_FK fk_handover_lot')
  }

  if (await indexExists('idx_handover_lot')) {
    await query('ALTER TABLE HANDOVER_HISTORY DROP INDEX idx_handover_lot')
    console.log('DROPPED_INDEX idx_handover_lot')
  }

  for (const col of ['lot_id', 'risk_level', 'cause', 'manager'] as const) {
    const set = new Set(await colsOrdered())
    if (set.has(col)) {
      await query(`ALTER TABLE HANDOVER_HISTORY DROP COLUMN \`${col}\``)
      console.log('DROPPED', col)
    } else {
      console.log('SKIP', col)
    }
  }

  const after = await colsOrdered()
  const set = new Set(after)
  const missing = EXPECTED.filter((c) => !set.has(c))
  const unexpected = after.filter((c) => !(EXPECTED as readonly string[]).includes(c))
  console.log('AFTER', after.join(', '))
  console.log('PLAN_MATCH', missing.length === 0 && unexpected.length === 0)
  if (missing.length || unexpected.length) {
    throw new Error(
      `mismatch missing=${missing.join('|')} unexpected=${unexpected.join('|')}`,
    )
  }
  console.log('OK handover legacy cols dropped')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
