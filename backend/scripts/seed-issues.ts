import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mariadb from 'mariadb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const sqlPath = path.resolve(__dirname, '../../DB/issues_seed.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  })

  try {
    await conn.query(sql)
    const rows = await conn.query<{ issueCount: number; lotCount: number }[]>(
      `SELECT
         (SELECT COUNT(*) FROM issues) AS issueCount,
         (SELECT COUNT(*) FROM lots WHERE id LIKE 'LOT-CA-2607%') AS lotCount`,
    )
    console.log(
      `SEED_OK lots ${Number(rows[0]?.lotCount ?? 0)} (issues left empty: ${Number(rows[0]?.issueCount ?? 0)} rows)`,
    )
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
