/**
 * 1) Purge mock/abnormal rows in analysis_lots + handover_history
 * 2) Align both tables to DB/schema.sql
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

const ANALYSIS_EXPECTED = [
  'lot_id',
  'probability',
  'spc_status',
  'risk_level',
  'risk_reason',
  'created_at',
] as const

const HANDOVER_EXPECTED = [
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

const HANDOVER_CREATE = `
CREATE TABLE handover_history (
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
    FOREIGN KEY (assignee_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  INDEX idx_handover_created (created_at),
  INDEX idx_handover_action (action(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`

async function cols(table: string): Promise<string[]> {
  const rows = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [table],
  )
  return rows.map((r) => r.COLUMN_NAME)
}

async function colSet(table: string) {
  return new Set(await cols(table))
}

async function indexExists(table: string, name: string) {
  const rows = await query<{ INDEX_NAME: string }[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [table, name],
  )
  return rows.length > 0
}

async function purgeMockRows() {
  // Handover mock/test authors
  const hBefore = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM handover_history`)
  const hDel = await query<unknown>(
    `DELETE FROM handover_history
     WHERE assignee_user_id = 'aa'
        OR handover_from IN ('a', 'mock')
        OR handover_content LIKE '%목업%'`,
  )
  const hAffected =
    hDel && typeof hDel === 'object' && 'affectedRows' in hDel
      ? Number((hDel as { affectedRows: number }).affectedRows)
      : hDel
  const hAfter = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM handover_history`)
  console.log('PURGE_HANDOVER', {
    before: Number(hBefore[0]?.c ?? 0),
    deleted: hAffected,
    after: Number(hAfter[0]?.c ?? 0),
  })

  // analysis_lots: system placeholder lot scored by poller — not real process data.
  const aDel = await query<unknown>(
    `DELETE FROM analysis_lots WHERE lot_id = 'LOT-SYS-HANDOVER' OR lot_id LIKE 'LOT-CA-%'`,
  )
  const aAffected =
    aDel && typeof aDel === 'object' && 'affectedRows' in aDel
      ? Number((aDel as { affectedRows: number }).affectedRows)
      : aDel
  console.log('PURGE_ANALYSIS', { deleted: aAffected })
}

async function alignAnalysisLots() {
  let set = await colSet('analysis_lots')
  console.log('ANALYSIS_BEFORE', (await cols('analysis_lots')).join(', '))

  if (set.has('defect_prob') && set.has('probability')) {
    await query(
      `UPDATE analysis_lots
       SET probability = COALESCE(probability, defect_prob)
       WHERE probability IS NULL AND defect_prob IS NOT NULL`,
    )
    await query('ALTER TABLE analysis_lots DROP COLUMN defect_prob')
    console.log('MERGED+DROPPED defect_prob')
  } else if (set.has('defect_prob') && !set.has('probability')) {
    await query(`ALTER TABLE analysis_lots CHANGE COLUMN defect_prob probability DOUBLE NULL`)
    console.log('RENAMED defect_prob → probability')
  }

  for (const col of [
    'clf_model_version',
    'residual_model_version',
    'spc_limit_version',
    'scored_at',
    'updated_at',
    'defect_prob',
    'spc_chart_json',
  ]) {
    set = await colSet('analysis_lots')
    if (set.has(col)) {
      await query(`ALTER TABLE analysis_lots DROP COLUMN \`${col}\``)
      console.log('DROPPED analysis_lots.' + col)
    }
  }

  if (await indexExists('analysis_lots', 'idx_analysis_scored')) {
    await query('ALTER TABLE analysis_lots DROP INDEX idx_analysis_scored')
    console.log('DROPPED_INDEX idx_analysis_scored')
  }

  const after = await cols('analysis_lots')
  const afterSet = new Set(after)
  const missing = ANALYSIS_EXPECTED.filter((c) => !afterSet.has(c))
  const unexpected = after.filter((c) => !(ANALYSIS_EXPECTED as readonly string[]).includes(c))
  console.log('ANALYSIS_AFTER', after.join(', '))
  console.log('ANALYSIS_PLAN_MATCH', missing.length === 0 && unexpected.length === 0)
  if (missing.length || unexpected.length) {
    throw new Error(
      `analysis_lots mismatch missing=${missing.join('|')} unexpected=${unexpected.join('|')}`,
    )
  }
}

async function alignHandover() {
  const n = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM handover_history`)
  const count = Number(n[0]?.c ?? 0)
  console.log('HANDOVER_BEFORE', (await cols('handover_history')).join(', '), 'rows', count)

  if (count === 0) {
    await query('DROP TABLE IF EXISTS handover_history')
    await query(HANDOVER_CREATE)
    console.log('RECREATED handover_history')
  } else {
    let set = await colSet('handover_history')
    if (set.has('archived_at') && !set.has('created_at')) {
      await query(
        `ALTER TABLE handover_history
         CHANGE COLUMN archived_at created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각'`,
      )
    }
    set = await colSet('handover_history')
    if (set.has('situation') && !set.has('handover_content')) {
      await query(
        `ALTER TABLE handover_history
         CHANGE COLUMN situation handover_content VARCHAR(255) NOT NULL COMMENT '인수인계 내용(본문)'`,
      )
    }
    for (const col of ['situation', 'event_date', 'snapshot_json'] as const) {
      set = await colSet('handover_history')
      if (set.has(col)) {
        await query(`ALTER TABLE handover_history DROP COLUMN \`${col}\``)
        console.log('DROPPED handover_history.' + col)
      }
    }
    if (await indexExists('handover_history', 'idx_handover_date')) {
      await query('ALTER TABLE handover_history DROP INDEX idx_handover_date')
    }
    set = await colSet('handover_history')
    if (!set.has('archived_at')) {
      await query(
        `ALTER TABLE handover_history
         ADD COLUMN archived_at DATETIME NULL COMMENT '완료 시각 (완료 버튼 시 NOW)' AFTER created_at`,
      )
    } else {
      await query(
        `ALTER TABLE handover_history
         MODIFY COLUMN archived_at DATETIME NULL COMMENT '완료 시각 (완료 버튼 시 NOW)' AFTER created_at`,
      )
    }
    if (!(await indexExists('handover_history', 'idx_handover_created'))) {
      await query('ALTER TABLE handover_history ADD INDEX idx_handover_created (created_at)')
    }
  }

  const after = await cols('handover_history')
  const afterSet = new Set(after)
  const missing = HANDOVER_EXPECTED.filter((c) => !afterSet.has(c))
  const unexpected = after.filter((c) => !(HANDOVER_EXPECTED as readonly string[]).includes(c))
  const orderOk = after.join(',') === HANDOVER_EXPECTED.join(',')
  console.log('HANDOVER_AFTER', after.join(', '))
  console.log('HANDOVER_PLAN_MATCH', missing.length === 0 && unexpected.length === 0 && orderOk)
  if (missing.length || unexpected.length || !orderOk) {
    throw new Error(
      `handover_history mismatch missing=${missing.join('|')} unexpected=${unexpected.join('|')} orderOk=${orderOk}`,
    )
  }
}

async function main() {
  await purgeMockRows()
  await alignAnalysisLots()
  await alignHandover()

  const aN = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM analysis_lots`)
  const hN = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM handover_history`)
  console.log('FINAL_ROWS', {
    analysis_lots: Number(aN[0]?.c ?? 0),
    handover_history: Number(hN[0]?.c ?? 0),
  })
  console.log('OK fix-align-lots-handover complete')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
