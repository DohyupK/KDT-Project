/**
 * Create spc_limits + standard, ADD judgment_lots.spc, backfill from analysis_lots.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sqlPath = path.resolve(here, '../../DB/spc_limits_and_standard.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  // Split on semicolons that end statements (simple; file has no procedures)
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--[^\n]*/gm, '').trim())
    .filter((s) => s.length > 0)

  for (const stmt of statements) {
    await query(stmt)
    console.log('OK', stmt.slice(0, 60).replace(/\s+/g, ' '))
  }

  const backfill = await query<{ affectedRows?: number }>(
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
  console.log('BACKFILL_SPC', backfill)

  const limCount = await query<{ c: number }[]>('SELECT COUNT(*) AS c FROM spc_limits')
  const std = await query<unknown[]>('SELECT * FROM standard WHERE id = 1')
  console.log('spc_limits', limCount[0]?.c, 'standard', std[0])
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
