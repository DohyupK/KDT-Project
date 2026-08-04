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
    const rows = await conn.query<{ issueCount: number }[]>(
      `SELECT COUNT(*) AS issueCount
       FROM issues
       WHERE issue_id IN (
         'ISS-260721-018', 'ISS-260721-017', 'ISS-260721-016', 'ISS-260720-015',
         'ISS-260720-014', 'ISS-260719-013', 'ISS-260719-012', 'ISS-260718-011'
       )`,
    )
    console.log(`SEED_OK issues ${Number(rows[0]?.issueCount ?? 0)}/8`)
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
