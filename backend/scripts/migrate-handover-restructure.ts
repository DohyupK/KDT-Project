/**
 * Align handover_history to DB/schema.sql:
 * Empty table → DROP + CREATE for exact column order.
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

const CREATE_SQL = `
CREATE TABLE HANDOVER_HISTORY (
  history_id        BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  handover_content  VARCHAR(255) NOT NULL COMMENT '인수인계 내용(본문)',
  action            TEXT         NULL COMMENT '완료 플래그: NULL=pending, ''완료''=Knowledge 표시',
  handover_from     VARCHAR(50)  NULL COMMENT '인계자 ← users.name',
  handover_to       VARCHAR(50)  NULL COMMENT '인수자(선택)',
  assignee_user_id  VARCHAR(50)  NULL,
  category          VARCHAR(32)  NULL COMMENT '특이사항/전달사항/주의사항',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각',
  archived_at       DATETIME     NULL COMMENT '완료 시각 (완료 버튼 시 NOW)',
  CONSTRAINT fk_handover_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES USERS(user_id)
    ON DELETE SET NULL,
  INDEX idx_handover_created (created_at),
  INDEX idx_handover_action (action(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`

async function columnsOrdered(): Promise<string[]> {
  const rows = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'HANDOVER_HISTORY'
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
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'HANDOVER_HISTORY' AND INDEX_NAME = ?
     LIMIT 1`,
    [name],
  )
  return rows.length > 0
}

async function rowCount(): Promise<number> {
  const rows = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM HANDOVER_HISTORY`)
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
  await query('DROP TABLE IF EXISTS HANDOVER_HISTORY')
  await query(CREATE_SQL)
}

async function alterInPlace() {
  let cols = await columnSet()
  console.log('BEFORE_COLS', [...cols].sort().join(', '))

  if (cols.has('archived_at') && !cols.has('created_at')) {
    await query(
      `ALTER TABLE HANDOVER_HISTORY
       CHANGE COLUMN archived_at created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각'`,
    )
    console.log('RENAMED archived_at → created_at')
  }

  cols = await columnSet()
  if (cols.has('situation') && !cols.has('handover_content')) {
    await query(
      `ALTER TABLE HANDOVER_HISTORY
       CHANGE COLUMN situation handover_content VARCHAR(255) NOT NULL COMMENT '인수인계 내용(본문)'`,
    )
    console.log('RENAMED situation → handover_content')
  }

  // Drop FKs before dropping referencing columns
  for (const fk of ['fk_handover_lot', 'fk_handover_issue'] as const) {
    const fks = await query<{ CONSTRAINT_NAME: string }[]>(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'HANDOVER_HISTORY'
         AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = ?`,
      [fk],
    )
    if (fks.length) {
      await query(`ALTER TABLE HANDOVER_HISTORY DROP FOREIGN KEY ${fk}`)
      console.log('DROPPED_FK', fk)
    }
  }

  if (await indexExists('idx_handover_date')) {
    await query('ALTER TABLE HANDOVER_HISTORY DROP INDEX idx_handover_date')
  }
  if (await indexExists('idx_handover_lot')) {
    await query('ALTER TABLE HANDOVER_HISTORY DROP INDEX idx_handover_lot')
  }
  if (await indexExists('idx_handover_issue')) {
    await query('ALTER TABLE HANDOVER_HISTORY DROP INDEX idx_handover_issue')
  }

  for (const col of [
    'situation',
    'event_date',
    'snapshot_json',
    'lot_id',
    'risk_level',
    'cause',
    'manager',
    'issue_id',
  ] as const) {
    cols = await columnSet()
    if (cols.has(col)) {
      await query(`ALTER TABLE HANDOVER_HISTORY DROP COLUMN \`${col}\``)
      console.log('DROPPED', col)
    }
  }

  cols = await columnSet()
  if (!cols.has('archived_at')) {
    await query(
      `ALTER TABLE HANDOVER_HISTORY
       ADD COLUMN archived_at DATETIME NULL COMMENT '완료 시각 (완료 버튼 시 NOW)' AFTER created_at`,
    )
  } else {
    await query(
      `ALTER TABLE HANDOVER_HISTORY
       MODIFY COLUMN archived_at DATETIME NULL COMMENT '완료 시각 (완료 버튼 시 NOW)' AFTER created_at`,
    )
  }

  await query(
    `UPDATE HANDOVER_HISTORY
     SET archived_at = created_at
     WHERE action = '완료' AND archived_at IS NULL`,
  )

  if (!(await indexExists('idx_handover_created'))) {
    await query('ALTER TABLE HANDOVER_HISTORY ADD INDEX idx_handover_created (created_at)')
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
