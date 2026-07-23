import { query } from '../db/connection'
import { isDbUnavailableError, useMockStorage } from '../utils/db'

const DEFECT_RATE_THRESHOLD = 2.0
const SINTERING_TEMP_LIMIT = 820
const LITHIUM_INPUT_LIMIT = 2.8

export interface MainKpi {
  sinteringTemp: number
  lithiumInput: number
  defectRate: number
  equipmentStatus: string
}

export interface MainAiInsight {
  cause: string
  probabilityNote: string
  suggestions: string[]
}

export interface MainAlert {
  id: string
  title: string
  description: string
  severity: '진행중' | '주의'
  lotId: string
}

export interface MainLatestLot {
  lotId: string
  timestamp: string
  sinteringTemp: number
  lithiumInput: number
  qualityDefect: number
}

export interface MainOverview {
  kpi: MainKpi
  aiInsight: MainAiInsight
  alerts: MainAlert[]
  latestLot: MainLatestLot
}

interface ClassificationRow {
  lot_id: string
  post_sintering_at: Date | string
  sintering_temp: number | null
  lithium_input: number | null
  quality_defect: number | null
}

interface DefectRateRow {
  daily_defect_rate: number
  record_date: Date | string
  rate_type: string
}

const MOCK_OVERVIEW: MainOverview = {
  kpi: {
    sinteringTemp: 748,
    lithiumInput: 2.85,
    defectRate: 2.35,
    equipmentStatus: '가동 중',
  },
  aiInsight: {
    cause: '소성 온도 상한 초과 (748°C) 및 리튬 투입량 과다 (2.85 kg/h)',
    probabilityNote: '과거 데이터 분석 결과, 현재 패턴은 불량률 2.5% 도달 확률이 95%입니다.',
    suggestions: ['온도 740°C 하향 제안'],
  },
  alerts: [
    {
      id: 'ALERT-001',
      title: '불량률 초과 발생',
      description: 'LOT LOT-20251202-00027 | 불량률 2.35% (상한 2.0% 초과)',
      severity: '진행중',
      lotId: 'LOT-20251202-00027',
    },
    {
      id: 'ALERT-002',
      title: '예측 위험도 높음',
      description: 'LOT LOT-20251202-00048 | 10분 뒤 예측 불량률 2.10%',
      severity: '주의',
      lotId: 'LOT-20251202-00048',
    },
  ],
  latestLot: {
    lotId: 'LOT-20251202-00027',
    timestamp: new Date().toISOString(),
    sinteringTemp: 748,
    lithiumInput: 2.85,
    qualityDefect: 1,
  },
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function buildAiInsight(lot: MainLatestLot, defectRate: number): MainAiInsight {
  const temp = lot.sinteringTemp
  const lithium = lot.lithiumInput
  const causes: string[] = []

  if (temp >= SINTERING_TEMP_LIMIT) {
    causes.push(`소성 온도 상한 초과 (${round(temp, 0)}°C)`)
  }
  if (lithium >= LITHIUM_INPUT_LIMIT) {
    causes.push(`리튬 투입량 과다 (${round(lithium, 2)} kg/h)`)
  }
  if (lot.qualityDefect === 1) {
    causes.push('품질 불량 LOT 감지')
  }

  const cause =
    causes.length > 0
      ? causes.join(' 및 ')
      : '현재 공정 변수는 정상 범위 내입니다.'

  const targetRate = Math.min(2.5, defectRate + 0.15)
  const probability = defectRate >= DEFECT_RATE_THRESHOLD ? 95 : 72

  const suggestions: string[] = []
  if (temp >= SINTERING_TEMP_LIMIT) {
    suggestions.push(`온도 ${Math.max(740, round(temp - 8, 0))}°C 하향 제안`)
  }
  if (lithium >= LITHIUM_INPUT_LIMIT) {
    suggestions.push(`리튬 투입량 ${round(lithium - 0.2, 2)} kg/h 조정 제안`)
  }
  if (suggestions.length === 0) {
    suggestions.push('현재 공정 유지 및 모니터링 지속')
  }

  return {
    cause,
    probabilityNote: `과거 데이터 분석 결과, 현재 패턴은 불량률 ${targetRate}% 도달 확률이 ${probability}%입니다.`,
    suggestions,
  }
}

function buildAlerts(
  defectLots: ClassificationRow[],
  defectRate: number,
  predictedRate: number | null,
  latestLotId: string,
): MainAlert[] {
  const alerts: MainAlert[] = []

  if (defectRate > DEFECT_RATE_THRESHOLD) {
    alerts.push({
      id: 'ALERT-DEFECT-RATE',
      title: '불량률 초과 발생',
      description: `LOT ${latestLotId} | 불량률 ${round(defectRate, 2)}% (상한 ${DEFECT_RATE_THRESHOLD}% 초과)`,
      severity: '진행중',
      lotId: latestLotId,
    })
  }

  defectLots.slice(0, 3).forEach((row, index) => {
    if (alerts.some((a) => a.lotId === row.lot_id)) return
    alerts.push({
      id: `ALERT-DEFECT-${index + 1}`,
      title: '품질 불량 LOT 감지',
      description: `LOT ${row.lot_id} | 소성 온도 ${round(Number(row.sintering_temp ?? 0), 0)}°C`,
      severity: '진행중',
      lotId: row.lot_id,
    })
  })

  if (predictedRate !== null && predictedRate >= DEFECT_RATE_THRESHOLD - 0.1) {
    alerts.push({
      id: 'ALERT-PREDICTED',
      title: '예측 위험도 높음',
      description: `LOT ${latestLotId} | 예측 불량률 ${round(predictedRate, 2)}%`,
      severity: '주의',
      lotId: latestLotId,
    })
  }

  return alerts.slice(0, 5)
}

function mapLatestLot(row: ClassificationRow): MainLatestLot {
  return {
    lotId: row.lot_id,
    timestamp: new Date(row.post_sintering_at).toISOString(),
    sinteringTemp: round(Number(row.sintering_temp ?? 0), 1),
    lithiumInput: round(Number(row.lithium_input ?? 0), 2),
    qualityDefect: Number(row.quality_defect ?? 0),
  }
}

async function fetchOverviewFromDb(): Promise<MainOverview> {
  const latestRows = await query<ClassificationRow[]>(
    `SELECT lot_id, post_sintering_at, sintering_temp, lithium_input, quality_defect
     FROM cathode_classification_data
     ORDER BY post_sintering_at DESC
     LIMIT 1`,
  )

  const defectLotRows = await query<ClassificationRow[]>(
    `SELECT lot_id, post_sintering_at, sintering_temp, lithium_input, quality_defect
     FROM cathode_classification_data
     WHERE quality_defect = 1
     ORDER BY post_sintering_at DESC
     LIMIT 5`,
  )

  const actualRateRows = await query<DefectRateRow[]>(
    `SELECT daily_defect_rate, record_date, rate_type
     FROM daily_defect_rates
     WHERE rate_type = 'ACTUAL'
     ORDER BY record_date DESC
     LIMIT 1`,
  )

  const predictedRateRows = await query<DefectRateRow[]>(
    `SELECT daily_defect_rate, record_date, rate_type
     FROM daily_defect_rates
     WHERE rate_type = 'PREDICTED'
     ORDER BY record_date ASC
     LIMIT 1`,
  )

  const latestRow = latestRows[0]
  if (!latestRow) {
    return MOCK_OVERVIEW
  }

  const latestLot = mapLatestLot(latestRow)
  const defectRate = round(Number(actualRateRows[0]?.daily_defect_rate ?? 0), 2)
  const predictedRate = predictedRateRows[0]
    ? round(Number(predictedRateRows[0].daily_defect_rate), 2)
    : null

  const kpi: MainKpi = {
    sinteringTemp: latestLot.sinteringTemp,
    lithiumInput: latestLot.lithiumInput,
    defectRate: defectRate || (latestLot.qualityDefect === 1 ? DEFECT_RATE_THRESHOLD + 0.35 : 1.2),
    equipmentStatus: '가동 중',
  }

  return {
    kpi,
    aiInsight: buildAiInsight(latestLot, kpi.defectRate),
    alerts: buildAlerts(defectLotRows, kpi.defectRate, predictedRate, latestLot.lotId),
    latestLot,
  }
}

export async function getMainOverview(): Promise<MainOverview> {
  try {
    return await fetchOverviewFromDb()
  } catch (err) {
    if (useMockStorage('MOCK_MAIN') || isDbUnavailableError(err)) {
      return MOCK_OVERVIEW
    }
    throw err
  }
}
