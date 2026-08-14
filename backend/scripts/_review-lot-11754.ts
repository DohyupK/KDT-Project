import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

const lotId = 'LOT-20260812-11754'

const rows = await query<
  {
    lot_id: string
    probability: number | null
    spc_status: string | null
    risk_level: string | null
    residual_li: number | null
    summary: string | null
    drivers_json: unknown
  }[]
>(
  `SELECT a.lot_id, a.probability, a.spc_status, a.risk_level, j.residual_li,
          r.summary, r.drivers_json
   FROM analysis_lots a
   LEFT JOIN judgment_lots j ON j.lot_id = a.lot_id
   LEFT JOIN lot_recommended_actions r ON r.lot_id = a.lot_id
   WHERE a.lot_id = ? LIMIT 1`,
  [lotId],
)

const lot = await query<
  {
    d50: number | null
    d90: number | null
    metal_impurity: number | null
    humidity: number | null
    sintering_temp: number | null
    lithium_input: number | null
  }[]
>(
  `SELECT d50, d90, metal_impurity, humidity, sintering_temp, lithium_input
   FROM lots WHERE id = ? LIMIT 1`,
  [lotId],
)

console.log(JSON.stringify({ analysis: rows[0], features: lot[0] }, null, 2))
