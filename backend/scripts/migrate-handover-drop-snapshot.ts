/**
 * DROP handover_history.snapshot_json
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

async function main() {
  const rows = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'handover_history'
       AND COLUMN_NAME = 'snapshot_json'`,
  )
  if (rows.length === 0) {
    console.log('SKIP snapshot_json already gone')
  } else {
    await query('ALTER TABLE handover_history DROP COLUMN snapshot_json')
    console.log('DROPPED snapshot_json')
  }
  console.log('OK')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
