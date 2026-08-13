/**
 * Create lot_recommended_actions if missing (idempotent).
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function tableExists(name: string): Promise<boolean> {
  const rows = await query<{ t: string }[]>(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [name],
  )
  return rows.length > 0
}

async function main() {
  if (await tableExists('lot_recommended_actions')) {
    await query(
      `ALTER TABLE lot_recommended_actions MODIFY summary VARCHAR(1024) NOT NULL DEFAULT ''`,
    )
    console.log('OK widened lot_recommended_actions.summary to VARCHAR(1024)')
    return
  }
  const sqlPath = path.resolve(__dirname, '../../DB/lot_recommended_actions.sql')
  const sql = fs.readFileSync(sqlPath, 'utf-8')
  await query(sql)
  console.log('OK created lot_recommended_actions')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
