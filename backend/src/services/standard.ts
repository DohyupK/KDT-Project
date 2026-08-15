/**
 * Load scalar risk thresholds + residual USL (spare) from `STANDARD` (1 row).
 * Falls back to plan defaults when table missing / empty.
 */
import { query } from '../db/connection.js'

export type StandardRow = {
  defect_prob_caution: number
  defect_prob_severe: number
  residual_caution: number
  residual_severe: number
  spare: number
}

const DEFAULTS: StandardRow = {
  defect_prob_caution: 0.2,
  defect_prob_severe: 0.4,
  residual_caution: 3000,
  residual_severe: 3500,
  spare: 4000,
}

let cached: StandardRow | null = null
let cachedAt = 0
const TTL_MS = 60_000

export function clearStandardCache() {
  cached = null
  cachedAt = 0
}

export async function loadStandard(): Promise<StandardRow> {
  const now = Date.now()
  if (cached && now - cachedAt < TTL_MS) return cached
  try {
    const rows = await query<
      {
        defect_prob_caution: number
        defect_prob_severe: number
        residual_caution: number
        residual_severe: number
        spare: number
      }[]
    >(`SELECT defect_prob_caution, defect_prob_severe, residual_caution, residual_severe, spare
       FROM STANDARD WHERE id = 1 LIMIT 1`)
    const r = rows[0]
    if (!r) {
      cached = { ...DEFAULTS }
    } else {
      cached = {
        defect_prob_caution: Number(r.defect_prob_caution),
        defect_prob_severe: Number(r.defect_prob_severe),
        residual_caution: Number(r.residual_caution),
        residual_severe: Number(r.residual_severe),
        spare: Number(r.spare),
      }
    }
  } catch {
    cached = { ...DEFAULTS }
  }
  cachedAt = now
  return cached
}

/** Sync fallback constants used before first await (tests / cold path). */
export function getStandardDefaults(): StandardRow {
  return { ...DEFAULTS }
}
