/**
 * Drop handover_history.issue_id (+ fk_handover_issue / idx_handover_issue).
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

async function main() {
  console.log('BEFORE', (await colsOrdered()).join(', '))

  const fks = await query<{ CONSTRAINT_NAME: string }[]>(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'HANDOVER_HISTORY'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_handover_issue'`,
  )
  if (fks.length) {
    await query('ALTER TABLE HANDOVER_HISTORY DROP FOREIGN KEY fk_handover_issue')
    console.log('DROPPED_FK fk_handover_issue')
  }

  const idx = await query<{ INDEX_NAME: string }[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'HANDOVER_HISTORY'
       AND INDEX_NAME = 'idx_handover_issue' LIMIT 1`,
  )
  if (idx.length) {
    await query('ALTER TABLE HANDOVER_HISTORY DROP INDEX idx_handover_issue')
    console.log('DROPPED_INDEX idx_handover_issue')
  }

  const set = new Set(await colsOrdered())
  if (set.has('issue_id')) {
    await query('ALTER TABLE HANDOVER_HISTORY DROP COLUMN issue_id')
    console.log('DROPPED issue_id')
  }

  const after = await colsOrdered()
  const afterSet = new Set(after)
  const missing = EXPECTED.filter((c) => !afterSet.has(c))
  const unexpected = after.filter((c) => !(EXPECTED as readonly string[]).includes(c))
  console.log('AFTER', after.join(', '))
  console.log('PLAN_MATCH', missing.length === 0 && unexpected.length === 0)
  if (missing.length || unexpected.length) {
    throw new Error(
      `mismatch missing=${missing.join('|')} unexpected=${unexpected.join('|')}`,
    )
  }
  console.log('OK handover decoupled from issues')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
