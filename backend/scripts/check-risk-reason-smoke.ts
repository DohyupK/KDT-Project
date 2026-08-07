import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

const rows = await query<
  { lot_id: string; risk_level: string; spc_status: string | null; risk_reason: string | null }[]
>(
  `SELECT lot_id, risk_level, spc_status, risk_reason
   FROM analysis_lots
   WHERE lot_id <> ?
   ORDER BY lot_id ASC
   LIMIT 50`,
  ['LOT-SYS-HANDOVER'],
)

const bad = rows.filter(
  (r) =>
    (r.risk_level === '심각' || r.risk_level === '주의') &&
    /기준\s*범위/.test(r.risk_reason || ''),
)
const severe = rows.filter((r) => r.risk_level === '심각').slice(0, 5)

console.log('TOTAL', rows.length)
console.log('BAD_ELEVATED_AND_IN_RANGE', bad.length)
console.log('BAD_SAMPLE', JSON.stringify(bad.slice(0, 5), null, 2))
console.log('SEVERE_SAMPLE', JSON.stringify(severe, null, 2))
process.exit(0)
