import { query } from '../db/connection.js'
import {
  buildRuleRiskReason,
  composeRiskReasonViaVllm,
  isRiskReasonAcceptable,
} from './vllmRiskReason.js'

const SYS_HANDOVER = 'LOT-SYS-HANDOVER'

export type RiskReasonLotRow = {
  lot_id: string
  probability: number | null
  spc_status: string | null
  risk_level: string | null
  residual_li: number | null
  capacity: number | null
  quality_defect: number | null
}

export async function updateAnalysisRiskReason(
  lotId: string,
  riskReason: string,
): Promise<void> {
  await query(`UPDATE ANALYSIS_LOTS SET risk_reason = ? WHERE lot_id = ?`, [
    riskReason.slice(0, 255),
    lotId,
  ])
}

/** Load score facts for vLLM reason generation. */
export async function loadRiskReasonFacts(
  lotIds?: string[],
): Promise<RiskReasonLotRow[]> {
  if (lotIds != null && lotIds.length === 0) return []
  if (lotIds != null && lotIds.length > 0) {
    const placeholders = lotIds.map(() => '?').join(', ')
    return query<RiskReasonLotRow[]>(
      `SELECT a.lot_id, a.probability, a.spc_status, a.risk_level,
              j.residual_li, j.capacity, j.quality_defect
       FROM ANALYSIS_LOTS a
       LEFT JOIN JUDGMENT_LOTS j ON j.lot_id = a.lot_id
       WHERE a.lot_id IN (${placeholders}) AND a.lot_id <> ?`,
      [...lotIds, SYS_HANDOVER],
    )
  }
  return query<RiskReasonLotRow[]>(
    `SELECT a.lot_id, a.probability, a.spc_status, a.risk_level,
            j.residual_li, j.capacity, j.quality_defect
     FROM ANALYSIS_LOTS a
     LEFT JOIN JUDGMENT_LOTS j ON j.lot_id = a.lot_id
     WHERE a.lot_id <> ?
     ORDER BY a.lot_id ASC`,
    [SYS_HANDOVER],
  )
}

export type FillRiskReasonsResult = {
  updated: number
  failed: number
  skipped: number
  fallback: number
  errors: string[]
}

/**
 * Call local vLLM for each analysis row and overwrite risk_reason.
 * Invalid elevated+「기준 범위」 replies fall back to rule text.
 * Transport failure keeps prior DB value (counts as failed).
 */
export async function fillRiskReasonsForLots(
  lotIds?: string[],
  opts: { concurrency?: number; quiet?: boolean } = {},
): Promise<FillRiskReasonsResult> {
  const concurrency = Math.min(Math.max(opts.concurrency ?? 2, 1), 4)
  const rows = await loadRiskReasonFacts(lotIds)
  let updated = 0
  let failed = 0
  let skipped = 0
  let fallback = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      chunk.map(async (row) => {
        const facts = {
          lot_id: row.lot_id,
          probability: row.probability,
          spc_status: row.spc_status,
          risk_level: row.risk_level,
          residual_li: row.residual_li,
          capacity: row.capacity,
          quality_defect: row.quality_defect,
        }
        const ai = await composeRiskReasonViaVllm(facts)
        let text = (ai.risk_reason || '').trim()
        let usedFallback = Boolean(ai.usedFallback)

        if (!text || ai.error) {
          text = buildRuleRiskReason(facts)
          usedFallback = true
          if (ai.error && !opts.quiet) {
            console.warn('[lot-risk-reason] vllm_error→rule', row.lot_id, ai.error)
          }
        } else if (!isRiskReasonAcceptable(row.risk_level, text)) {
          text = buildRuleRiskReason(facts)
          usedFallback = true
        }

        await updateAnalysisRiskReason(row.lot_id, text)
        return { lotId: row.lot_id, usedFallback }
      }),
    )
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        updated++
        if (s.value.usedFallback) fallback++
      } else {
        failed++
        const msg = s.reason instanceof Error ? s.reason.message : String(s.reason)
        errors.push(msg.slice(0, 200))
        if (!opts.quiet) {
          console.warn('[lot-risk-reason] fail', msg)
        }
      }
    }
    if (!opts.quiet && (i + concurrency) % 20 < concurrency) {
      console.log(`[lot-risk-reason] progress ${Math.min(i + concurrency, rows.length)}/${rows.length}`)
    }
  }

  if (rows.length === 0) skipped = 1
  return { updated, failed, skipped, fallback, errors: errors.slice(0, 20) }
}
