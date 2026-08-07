/**
 * Align handover_history to DB/schema.sql:
 * - handover_content (not situation)
 * - created_at = registration, archived_at = completion (last col)
 * - no event_date / snapshot_json
 * Empty table → DROP + CREATE for exact column order.
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

const EXPECTED = [
  'history_id',
  'issue_id',
  'lot_id',
  'risk_level',
  'handover_content',
  'action',
  'cause',
  'handover_from',
  'handover_to',
  'manager',
  'assignee_user_id',
  'category',
  'created_at',
  'archived_at',
] as const

const CREATE_SQL = `
CREATE TABLE handover_history (
  history_id        BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  issue_id          VARCHAR(32)  NOT NULL,
  lot_id            VARCHAR(64)  NOT NULL,
  risk_level        VARCHAR(10)  NOT NULL,
  handover_content  VARCHAR(255) NOT NULL COMMENT '인수인계 내용(본문)',
  action            TEXT         NULL COMMENT '완료 플래그: NULL=pending, ''완료''=Knowledge 표시',
  cause             VARCHAR(255) NULL,
  handover_from     VARCHAR(50)  NULL COMMENT '인계자 ← users.name',
  handover_to       VARCHAR(50)  NULL COMMENT '인수자(선택)',
  manager           VARCHAR(50)  NULL COMMENT '호환: handover_from과 동일',
  assignee_user_id  VARCHAR(50)  NULL,
  category          VARCHAR(32)  NULL COMMENT '특이사항/전달사항/주의사항',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각',
  archived_at       DATETIME     NULL COMMENT '완료 시각 (완료 버튼 시 NOW)',
  CONSTRAINT fk_handover_issue
    FOREIGN KEY (issue_id) REFERENCES issues(issue_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_handover_lot
    FOREIGN KEY (lot_id) REFERENCES lots(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_handover_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  INDEX idx_handover_issue (issue_id),
  INDEX idx_handover_lot (lot_id),
  INDEX idx_handover_created (created_at),
  INDEX idx_handover_action (action(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`

async function columnsOrdered(): Promise<string[]> {
  const rows = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'handover_history'
     ORDER BY ORDINAL_POSITION`,
  )
  return rows.map((r) => r.COLUMN_NAME)
}

async function columnSet(): Promise<Set<string>> {
  return new Set(await columnsOrdered())
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await query<{ INDEX_NAME: string }[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'handover_history' AND INDEX_NAME = ?
     LIMIT 1`,
    [name],
  )
  return rows.length > 0
}

async function rowCount(): Promise<number> {
  const rows = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM handover_history`)
  return Number(rows[0]?.c ?? 0)
}

function assertPlanMatch(ordered: string[]) {
  const set = new Set(ordered)
  const missing = EXPECTED.filter((c) => !set.has(c))
  const unexpected = ordered.filter((c) => !(EXPECTED as readonly string[]).includes(c))
  const orderOk = ordered.join(',') === EXPECTED.join(',')
  console.log('AFTER_COLS_ORDERED', ordered.join(', '))
  console.log('MISSING', missing.join(', ') || '(none)')
  console.log('UNEXPECTED', unexpected.join(', ') || '(none)')
  console.log('ORDER_OK', orderOk)
  console.log('PLAN_MATCH', missing.length === 0 && unexpected.length === 0 && orderOk)
  if (missing.length || unexpected.length || !orderOk) {
    throw new Error('handover_history does not match schema.sql')
  }
}

async function recreateEmpty() {
  console.log('RECREATE empty handover_history from schema.sql')
  await query('DROP TABLE IF EXISTS handover_history')
  await query(CREATE_SQL)
}

async function alterInPlace() {
  let cols = await columnSet()
  console.log('BEFORE_COLS', [...cols].sort().join(', '))

  if (cols.has('archived_at') && !cols.has('created_at')) {
    await query(
      `ALTER TABLE handover_history
       CHANGE COLUMN archived_at created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각'`,
    )
    console.log('RENAMED archived_at → created_at')
  } else if (cols.has('created_at')) {
    console.log('SKIP created_at already present')
  } else {
    throw new Error('Neither archived_at nor created_at found')
  }

  cols = await columnSet()
  if (cols.has('situation') && !cols.has('handover_content')) {
    await query(
      `ALTER TABLE handover_history
       CHANGE COLUMN situation handover_content VARCHAR(255) NOT NULL COMMENT '인수인계 내용(본문)'`,
    )
    console.log('RENAMED situation → handover_content')
  } else if (cols.has('handover_content')) {
    console.log('SKIP handover_content already present')
  } else {
    throw new Error('Neither situation nor handover_content found')
  }

  // Leftovers when both old+new coexist (partial migrate / restore).
  for (const col of ['situation', 'event_date', 'snapshot_json'] as const) {
    cols = await columnSet()
    if (cols.has(col)) {
      await query(`ALTER TABLE handover_history DROP COLUMN \`${col}\``)
      console.log('DROPPED', col)
    } else {
      console.log('SKIP_DROP', col)
    }
  }

  if (await indexExists('idx_handover_date')) {
    await query('ALTER TABLE handover_history DROP INDEX idx_handover_date')
    console.log('DROPPED_INDEX idx_handover_date')
  }

  cols = await columnSet()
  if (!cols.has('archived_at')) {
    await query(
      `ALTER TABLE handover_history
       ADD COLUMN archived_at DATETIME NULL COMMENT '완료 시각 (완료 버튼 시 NOW)' AFTER created_at`,
    )
    console.log('ADDED archived_at (completion)')
  } else {
    // Force last column after created_at.
    await query(
      `ALTER TABLE handover_history
       MODIFY COLUMN archived_at DATETIME NULL COMMENT '완료 시각 (완료 버튼 시 NOW)' AFTER created_at`,
    )
    console.log('MOVED archived_at AFTER created_at')
  }

  const backfill = await query<unknown>(
    `UPDATE handover_history
     SET archived_at = created_at
     WHERE action = '완료' AND archived_at IS NULL`,
  )
  const affected =
    backfill && typeof backfill === 'object' && 'affectedRows' in backfill
      ? Number((backfill as { affectedRows: number }).affectedRows)
      : backfill
  console.log('BACKFILL_COMPLETED_ARCHIVED_AT', { affectedRows: affected })

  if (!(await indexExists('idx_handover_created'))) {
    await query('ALTER TABLE handover_history ADD INDEX idx_handover_created (created_at)')
    console.log('ADDED_INDEX idx_handover_created')
  }
}

async function main() {
  const before = await columnsOrdered()
  const n = await rowCount()
  console.log('BEFORE_COLS_ORDERED', before.join(', ') || '(missing)')
  console.log('BEFORE_ROWS', n)

  if (n === 0) {
    await recreateEmpty()
  } else {
    await alterInPlace()
  }

  console.log('AFTER_ROWS', await rowCount())
  assertPlanMatch(await columnsOrdered())
  console.log('OK handover_history matches schema.sql')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
