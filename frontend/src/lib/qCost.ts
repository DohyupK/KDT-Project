/**
 * Tier-based Quality Cost (Q-Cost) calculator — pure functions only.
 */

export type QCostInput = {
  stableCount: number
  warningCount: number
  criticalCount: number
  internalDefectCount: number
  externalLeakCount: number
}

export type QCostResult = {
  appraisalCost: number
  appraisalBreakdown: {
    stable: number
    warning: number
    critical: number
  }
  internalCost: number
  externalCost: number
  preventionCost: number
  totalQCost: number
}

/** Appraisal: 안정 / 주의 / 심각 per LOT */
export const APPRAISAL_UNIT = {
  stable: 50_000,
  warning: 100_000,
  critical: 250_000,
} as const

/** Internal failure per defect */
export const INTERNAL_FAILURE_UNIT = 500_000

/** External leak per defect */
export const EXTERNAL_FAILURE_UNIT = 3_000_000

/** Monthly fixed prevention cost */
export const PREVENTION_COST = 20_000_000

export const normalizeCount = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

export function normalizeQCostInput(input: QCostInput): QCostInput {
  return {
    stableCount: normalizeCount(input.stableCount),
    warningCount: normalizeCount(input.warningCount),
    criticalCount: normalizeCount(input.criticalCount),
    internalDefectCount: normalizeCount(input.internalDefectCount),
    externalLeakCount: normalizeCount(input.externalLeakCount),
  }
}

export function calculateQCost(raw: QCostInput): QCostResult {
  const input = normalizeQCostInput(raw)

  const appraisalBreakdown = {
    stable: input.stableCount * APPRAISAL_UNIT.stable,
    warning: input.warningCount * APPRAISAL_UNIT.warning,
    critical: input.criticalCount * APPRAISAL_UNIT.critical,
  }

  const appraisalCost =
    appraisalBreakdown.stable +
    appraisalBreakdown.warning +
    appraisalBreakdown.critical

  const internalCost = input.internalDefectCount * INTERNAL_FAILURE_UNIT
  const externalCost = input.externalLeakCount * EXTERNAL_FAILURE_UNIT
  const preventionCost = PREVENTION_COST

  return {
    appraisalCost,
    appraisalBreakdown,
    internalCost,
    externalCost,
    preventionCost,
    totalQCost: appraisalCost + internalCost + externalCost + preventionCost,
  }
}

export const formatKRW = (value: number): string =>
  `${(Number.isFinite(value) ? Math.round(value) : 0).toLocaleString('ko-KR')}원`
