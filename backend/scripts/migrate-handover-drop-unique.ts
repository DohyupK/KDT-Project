import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mariadb from 'mariadb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const pool = mariadb.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'kdt_project',
  connectionLimit: 1,
})

async function indexExists(conn: mariadb.PoolConnection, name: string) {
  const rows = await conn.query(
    'SHOW INDEX FROM HANDOVER_HISTORY WHERE Key_name = ?',
    [name],
  )
  return Array.isArray(rows) && rows.length > 0
}

async function run() {
  const conn = await pool.getConnection()
  try {
    const hasUnique = await indexExists(conn, 'uk_handover_issue')
    if (hasUnique) {
      await conn.query('ALTER TABLE HANDOVER_HISTORY DROP FOREIGN KEY fk_handover_issue')
      console.log('Dropped FK fk_handover_issue')
      await conn.query('ALTER TABLE HANDOVER_HISTORY DROP INDEX uk_handover_issue')
      console.log('Dropped uk_handover_issue')
    } else {
      console.log('uk_handover_issue already absent')
    }

    if (!(await indexExists(conn, 'idx_handover_issue'))) {
      await conn.query('ALTER TABLE HANDOVER_HISTORY ADD INDEX idx_handover_issue (issue_id)')
      console.log('Added idx_handover_issue')
    } else {
      console.log('idx_handover_issue already exists')
    }

    // Recreate FK if missing (after unique drop path)
    const fks = await conn.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'HANDOVER_HISTORY'
         AND CONSTRAINT_NAME = 'fk_handover_issue'
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    )
    if (!Array.isArray(fks) || fks.length === 0) {
      await conn.query(
        `ALTER TABLE HANDOVER_HISTORY
         ADD CONSTRAINT fk_handover_issue
         FOREIGN KEY (issue_id) REFERENCES ISSUES(issue_id)
         ON DELETE RESTRICT`,
      )
      console.log('Recreated FK fk_handover_issue')
    } else {
      console.log('FK fk_handover_issue already present')
    }

    if (!(await indexExists(conn, 'idx_handover_action'))) {
      await conn.query('ALTER TABLE HANDOVER_HISTORY ADD INDEX idx_handover_action (action(32))')
      console.log('Added idx_handover_action')
    } else {
      console.log('idx_handover_action already exists')
    }

    const result = await conn.query(
      "UPDATE HANDOVER_HISTORY SET action = '완료' WHERE category = '완료' AND (action IS NULL OR action <> '완료')",
    )
    console.log(
      'Legacy action update affectedRows=',
      (result as { affectedRows?: number })?.affectedRows,
    )
  } finally {
    conn.release()
    await pool.end()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
