/**
 * Measured outcome validation (EDA-based hard bounds).
 * Keep in sync with frontend/src/lib/outcomeBounds.ts
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

/** null = omit; otherwise finite number within [min,max] with exact `places` decimals. */
export function parseOptionalMeasured(
  raw: unknown,
  field: string,
  min: number,
  max: number,
  places: number,
): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
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

export function parseOutcomeCapacity(raw: unknown): number | null {
  return parseOptionalMeasured(
    raw,
    'outcome_capacity',
    OUTCOME_CAPACITY_MIN,
    OUTCOME_CAPACITY_MAX,
    OUTCOME_DECIMAL_PLACES,
  )
}

export function parseOutcomeResidualLi(raw: unknown): number | null {
  return parseOptionalMeasured(
    raw,
    'outcome_residual_li',
    OUTCOME_RESIDUAL_LI_MIN,
    OUTCOME_RESIDUAL_LI_MAX,
    OUTCOME_DECIMAL_PLACES,
  )
}
