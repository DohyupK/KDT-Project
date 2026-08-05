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

export type SpcLimit = {
  label: string
  LCL_I: number
  CL_I: number
  UCL_I: number
  CL_MR: number
  UCL_MR: number
}

export type SpcParamEvaluation = {
  key: SpcParamKey
  label: string
  status: SpcParamStatus
  value: number
  ooc: boolean
  nelson: boolean
}

export type SpcLotEvaluation = {
  /** LOT cell label: 이탈 | 주의 | 안정 | 이탈, 주의 */
  status: string
  params: SpcParamEvaluation[]
  oocKeys: SpcParamKey[]
  cautionKeys: SpcParamKey[]
}

type LimitsFile = {
  limits: Record<string, SpcLimit>
}

const D2 = 1.128

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

export function isProcessComplete(
  values: Partial<Record<SpcParamKey, number | null | undefined>>,
): boolean {
  return SPC_PARAM_KEYS.every((k) => {
    const v = values[k]
    return v != null && Number.isFinite(Number(v))
  })
}

function sigmaFromMr(clMr: number): number {
  return clMr / D2
}

function isOoc(value: number, lim: SpcLimit): boolean {
  return value < lim.LCL_I || value > lim.UCL_I
}

/** Nelson rules 2–8 on I-chart (Rule 1 = OOC handled separately). */
export function violatesNelson2to8(series: number[], lim: SpcLimit): boolean {
  const n = series.length
  if (n < 3) return false
  const cl = lim.CL_I
  const sigma = sigmaFromMr(lim.CL_MR)
  if (!(sigma > 0)) return false

  const side = (v: number) => (v > cl ? 1 : v < cl ? -1 : 0)
  const beyond = (v: number, k: number) => Math.abs(v - cl) > k * sigma

  // Rule 2: 9 consecutive on same side of CL
  if (n >= 9) {
    for (let i = 8; i < n; i++) {
      const window = series.slice(i - 8, i + 1)
      const s0 = side(window[0])
      if (s0 !== 0 && window.every((v) => side(v) === s0)) return true
    }
  }

  // Rule 3: 6 consecutive increasing or decreasing
  if (n >= 6) {
    for (let i = 5; i < n; i++) {
      const w = series.slice(i - 5, i + 1)
      let up = true
      let down = true
      for (let j = 1; j < w.length; j++) {
        if (!(w[j] > w[j - 1])) up = false
        if (!(w[j] < w[j - 1])) down = false
      }
      if (up || down) return true
    }
  }

  // Rule 4: 14 alternating up/down
  if (n >= 14) {
    for (let i = 13; i < n; i++) {
      const w = series.slice(i - 13, i + 1)
      let alt = true
      for (let j = 2; j < w.length; j++) {
        const prev = w[j - 1] - w[j - 2]
        const cur = w[j] - w[j - 1]
        if (prev === 0 || cur === 0 || Math.sign(prev) === Math.sign(cur)) {
          alt = false
          break
        }
      }
      if (alt) return true
    }
  }

  // Rule 5: 2 of 3 consecutive beyond 2σ same side
  if (n >= 3) {
    for (let i = 2; i < n; i++) {
      const w = series.slice(i - 2, i + 1)
      for (const s of [1, -1] as const) {
        const hits = w.filter((v) => side(v) === s && beyond(v, 2)).length
        if (hits >= 2) return true
      }
    }
  }

  // Rule 6: 4 of 5 consecutive beyond 1σ same side
  if (n >= 5) {
    for (let i = 4; i < n; i++) {
      const w = series.slice(i - 4, i + 1)
      for (const s of [1, -1] as const) {
        const hits = w.filter((v) => side(v) === s && beyond(v, 1)).length
        if (hits >= 4) return true
      }
    }
  }

  // Rule 7: 15 consecutive within 1σ of CL
  if (n >= 15) {
    for (let i = 14; i < n; i++) {
      const w = series.slice(i - 14, i + 1)
      if (w.every((v) => !beyond(v, 1))) return true
    }
  }

  // Rule 8: 8 consecutive outside 1σ (both sides ok) with none inside 1σ
  if (n >= 8) {
    for (let i = 7; i < n; i++) {
      const w = series.slice(i - 7, i + 1)
      if (w.every((v) => beyond(v, 1))) return true
    }
  }

  return false
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
      })
      continue
    }
    const ooc = isOoc(value, lim)
    const nelson = !ooc && violatesNelson2to8(series, lim)
    let status: SpcParamStatus = '안정'
    if (ooc) {
      status = '이탈'
      oocKeys.push(key)
    } else if (nelson) {
      status = '주의'
      cautionKeys.push(key)
    }
    params.push({ key, label: lim.label, status, value, ooc, nelson })
  }

  let status = '안정'
  if (oocKeys.length > 0 && cautionKeys.length > 0) status = '이탈, 주의'
  else if (oocKeys.length > 0) status = '이탈'
  else if (cautionKeys.length > 0) status = '주의'

  return { status, params, oocKeys, cautionKeys }
}

export function spcStatusToRiskTier(spcStatus: string | null | undefined): '심각' | '주의' | '안정' {
  if (!spcStatus || spcStatus === '안정') return '안정'
  if (spcStatus.includes('이탈')) return '심각'
  if (spcStatus.includes('주의')) return '주의'
  return '안정'
}
