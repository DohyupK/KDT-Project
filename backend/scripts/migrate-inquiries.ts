import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mariadb from 'mariadb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const sqlPath = path.resolve(__dirname, '../../DB/inquiries.sql')
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
    console.log('DDL_OK inquiries')
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
