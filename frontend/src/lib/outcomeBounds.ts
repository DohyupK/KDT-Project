/**
 * Measured outcome bounds — keep in sync with backend/src/services/outcomeBounds.ts
 */
export const OUTCOME_CAPACITY_MIN = 130
export const OUTCOME_CAPACITY_MAX = 250
export const OUTCOME_RESIDUAL_LI_MIN = 500
export const OUTCOME_RESIDUAL_LI_MAX = 8000
export const OUTCOME_DECIMAL_PLACES = 2

function roundToPlaces(n: number, places: number): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

export function parseOptionalMeasured(
  raw: string,
  field: string,
  min: number,
  max: number,
  places: number,
): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) {
    throw new Error(`${field} must be a finite number`)
  }
  if (n < min || n > max) {
    throw new Error(`${field} must be between ${min} and ${max}`)
  }
  const rounded = roundToPlaces(n, places)
  if (Math.abs(n - rounded) > 1e-9) {
    throw new Error(`${field} allows at most ${places} decimal place(s)`)
  }
  return rounded
}

export function parseOutcomeCapacityInput(raw: string): number | null {
  return parseOptionalMeasured(
    raw,
    'outcome_capacity',
    OUTCOME_CAPACITY_MIN,
    OUTCOME_CAPACITY_MAX,
    OUTCOME_DECIMAL_PLACES,
  )
}

export function parseOutcomeResidualLiInput(raw: string): number | null {
  return parseOptionalMeasured(
    raw,
    'outcome_residual_li',
    OUTCOME_RESIDUAL_LI_MIN,
    OUTCOME_RESIDUAL_LI_MAX,
    OUTCOME_DECIMAL_PLACES,
  )
}
