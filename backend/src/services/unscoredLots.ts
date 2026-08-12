/**
 * Shared unscored-lot picker: prioritize judgment/analysis/scored_at/LR-row gaps
 * (newest first), then residual/qd NULL-fill backlog (oldest first).
 */
import { query } from '../db/connection.js'

export const SYS_HANDOVER_LOT_ID = 'LOT-SYS-HANDOVER'

export type UnscoredLotRow = {
  id: string
  miss_analysis: number
  miss_prob: number
  miss_scored_at: number
  miss_judgment: number
  miss_residual: number
  miss_capacity: number
  miss_lot_results: number
  miss_lr_residual: number
  miss_lr_qd: number
}

export type UnscoredPickResult = {
  lotIds: string[]
  rows: UnscoredLotRow[]
  reason: {
    analysis_null: number
    prob_null: number
    scored_at_null: number
    judgment_null: number
    residual_null: number
    capacity_null: number
    lot_results_null: number
    lr_residual_null: number
    lr_qd_null: number
    queue_a: number
    queue_b: number
  }
}

const SELECT_FLAGS = `SELECT l.id,
              (a.lot_id IS NULL) AS miss_analysis,
              (a.lot_id IS NOT NULL AND a.probability IS NULL) AS miss_prob,
              (a.lot_id IS NOT NULL AND a.scored_at IS NULL) AS miss_scored_at,
              (j.lot_id IS NULL) AS miss_judgment,
              (j.lot_id IS NOT NULL AND j.residual_li IS NULL) AS miss_residual,
              (j.lot_id IS NOT NULL AND j.capacity IS NULL) AS miss_capacity,
              (lr.lot_id IS NULL) AS miss_lot_results,
              (lr.lot_id IS NOT NULL AND lr.residual_li IS NULL) AS miss_lr_residual,
              (lr.lot_id IS NOT NULL AND lr.quality_defect IS NULL) AS miss_lr_qd
       FROM lots l
       LEFT JOIN analysis_lots a ON a.lot_id = l.id
       LEFT JOIN judgment_lots j ON j.lot_id = l.id
       LEFT JOIN lot_results lr ON lr.lot_id = l.id`

function countReasons(rows: UnscoredLotRow[]) {
  return {
    analysis_null: rows.filter((r) => Number(r.miss_analysis)).length,
    prob_null: rows.filter((r) => Number(r.miss_prob)).length,
    scored_at_null: rows.filter((r) => Number(r.miss_scored_at)).length,
    judgment_null: rows.filter((r) => Number(r.miss_judgment)).length,
    residual_null: rows.filter((r) => Number(r.miss_residual)).length,
    capacity_null: rows.filter((r) => Number(r.miss_capacity)).length,
    lot_results_null: rows.filter((r) => Number(r.miss_lot_results)).length,
    lr_residual_null: rows.filter((r) => Number(r.miss_lr_residual)).length,
    lr_qd_null: rows.filter((r) => Number(r.miss_lr_qd)).length,
  }
}

function isPriorityA(r: UnscoredLotRow): boolean {
  return Boolean(
    Number(r.miss_judgment) ||
      Number(r.miss_analysis) ||
      Number(r.miss_prob) ||
      Number(r.miss_scored_at) ||
      Number(r.miss_residual) ||
      Number(r.miss_capacity) ||
      Number(r.miss_lot_results),
  )
}

/**
 * A (~70%): judgment/analysis/scored_at/missing LR row — newest first.
 * B (rest): LR residual/qd NULL only — oldest first.
 */
export async function pickUnscoredLotIds(limit: number): Promise<UnscoredPickResult> {
  const lim = Math.min(Math.max(Math.floor(limit), 1), 500)
  const limitA = Math.max(1, Math.ceil(lim * 0.7))
  const limitB = Math.max(0, lim - limitA)

  const queueA = await query<UnscoredLotRow[]>(
    `${SELECT_FLAGS}
       WHERE l.id <> ?
         AND (
           a.lot_id IS NULL OR a.probability IS NULL OR a.scored_at IS NULL
           OR j.lot_id IS NULL
           OR j.residual_li IS NULL
           OR j.capacity IS NULL
           OR lr.lot_id IS NULL
         )
       ORDER BY l.\`timestamp\` DESC, l.id DESC
       LIMIT ?`,
    [SYS_HANDOVER_LOT_ID, limitA],
  )

  const taken = new Set(queueA.map((r) => r.id))
  let queueB: UnscoredLotRow[] = []
  if (limitB > 0) {
    const candidates = await query<UnscoredLotRow[]>(
      `${SELECT_FLAGS}
       WHERE l.id <> ?
         AND lr.lot_id IS NOT NULL
         AND (lr.residual_li IS NULL OR lr.quality_defect IS NULL)
         AND a.lot_id IS NOT NULL AND a.probability IS NOT NULL AND a.scored_at IS NOT NULL
         AND j.lot_id IS NOT NULL
         AND j.residual_li IS NOT NULL
         AND j.capacity IS NOT NULL
       ORDER BY l.\`timestamp\` ASC, l.id ASC
       LIMIT ?`,
      [SYS_HANDOVER_LOT_ID, limitB + taken.size],
    )
    queueB = candidates.filter((r) => !taken.has(r.id)).slice(0, limitB)
  }

  const rows = [...queueA, ...queueB]
  const base = countReasons(rows)
  return {
    lotIds: rows.map((r) => r.id),
    rows,
    reason: {
      ...base,
      queue_a: queueA.length,
      queue_b: queueB.length,
    },
  }
}

export function splitAnalysisOnly(rows: UnscoredLotRow[]): {
  analysisOnlyIds: string[]
  fullScoreIds: string[]
} {
  const analysisOnlyIds: string[] = []
  const fullScoreIds: string[] = []
  for (const r of rows) {
    const needFull =
      Number(r.miss_judgment) ||
      Number(r.miss_residual) ||
      Number(r.miss_capacity) ||
      Number(r.miss_lot_results) ||
      Number(r.miss_lr_residual) ||
      Number(r.miss_lr_qd)
    // scored_at-only gap with full judgment → analysis-only rebuild is enough
    if (
      !needFull &&
      (Number(r.miss_analysis) || Number(r.miss_prob) || Number(r.miss_scored_at))
    ) {
      analysisOnlyIds.push(r.id)
    } else if (isPriorityA(r) || Number(r.miss_lr_residual) || Number(r.miss_lr_qd)) {
      fullScoreIds.push(r.id)
    } else {
      fullScoreIds.push(r.id)
    }
  }
  return { analysisOnlyIds, fullScoreIds }
}
