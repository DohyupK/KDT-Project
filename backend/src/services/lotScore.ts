/** Provisional scoring until defect_prob / residual Li / SPC pipeline is ready. */

export type RiskLevel = '높음' | '중간' | '낮음'

export type LotScoreInput = {
  quality_defect: number
  sintering_temp: number | null
  humidity: number | null
  metal_impurity: number | null
  lithium_input: number | null
}

export type LotScoreResult = {
  defect_prob: number
  residual_lithium: number
  spc_status: string
  risk_level: RiskLevel
  risk_reason: string
}

/** Heuristic: defect flag → 높음; temp/humidity/impurity excursions → 중간; else 낮음. */
export function scoreLot(input: LotScoreInput): LotScoreResult {
  const defect = Number(input.quality_defect) === 1
  const temp = input.sintering_temp
  const hum = input.humidity
  const impurity = input.metal_impurity
  const li = input.lithium_input

  let defectProb = defect ? 0.85 : 0.12
  let residualLi = li != null ? Math.max(0, li - 1.8) : 0.2
  let spc = '정상'
  const reasons: string[] = []

  if (defect) {
    defectProb = 0.9
    reasons.push('품질 불량 플래그')
  }
  if (temp != null && (temp < 720 || temp > 840)) {
    spc = '이탈'
    defectProb = Math.max(defectProb, 0.55)
    reasons.push(`소성온도 이탈(${temp.toFixed(1)}°C)`)
  }
  if (hum != null && (hum < 10 || hum > 55)) {
    spc = spc === '정상' ? '주의' : spc
    defectProb = Math.max(defectProb, 0.4)
    reasons.push(`습도 이탈(${hum.toFixed(1)}%)`)
  }
  if (impurity != null && impurity > 0.04) {
    defectProb = Math.max(defectProb, 0.5)
    reasons.push(`금속 불순물 높음(${impurity.toFixed(4)})`)
  }

  let risk_level: RiskLevel = '낮음'
  if (defect || defectProb >= 0.7) risk_level = '높음'
  else if (defectProb >= 0.35 || spc !== '정상') risk_level = '중간'

  if (reasons.length === 0) reasons.push('기준 범위 내')

  return {
    defect_prob: Math.round(defectProb * 1000) / 1000,
    residual_lithium: Math.round(residualLi * 1000) / 1000,
    spc_status: spc,
    risk_level,
    risk_reason: reasons.join(', '),
  }
}

export function buildIssueTitle(riskReason: string, lotId: string): string {
  const short = riskReason.length > 80 ? `${riskReason.slice(0, 77)}…` : riskReason
  return `${lotId}: ${short}`
}
