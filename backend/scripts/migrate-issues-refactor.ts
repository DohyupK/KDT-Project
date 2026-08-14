/**
 * Priority 1: DELETE all rows from issues.
 * Then align schema: DROP status/risk_level, rename title→issue_content,
 * occurred_at→created_at (rightmost).
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

async function columnNames(): Promise<Set<string>> {
  const rows = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'issues'`,
  )
  return new Set(rows.map((r) => r.COLUMN_NAME))
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await query<{ INDEX_NAME: string }[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'issues' AND INDEX_NAME = ?
     LIMIT 1`,
    [name],
  )
  return rows.length > 0
}

async function main() {
  const beforeCount = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM issues`)
  const n = Number(beforeCount[0]?.c ?? 0)
  console.log('BEFORE_ROWS', n)

  // 1순위: 전량 삭제
  await query(`DELETE FROM issues`)
  const afterDelete = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM issues`)
  console.log('AFTER_DELETE_ROWS', Number(afterDelete[0]?.c ?? 0))

  let cols = await columnNames()
  console.log('BEFORE_COLS', [...cols].sort().join(', '))

  if (await indexExists('idx_issues_status')) {
    await query('ALTER TABLE issues DROP INDEX idx_issues_status')
    console.log('DROPPED_INDEX idx_issues_status')
  }
  if (await indexExists('idx_issues_risk')) {
    await query('ALTER TABLE issues DROP INDEX idx_issues_risk')
    console.log('DROPPED_INDEX idx_issues_risk')
  }
  if (await indexExists('idx_issues_occurred')) {
    await query('ALTER TABLE issues DROP INDEX idx_issues_occurred')
    console.log('DROPPED_INDEX idx_issues_occurred')
  }

  cols = await columnNames()
  if (cols.has('status')) {
    await query('ALTER TABLE issues DROP COLUMN status')
    console.log('DROPPED status')
  }
  cols = await columnNames()
  if (cols.has('risk_level')) {
    await query('ALTER TABLE issues DROP COLUMN risk_level')
    console.log('DROPPED risk_level')
  }

  cols = await columnNames()
  if (cols.has('title') && !cols.has('issue_content')) {
    await query(
      `ALTER TABLE issues CHANGE COLUMN title issue_content VARCHAR(255) NOT NULL COMMENT '이슈 내용'`,
    )
    console.log('RENAMED title → issue_content')
  } else if (cols.has('issue_content')) {
    console.log('SKIP_RENAME issue_content already present')
  }

  cols = await columnNames()
  if (cols.has('occurred_at') && !cols.has('created_at')) {
    await query(
      `ALTER TABLE issues CHANGE COLUMN occurred_at created_at DATETIME NOT NULL COMMENT '등록 시각'`,
    )
    console.log('RENAMED occurred_at → created_at')
  } else if (cols.has('created_at')) {
    console.log('SKIP_RENAME created_at already present')
  }

  // created_at 최우측
  cols = await columnNames()
  if (cols.has('created_at') && cols.has('completed_at')) {
    await query(
      `ALTER TABLE issues MODIFY COLUMN created_at DATETIME NOT NULL COMMENT '등록 시각' AFTER completed_at`,
    )
    console.log('MOVED created_at AFTER completed_at')
  }

  if (!(await indexExists('idx_issues_created'))) {
    await query('ALTER TABLE issues ADD INDEX idx_issues_created (created_at)')
    console.log('ADDED_INDEX idx_issues_created')
  }

  const after = await columnNames()
  const countAfter = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM issues`)
  console.log('AFTER_COLS', [...after].sort().join(', '))
  console.log('AFTER_ROWS', Number(countAfter[0]?.c ?? 0))

  const expected = [
    'issue_id',
    'lot_id',
    'issue_content',
    'action_content',
    'assignee_user_id',
    'completed_at',
    'created_at',
  ]
  const missing = expected.filter((c) => !after.has(c))
  const unexpected = [...after].filter((c) => !expected.includes(c))
  if (missing.length || unexpected.length) {
    throw new Error(
      `Schema mismatch missing=${missing.join('|')} unexpected=${unexpected.join('|')}`,
    )
  }
  console.log('OK issues refactor complete (table emptied)')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
