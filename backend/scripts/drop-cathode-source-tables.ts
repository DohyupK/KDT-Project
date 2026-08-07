import '../src/loadRootEnv.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mariadb from 'mariadb'

async function main() {
  const sqlPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../DB/drop_cathode_source_tables.sql',
  )
  const sql = fs.readFileSync(sqlPath, 'utf8')
  const db = process.env.DB_NAME!
  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: db,
    multipleStatements: true,
  })
  try {
    const before = (await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'cathode_%'
       ORDER BY TABLE_NAME`,
      [db],
    )) as { TABLE_NAME: string }[]
    console.log(
      'BEFORE',
      before.map((r) => r.TABLE_NAME),
    )
    await conn.query(sql)
    const after = (await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'cathode_%'
       ORDER BY TABLE_NAME`,
      [db],
    )) as { TABLE_NAME: string }[]
    console.log(
      'AFTER',
      after.map((r) => r.TABLE_NAME),
    )
  } finally {
    await conn.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
