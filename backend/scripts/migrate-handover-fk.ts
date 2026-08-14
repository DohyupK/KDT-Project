import '../src/loadRootEnv.js'
import mariadb from 'mariadb'

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

async function fkExists(conn: mariadb.Connection, name: string): Promise<boolean> {
  const rows = (await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'HANDOVER_HISTORY'
       AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [name],
  )) as { c: number | bigint }[]
  return Number(rows[0]?.c) > 0
}

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  })

  try {
    if (!(await columnExists(conn, 'HANDOVER_HISTORY', 'handover_from'))) {
      await conn.query(
        `ALTER TABLE HANDOVER_HISTORY
         ADD COLUMN handover_from VARCHAR(50) NULL COMMENT '인계자' AFTER cause`,
      )
      console.log('ADD handover_from')
    } else {
      console.log('SKIP handover_from')
    }

    if (!(await columnExists(conn, 'HANDOVER_HISTORY', 'handover_to'))) {
      await conn.query(
        `ALTER TABLE HANDOVER_HISTORY
         ADD COLUMN handover_to VARCHAR(50) NULL COMMENT '인수자' AFTER handover_from`,
      )
      console.log('ADD handover_to')
    } else {
      console.log('SKIP handover_to')
    }

    await conn.query(
      `UPDATE HANDOVER_HISTORY
       SET handover_from = manager
       WHERE (handover_from IS NULL OR handover_from = '')
         AND manager IS NOT NULL AND manager <> ''`,
    )
    console.log('BACKFILL handover_from from manager')

    const fks: Array<{ name: string; sql: string }> = [
      {
        name: 'fk_handover_issue',
        sql: `ALTER TABLE HANDOVER_HISTORY
          ADD CONSTRAINT fk_handover_issue
          FOREIGN KEY (issue_id) REFERENCES ISSUES(issue_id) ON DELETE RESTRICT`,
      },
      {
        name: 'fk_handover_lot',
        sql: `ALTER TABLE HANDOVER_HISTORY
          ADD CONSTRAINT fk_handover_lot
          FOREIGN KEY (lot_id) REFERENCES LOTS(lot_id) ON DELETE RESTRICT`,
      },
      {
        name: 'fk_handover_assignee',
        sql: `ALTER TABLE HANDOVER_HISTORY
          ADD CONSTRAINT fk_handover_assignee
          FOREIGN KEY (assignee_user_id) REFERENCES USERS(user_id) ON DELETE SET NULL`,
      },
    ]

    for (const fk of fks) {
      if (await fkExists(conn, fk.name)) {
        console.log(`SKIP ${fk.name}`)
        continue
      }
      try {
        await conn.query(fk.sql)
        console.log(`ADD ${fk.name}`)
      } catch (err) {
        console.error(`FAIL ${fk.name}`, err instanceof Error ? err.message : err)
        throw err
      }
    }

    console.log('HANDOVER_ALTER_OK')
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
