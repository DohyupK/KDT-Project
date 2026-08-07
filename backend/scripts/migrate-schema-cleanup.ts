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

async function tableExists(conn: mariadb.Connection, table: string): Promise<boolean> {
  const rows = (await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  )) as { c: number | bigint }[]
  return Number(rows[0]?.c) > 0
}

async function dropColumnIfExists(conn: mariadb.Connection, table: string, column: string) {
  if (!(await columnExists(conn, table, column))) {
    console.log(`SKIP DROP ${table}.${column}`)
    return
  }
  await conn.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``)
  console.log(`DROP ${table}.${column}`)
}

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  try {
    for (const col of ['language', 'auto_refresh_enabled', 'n8n_alert']) {
      await dropColumnIfExists(conn, 'user_settings', col)
    }

    if (await tableExists(conn, 'issue_analyses')) {
      await conn.query('DROP TABLE issue_analyses')
      console.log('DROP TABLE issue_analyses')
    } else {
      console.log('SKIP DROP issue_analyses')
    }

    for (const col of ['completed', 'created_at', 'updated_at']) {
      await dropColumnIfExists(conn, 'issues', col)
    }

    console.log('SCHEMA_CLEANUP_OK')
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
