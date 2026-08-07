import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

const rows = await query(
  `SELECT lot_id, risk_level, spc_status, risk_reason
   FROM analysis_lots
   WHERE lot_id <> ?
   ORDER BY lot_id ASC
   LIMIT 5`,
  ['LOT-SYS-HANDOVER'],
)
console.log(JSON.stringify(rows, null, 2))
process.exit(0)
