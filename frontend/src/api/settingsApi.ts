import { apiClient } from '@/api/axios'

/**
 * Setting ↔ Express ↔ ai-service bounds wiring:
 *   this module → GET/PUT /api/settings/control-bounds
 *   → backend writes ai-service/config/control_bounds.json
 *   → whatif bounds_cache (mtime) → clip + boundary_hit
 * See docs/references/control-bounds-wiring.md
 */

export type AxisBounds = { min: number; max: number }

export type ControlBounds = {
  sintering_temp: AxisBounds
  humidity: AxisBounds
}

export async function getControlBounds(): Promise<{
  bounds: ControlBounds
  path?: string
}> {
  const { data } = await apiClient.get<{ bounds: ControlBounds; path?: string }>(
    '/settings/control-bounds',
  )
  return data
}

export async function putControlBounds(bounds: ControlBounds): Promise<{
  ok: boolean
  bounds: ControlBounds
  path?: string
}> {
  const { data } = await apiClient.put<{
    ok: boolean
    bounds: ControlBounds
    path?: string
  }>('/settings/control-bounds', { bounds })
  return data
}
