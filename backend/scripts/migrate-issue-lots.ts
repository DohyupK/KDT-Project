import '../src/loadRootEnv.js'
import fs from 'fs'
import mariadb from 'mariadb'
import * as lotService from '../src/services/lot.service.ts'

async function main() {
  const sql = fs.readFileSync('./src/sql/issue_lot_tables.sql', 'utf8')
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
    console.log('DDL_OK')
  } finally {
    await conn.end()
  }

  const imported = await lotService.importLotsFromCsv()
  console.log('IMPORT', JSON.stringify(imported))
  const issuesCreated = await lotService.ensureIssuesForRiskLots()
  console.log('ISSUES_CREATED', issuesCreated)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
