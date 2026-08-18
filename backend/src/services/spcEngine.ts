import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/** Process params used for SPC (excludes id, timestamp, operator_id). */
export const SPC_PARAM_KEYS = [
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

export type SpcParamKey = (typeof SPC_PARAM_KEYS)[number]

export type SpcParamStatus = '이탈' | '주의' | '안정'

/** Lot-level SPC label stored in JUDGMENT_LOTS.spc / ANALYSIS_LOTS.spc_status */
export type SpcLotStatus = '이탈' | '주의' | '안정' | '-'

export type SpcLimit = {
  label: string
  LCL_I: number
  CL_I: number
  UCL_I: number
  CL_MR: number
  UCL_MR: number
}

export type NelsonRuleHit = {
  rule: number
  description: string
}

export type SpcParamEvaluation = {
  key: SpcParamKey
  label: string
  status: SpcParamStatus
  value: number
  ooc: boolean
  nelson: boolean
  violatedRules: NelsonRuleHit[]
}

export type SpcLotEvaluation = {
  /** LOT cell: 이탈 | 주의 | 안정 (이탈 wins over 주의) */
  status: Exclude<SpcLotStatus, '-'>
  params: SpcParamEvaluation[]
  oocKeys: SpcParamKey[]
  cautionKeys: SpcParamKey[]
}

type LimitsFile = {
  limits: Record<string, SpcLimit>
}

const D2 = 1.128

export const NELSON_RULE_DESCRIPTIONS: Record<number, string> = {
  1: 'UCL 초과 또는 LCL 미만',
  2: '중심선(CL) 같은 쪽에 연속 9점',
  3: '연속 6점 증가 또는 감소',
  4: '연속 14점이 상승·하강 교대',
  5: '연속 3점 중 2점 이상이 같은 쪽에서 2σ 초과',
  6: '연속 5점 중 4점 이상이 같은 쪽에서 1σ 초과',
  7: '연속 15점이 CL의 1σ 이내',
  8: '연속 8점이 모두 1σ 밖에 있음(양쪽 허용)',
}

let cachedLimits: Record<SpcParamKey, SpcLimit> | null = null

function resolveLimitsPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../../config/spcPhase1Limits.json'),
    path.resolve(process.cwd(), 'config/spcPhase1Limits.json'),
    path.resolve(process.cwd(), 'backend/config/spcPhase1Limits.json'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error('spcPhase1Limits.json not found')
}

export function loadPhase1Limits(): Record<SpcParamKey, SpcLimit> {
  if (cachedLimits) return cachedLimits
  const raw = JSON.parse(fs.readFileSync(resolveLimitsPath(), 'utf8')) as LimitsFile
  const out = {} as Record<SpcParamKey, SpcLimit>
  for (const key of SPC_PARAM_KEYS) {
    const lim = raw.limits[key]
    if (!lim) throw new Error(`Missing Phase I limits for ${key}`)
    out[key] = lim
  }
  cachedLimits = out
  return out
}

export function clearLimitsCache() {
  cachedLimits = null
}

export function isProcessComplete(
  values: Partial<Record<SpcParamKey, number | null | undefined>>,
): boolean {
  return listMissingProcessKeys(values).length === 0
}

/** Keys among SPC_PARAM_KEYS that are null, empty, or non-finite. */
export function listMissingProcessKeys(
  values: Partial<Record<SpcParamKey, number | null | undefined | string>>,
): SpcParamKey[] {
  return SPC_PARAM_KEYS.filter((k) => {
    const v = values[k]
    if (v == null || v === '') return true
    return !Number.isFinite(typeof v === 'number' ? v : Number(v))
  })
}

function sigmaFromMr(clMr: number): number {
  return clMr / D2
}

function isOoc(value: number, lim: SpcLimit): boolean {
  return value < lim.LCL_I || value > lim.UCL_I
}

/** Nelson rules 2–8 on I-chart at the **current (last) observation** only. */
export function findNelson2to8Violations(series: number[], lim: SpcLimit): NelsonRuleHit[] {
  const hits: NelsonRuleHit[] = []
  const n = series.length
  if (n < 3) return hits
  const cl = lim.CL_I
  const sigma = sigmaFromMr(lim.CL_MR)
  if (!(sigma > 0)) return hits

  const side = (v: number) => (v > cl ? 1 : v < cl ? -1 : 0)
  const beyond = (v: number, k: number) => Math.abs(v - cl) > k * sigma
  const add = (rule: number) => {
    if (!hits.some((h) => h.rule === rule)) {
      hits.push({ rule, description: NELSON_RULE_DESCRIPTIONS[rule] })
    }
  }
  const tail = (len: number) => series.slice(n - len, n)

  // Rule 2: last 9 consecutive on same side of CL
  if (n >= 9) {
    const window = tail(9)
    const s0 = side(window[0])
    if (s0 !== 0 && window.every((v) => side(v) === s0)) add(2)
  }

  // Rule 3: last 6 consecutive increasing or decreasing
  if (n >= 6) {
    const w = tail(6)
    let up = true
    let down = true
    for (let j = 1; j < w.length; j++) {
      if (!(w[j] > w[j - 1])) up = false
      if (!(w[j] < w[j - 1])) down = false
    }
    if (up || down) add(3)
  }

  // Rule 4: last 14 alternating up/down
  if (n >= 14) {
    const w = tail(14)
    let alt = true
    for (let j = 2; j < w.length; j++) {
      const prev = w[j - 1] - w[j - 2]
      const cur = w[j] - w[j - 1]
      if (prev === 0 || cur === 0 || Math.sign(prev) === Math.sign(cur)) {
        alt = false
        break
      }
    }
    if (alt) add(4)
  }

  // Rule 5: last 3 points — 2 of 3 beyond 2σ same side
  if (n >= 3) {
    const w = tail(3)
    for (const s of [1, -1] as const) {
      const c = w.filter((v) => side(v) === s && beyond(v, 2)).length
      if (c >= 2) {
        add(5)
        break
      }
    }
  }

  // Rule 6: last 5 points — 4 of 5 beyond 1σ same side
  if (n >= 5) {
    const w = tail(5)
    for (const s of [1, -1] as const) {
      const c = w.filter((v) => side(v) === s && beyond(v, 1)).length
      if (c >= 4) {
        add(6)
        break
      }
    }
  }

  // Rule 7: last 15 consecutive within 1σ of CL
  if (n >= 15) {
    const w = tail(15)
    if (w.every((v) => !beyond(v, 1))) add(7)
  }

  // Rule 8: last 8 consecutive outside 1σ
  if (n >= 8) {
    const w = tail(8)
    if (w.every((v) => beyond(v, 1))) add(8)
  }

  return hits
}

/** @deprecated use findNelson2to8Violations */
export function violatesNelson2to8(series: number[], lim: SpcLimit): boolean {
  return findNelson2to8Violations(series, lim).length > 0
}

/**
 * Evaluate SPC for one LOT given per-param history ending with the current value.
 * History should only include listwise-complete LOTs in time order.
 */
export function evaluateLotSpc(
  historyByParam: Record<SpcParamKey, number[]>,
): SpcLotEvaluation {
  const limits = loadPhase1Limits()
  const params: SpcParamEvaluation[] = []
  const oocKeys: SpcParamKey[] = []
  const cautionKeys: SpcParamKey[] = []

  for (const key of SPC_PARAM_KEYS) {
    const lim = limits[key]
    const series = historyByParam[key] || []
    const value = series[series.length - 1]
    if (value == null || !Number.isFinite(value)) {
      params.push({
        key,
        label: lim.label,
        status: '안정',
        value: NaN,
        ooc: false,
        nelson: false,
        violatedRules: [],
      })
      continue
    }
    const ooc = isOoc(value, lim)
    const nelsonHits = ooc ? [] : findNelson2to8Violations(series, lim)
    const violatedRules: NelsonRuleHit[] = ooc
      ? [{ rule: 1, description: NELSON_RULE_DESCRIPTIONS[1] }]
      : nelsonHits
    const nelson = nelsonHits.length > 0
    let status: SpcParamStatus = '안정'
    if (ooc) {
      status = '이탈'
      oocKeys.push(key)
    } else if (nelson) {
      status = '주의'
      cautionKeys.push(key)
    }
    params.push({ key, label: lim.label, status, value, ooc, nelson, violatedRules })
  }

  // Lot label: 이탈 > 주의 > 안정 (never combine "이탈, 주의")
  let status: Exclude<SpcLotStatus, '-'> = '안정'
  if (oocKeys.length > 0) status = '이탈'
  else if (cautionKeys.length > 0) status = '주의'

  return { status, params, oocKeys, cautionKeys }
}

export function spcStatusToRiskTier(spcStatus: string | null | undefined): '심각' | '주의' | '안정' {
  if (!spcStatus || spcStatus === '안정' || spcStatus === '-') return '안정'
  if (spcStatus.includes('이탈')) return '심각'
  if (spcStatus.includes('주의')) return '주의'
  return '안정'
}

/** Normalize stored/API SPC labels to 이탈|주의|안정|- */
export function normalizeSpcStatus(raw: string | null | undefined): SpcLotStatus {
  const v = (raw || '').trim()
  if (!v || v === '-') return '-'
  if (v.includes('이탈')) return '이탈'
  if (v.includes('주의')) return '주의'
  if (v === '안정') return '안정'
  return '-'
}
