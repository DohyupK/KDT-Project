/**
 * Align live MariaDB with DB/schema.sql (additive; preserve data).
 * - analysis_lots: probability → defect_prob (+ scored_at, version cols, updated_at)
 * - handover_history: handover_content → situation (+ event_date)
 * - judgment_lots.spc, spc_limits, standard (idempotent)
 */
import '../src/loadRootEnv.js'
import mariadb from 'mariadb'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

async function columnExists(
  conn: mariadb.Connection,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = (await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )) as { c: number | bigint }[]
  return Number(rows[0]?.c) > 0
}

async function indexExists(
  conn: mariadb.Connection,
  table: string,
  indexName: string,
): Promise<boolean> {
  const rows = (await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  )) as { c: number | bigint }[]
  return Number(rows[0]?.c) > 0
}

async function tableExists(conn: mariadb.Connection, table: string): Promise<boolean> {
  const rows = (await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  )) as { c: number | bigint }[]
  return Number(rows[0]?.c) > 0
}

async function addColumnIfMissing(
  conn: mariadb.Connection,
  table: string,
  column: string,
  ddlFragment: string,
) {
  if (await columnExists(conn, table, column)) {
    console.log(`SKIP ${table}.${column}`)
    return
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddlFragment}`)
  console.log(`ADD ${table}.${column}`)
}

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  })

  try {
    console.log('DB', process.env.DB_NAME, process.env.DB_HOST)

    // ── analysis_lots ─────────────────────────────────────────────
    if (!(await tableExists(conn, 'analysis_lots'))) {
      throw new Error('analysis_lots table missing — run recreate-lots-analysis or apply schema.sql first')
    }

    await addColumnIfMissing(
      conn,
      'analysis_lots',
      'defect_prob',
      'defect_prob DOUBLE NULL AFTER lot_id',
    )

    // Backfill defect_prob from legacy `probability` if present
    if (await columnExists(conn, 'analysis_lots', 'probability')) {
      const res = await conn.query(
        `UPDATE analysis_lots
         SET defect_prob = probability
         WHERE defect_prob IS NULL AND probability IS NOT NULL`,
      )
      console.log('BACKFILL analysis_lots.defect_prob from probability', res)
    }

    await addColumnIfMissing(
      conn,
      'analysis_lots',
      'clf_model_version',
      'clf_model_version VARCHAR(64) NULL AFTER risk_reason',
    )
    await addColumnIfMissing(
      conn,
      'analysis_lots',
      'residual_model_version',
      'residual_model_version VARCHAR(64) NULL AFTER clf_model_version',
    )
    await addColumnIfMissing(
      conn,
      'analysis_lots',
      'spc_limit_version',
      'spc_limit_version VARCHAR(64) NULL AFTER residual_model_version',
    )
    await addColumnIfMissing(
      conn,
      'analysis_lots',
      'scored_at',
      'scored_at DATETIME NULL AFTER spc_limit_version',
    )
    await addColumnIfMissing(
      conn,
      'analysis_lots',
      'updated_at',
      'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
    )

    if (!(await indexExists(conn, 'analysis_lots', 'idx_analysis_scored'))) {
      await conn.query('ALTER TABLE analysis_lots ADD INDEX idx_analysis_scored (scored_at)')
      console.log('ADD INDEX idx_analysis_scored')
    } else {
      console.log('SKIP INDEX idx_analysis_scored')
    }

    // If scored_at empty but row has scores, mark as scored (created_at fallback)
    await conn.query(
      `UPDATE analysis_lots
       SET scored_at = COALESCE(scored_at, created_at, NOW())
       WHERE scored_at IS NULL
         AND (defect_prob IS NOT NULL OR spc_status IS NOT NULL OR risk_reason IS NOT NULL)`,
    )
    console.log('BACKFILL analysis_lots.scored_at')

    // ── handover_history ──────────────────────────────────────────
    if (await tableExists(conn, 'handover_history')) {
      await addColumnIfMissing(
        conn,
        'handover_history',
        'situation',
        "situation VARCHAR(255) NULL COMMENT '인수인계 내용(본문)' AFTER risk_level",
      )

      if (await columnExists(conn, 'handover_history', 'handover_content')) {
        await conn.query(
          `UPDATE handover_history
           SET situation = handover_content
           WHERE (situation IS NULL OR situation = '')
             AND handover_content IS NOT NULL AND handover_content <> ''`,
        )
        console.log('BACKFILL handover_history.situation from handover_content')
      }

      // Fill remaining NULLs so NOT NULL constraint can apply if desired
      await conn.query(
        `UPDATE handover_history SET situation = '' WHERE situation IS NULL`,
      )

      await addColumnIfMissing(
        conn,
        'handover_history',
        'event_date',
        "event_date DATE NULL COMMENT '날짜' AFTER manager",
      )

      // Backfill event_date from issues.occurred_at, else archived_at/created_at
      await conn.query(
        `UPDATE handover_history h
         LEFT JOIN issues i ON i.issue_id = h.issue_id
         SET h.event_date = DATE(COALESCE(i.occurred_at, h.archived_at, h.created_at, NOW()))
         WHERE h.event_date IS NULL`,
      )
      console.log('BACKFILL handover_history.event_date')

      if (!(await indexExists(conn, 'handover_history', 'idx_handover_date'))) {
        try {
          await conn.query('ALTER TABLE handover_history ADD INDEX idx_handover_date (event_date)')
          console.log('ADD INDEX idx_handover_date')
        } catch (e) {
          console.log('SKIP idx_handover_date', e instanceof Error ? e.message : e)
        }
      }
    } else {
      console.log('SKIP handover_history (table missing)')
    }

    // ── judgment_lots.spc ─────────────────────────────────────────
    if (await tableExists(conn, 'judgment_lots')) {
      await addColumnIfMissing(
        conn,
        'judgment_lots',
        'spc',
        'spc VARCHAR(16) NULL AFTER probability',
      )
      await conn.query(
        `UPDATE judgment_lots j
         INNER JOIN analysis_lots a ON a.lot_id = j.lot_id
         SET j.spc = CASE
           WHEN a.spc_status IS NULL OR a.spc_status = '' THEN NULL
           WHEN a.spc_status LIKE '%이탈%' THEN '이탈'
           WHEN a.spc_status LIKE '%주의%' THEN '주의'
           ELSE '안정'
         END
         WHERE j.spc IS NULL`,
      )
      console.log('BACKFILL judgment_lots.spc')
    }

    // ── spc_limits + standard ─────────────────────────────────────
    const here = path.dirname(fileURLToPath(import.meta.url))
    const sqlPath = path.resolve(here, '../../DB/spc_limits_and_standard.sql')
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf8')
      const statements = sql
        .split(/;\s*\n/)
        .map((s) => s.replace(/^\s*--[^\n]*/gm, '').trim())
        .filter((s) => s.length > 0)
      for (const stmt of statements) {
        try {
          await conn.query(stmt)
          console.log('OK', stmt.slice(0, 50).replace(/\s+/g, ' '))
        } catch (e) {
          console.log('WARN', stmt.slice(0, 40), e instanceof Error ? e.message : e)
        }
      }
    }

    // ── verify ────────────────────────────────────────────────────
    for (const [table, col] of [
      ['analysis_lots', 'defect_prob'],
      ['analysis_lots', 'scored_at'],
      ['handover_history', 'situation'],
      ['handover_history', 'event_date'],
      ['judgment_lots', 'spc'],
    ] as const) {
      const ok = await columnExists(conn, table, col)
      console.log(`VERIFY ${table}.${col}=${ok}`)
    }

    console.log('ALIGN_SCHEMA_OK')
  } finally {
    await conn.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
