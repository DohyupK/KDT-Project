import type { ChatFeatures } from '@/api/aiApi'

/** Main mock LOT row fields that map into predict features. */
export type LotSensorRecord = {
  id: string
  date: string
  hour: string
  sintering_temp: number
  lithium_input: number
  humidity: number
  metal_impurity: number
  tank_pressure: number
  process_time: number
  additive_ratio: number
}

/** Cold-start defaults until Main/API provides d50/d90/operator_id. */
export const LOT_FEATURE_DEFAULTS = {
  d50: 5.1,
  d90: 12.0,
  operator_id: 'OP01',
} as const

/**
 * Map Main LOT sensors → ChatFeatures for ai-service predict.
 * Missing columns use LOT_FEATURE_DEFAULTS (documented Cold start).
 */
export function lotToChatFeatures(record: LotSensorRecord): ChatFeatures {
  return {
    d50: LOT_FEATURE_DEFAULTS.d50,
    d90: LOT_FEATURE_DEFAULTS.d90,
    metal_impurity: record.metal_impurity,
    lithium_input: record.lithium_input,
    additive_ratio: record.additive_ratio,
    process_time: record.process_time,
    sintering_temp: record.sintering_temp,
    humidity: record.humidity,
    tank_pressure: record.tank_pressure,
    operator_id: LOT_FEATURE_DEFAULTS.operator_id,
    id: record.id,
    timestamp: `${record.date} ${record.hour}`,
  }
}
