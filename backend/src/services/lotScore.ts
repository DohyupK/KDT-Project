import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { predictCapacity, predictDefect, predictResidual } from './aiProxy.js'
import {
  evaluateLotSpc,
  isProcessComplete,
  spcStatusToRiskTier,
  SPC_PARAM_KEYS,
  type SpcParamKey,
} from './spcEngine.js'
import { getStandardDefaults, loadStandard } from './standard.js'

/** Dashboard / lots / issues risk vocabulary (replaces 높음|중간|낮음). */
export type RiskLevel = '심각' | '주의' | '안정'

/** @deprecated Prefer loadStandard().spare — kept as sync default for cold paths/tests */
export const RESIDUAL_USL = getStandardDefaults().spare

export const DEFECT_PROB_SEVERE = getStandardDefaults().defect_prob_severe
export const DEFECT_PROB_CAUTION = getStandardDefaults().defect_prob_caution
export const RESIDUAL_SEVERE = getStandardDefaults().residual_severe
export const RESIDUAL_CAUTION = getStandardDefaults().residual_caution

const RAW_NUMERIC_KEYS = [
  'd50',
  'd90',
  'metal_impurity',
  'lithium_input',
  'additive_ratio',
  'process_time',
  'sintering_temp',
  'humidity',
  'tank_pressure',
] as const

export type ProcessFeatures = {
  d50: number | null
  d90: number | null
  metal_impurity: number | null
  lithium_input: number | null
  additive_ratio: number | null
  process_time: number | null
  sintering_temp: number | null
  humidity: number | null
  tank_pressure: number | null
  operator_id: string | null
  id?: string
  timestamp?: string
}

let imputerNumeric: Record<string, number> | null = null

function loadImputerNumeric(): Record<string, number> {
  if (imputerNumeric) return imputerNumeric
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../../../../ai-service/models/imputer_values.json'),
    path.resolve(here, '../../../ai-service/models/imputer_values.json'),
    path.resolve(process.cwd(), '../ai-service/models/imputer_values.json'),
    path.resolve(process.cwd(), 'ai-service/models/imputer_values.json'),
  ]
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue
    const raw = JSON.parse(fs.readFileSync(c, 'utf8')) as { numeric?: Record<string, number> }
    imputerNumeric = raw.numeric || {}
    return imputerNumeric
  }
  imputerNumeric = {}
  return imputerNumeric
}

export type LotScoreResult = {
  /** 0~1 → analysis_lots.probability (+ judgment_lots.probability NULL-fill) */
  probability: number
  residual_lithium: number
  /** /predict defect_status → judgment_lots.quality_defect (NULL-fill only on UPSERT) */
  quality_defect: number
  /** /predict-capacity → judgment_lots.capacity (NULL-fill only on UPSERT) */
  capacity: number | null
  spc_status: string
  risk_level: RiskLevel
  risk_reason: string
}

export function residualMargin(residualLithium: number, usl = RESIDUAL_USL): number {
  return usl - residualLithium
}

export async function getResidualUsl(): Promise<number> {
  const std = await loadStandard()
  return std.spare
}

export function defectProbTier(
  prob: number,
  caution = DEFECT_PROB_CAUTION,
  severe = DEFECT_PROB_SEVERE,
): RiskLevel {
  if (prob >= severe) return '심각'
  if (prob >= caution) return '주의'
  return '안정'
}

export function residualTier(
  residualLi: number,
  caution = RESIDUAL_CAUTION,
  severe = RESIDUAL_SEVERE,
): RiskLevel {
  if (residualLi >= severe) return '심각'
  if (residualLi >= caution) return '주의'
  return '안정'
}

const TIER_RANK: Record<RiskLevel, number> = { 안정: 0, 주의: 1, 심각: 2 }

export function worstRisk(...tiers: RiskLevel[]): RiskLevel {
  let best: RiskLevel = '안정'
  for (const t of tiers) {
    if (TIER_RANK[t] > TIER_RANK[best]) best = t
  }
  return best
}

/** Normalize legacy DB/API labels into the new vocabulary. */
export function normalizeRiskLevel(level: string | null | undefined): RiskLevel {
  const v = (level || '').trim()
  if (v === '심각' || v === 'A' || v === '높음') return '심각'
  if (v === '주의' || v === 'B' || v === '중간') return '주의'
  return '안정'
}

export function buildIssueTitle(riskReason: string, lotId: string): string {
  const short = riskReason.length > 80 ? `${riskReason.slice(0, 77)}…` : riskReason
  return `${lotId}: ${short}`
}

/** Fill null numerics with clf train means so /predict pydantic accepts the body. */
export function featuresToPredictBody(features: ProcessFeatures): Record<string, string | number> {
  const means = loadImputerNumeric()
  const out: Record<string, string | number> = {
    operator_id: features.operator_id?.trim() || '__MISSING__',
  }
  for (const k of RAW_NUMERIC_KEYS) {
    const v = features[k]
    if (v != null && Number.isFinite(Number(v))) out[k] = Number(v)
    else if (means[k] != null) out[k] = means[k]
    else out[k] = 0
  }
  if (features.id) out.id = features.id
  if (features.timestamp) out.timestamp = features.timestamp
  return out
}

/**
 * Combine AI predictions + SPC label into stored lot score fields.
 * `historyByParam` must end with the current LOT values for complete lots.
 */
export function combineLotScore(input: {
  defectProb: number
  residualLi: number
  spcStatus: string | null
  incompleteProcess?: boolean
  /** Optional thresholds from `standard` table */
  thresholds?: {
    defect_prob_caution: number
    defect_prob_severe: number
    residual_caution: number
    residual_severe: number
  }
}): LotScoreResult {
  const probability = Math.round(input.defectProb * 10000) / 10000
  const residual_lithium = Math.round(input.residualLi * 1000) / 1000
  // Incomplete process → SPC label "-" (excluded from risk axes)
  const spc_status = input.incompleteProcess ? '-' : input.spcStatus || '안정'
  const reasons: string[] = []
  const t = input.thresholds

  const dTier = defectProbTier(
    defect_prob,
    t?.defect_prob_caution,
    t?.defect_prob_severe,
  )
  const rTier = residualTier(
    residual_lithium,
    t?.residual_caution,
    t?.residual_severe,
  )
  const sTier =
    spc_status === '-'
      ? ('안정' as RiskLevel)
      : spcStatusToRiskTier(spc_status)

  if (dTier !== '안정') reasons.push(`불량확률 ${(probability * 100).toFixed(1)}%`)
  if (rTier !== '안정') reasons.push(`잔류리튬 ${residual_lithium.toFixed(1)}ppm`)
  if (sTier !== '안정' && spc_status !== '-') reasons.push(`SPC ${spc_status}`)
  if (input.incompleteProcess) reasons.push('공정 결측(SPC 제외)')
  if (reasons.length === 0) reasons.push('기준 범위 내')

  const riskAxes =
    spc_status === '-'
      ? worstRisk(dTier, rTier)
      : worstRisk(dTier, rTier, sTier)

  return {
    probability,
    residual_lithium,
    quality_defect: 0,
    capacity: null,
    spc_status,
    risk_level: riskAxes,
    risk_reason: reasons.join(', ').slice(0, 255),
  }
}

export function evaluateSpcForFeatures(
  features: ProcessFeatures,
  historyByParam: Record<SpcParamKey, number[]>,
): { complete: boolean; status: string } {
  const bag: Partial<Record<SpcParamKey, number | null>> = {}
  for (const k of SPC_PARAM_KEYS) {
    bag[k] = features[k]
  }
  if (!isProcessComplete(bag)) {
    return { complete: false, status: '-' }
  }
  const evaled = evaluateLotSpc(historyByParam)
  return { complete: true, status: evaled.status }
}

/** Call ai-service: O/X, capacity, residual from process features + SPC label. */
export async function scoreLotWithAi(
  clfFeatures: ProcessFeatures,
  residualFeatures: ProcessFeatures,
  historyByParam: Record<SpcParamKey, number[]>,
  /** SPC completeness is judged on ops/complete-case process features (usually clf). */
  spcFeatures?: ProcessFeatures,
): Promise<LotScoreResult> {
  const spcInput = spcFeatures ?? clfFeatures
  const clfBody = featuresToPredictBody(clfFeatures)
  const residualBody = featuresToPredictBody(residualFeatures)
  const [clf, residual, capacity] = await Promise.all([
    predictDefect(clfBody),
    predictResidual(residualBody),
    predictCapacity(clfBody),
  ])
  const spc = evaluateSpcForFeatures(spcInput, historyByParam)
  const std = await loadStandard()
  const scored = combineLotScore({
    defectProb: clf.probability,
    residualLi: residual.residual_li,
    spcStatus: spc.status,
    incompleteProcess: !spc.complete,
    thresholds: {
      defect_prob_caution: std.defect_prob_caution,
      defect_prob_severe: std.defect_prob_severe,
      residual_caution: std.residual_caution,
      residual_severe: std.residual_severe,
    },
  })
  scored.quality_defect = Number(clf.defect_status) === 1 ? 1 : 0
  const cap = Number(capacity.capacity)
  scored.capacity = Number.isFinite(cap) ? Math.round(cap * 1000) / 1000 : null
  return scored
}

/** Append current complete-lot values onto running SPC histories (mutates). */
export function pushCompleteLotHistory(
  historyByParam: Record<SpcParamKey, number[]>,
  features: ProcessFeatures,
): boolean {
  const bag: Partial<Record<SpcParamKey, number | null>> = {}
  for (const k of SPC_PARAM_KEYS) bag[k] = features[k]
  if (!isProcessComplete(bag)) return false
  for (const k of SPC_PARAM_KEYS) {
    historyByParam[k].push(Number(features[k]))
  }
  return true
}

export function emptySpcHistory(): Record<SpcParamKey, number[]> {
  const h = {} as Record<SpcParamKey, number[]>
  for (const k of SPC_PARAM_KEYS) h[k] = []
  return h
}
