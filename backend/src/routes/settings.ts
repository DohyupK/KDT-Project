import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'

/**
 * Control bounds API wiring:
 *   Setting page (frontend) → GET/PUT /api/settings/control-bounds (this router)
 *     → writes SSOT file ai-service/config/control_bounds.json
 *     → ai-service agent/bounds_cache.py reloads by mtime
 *     → agent/whatif.py clips grid + boundary_hit
 * See docs/references/control-bounds-wiring.md
 */

export type AxisBounds = { min: number; max: number }
export type ControlBounds = {
  sintering_temp: AxisBounds
  humidity: AxisBounds
}

const DEFAULT_BOUNDS: ControlBounds = {
  sintering_temp: { min: 700, max: 850 },
  humidity: { min: 5, max: 95 },
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveBoundsPath(): string {
  if (process.env.CONTROL_BOUNDS_PATH) {
    return path.resolve(process.env.CONTROL_BOUNDS_PATH)
  }
  // backend/src/routes → repo/ai-service/config/control_bounds.json
  return path.resolve(__dirname, '../../../ai-service/config/control_bounds.json')
}

function normalize(raw: unknown): ControlBounds {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const axis = (key: keyof ControlBounds): AxisBounds => {
    const block = obj[key]
    const def = DEFAULT_BOUNDS[key]
    if (!block || typeof block !== 'object') return { ...def }
    const b = block as Record<string, unknown>
    let min = Number(b.min ?? def.min)
    let max = Number(b.max ?? def.max)
    if (!Number.isFinite(min)) min = def.min
    if (!Number.isFinite(max)) max = def.max
    if (min > max) {
      const t = min
      min = max
      max = t
    }
    return { min, max }
  }
  return {
    sintering_temp: axis('sintering_temp'),
    humidity: axis('humidity'),
  }
}

function readBounds(): ControlBounds {
  const filePath = resolveBoundsPath()
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_BOUNDS, null, 2) + '\n', 'utf8')
    return { ...DEFAULT_BOUNDS, sintering_temp: { ...DEFAULT_BOUNDS.sintering_temp }, humidity: { ...DEFAULT_BOUNDS.humidity } }
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
  return normalize(raw)
}

function writeBounds(bounds: ControlBounds): void {
  const filePath = resolveBoundsPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(bounds, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, filePath)
}

export const settingsRouter = Router()

settingsRouter.get('/settings/control-bounds', (_req, res) => {
  try {
    const bounds = readBounds()
    res.json({
      bounds,
      path: resolveBoundsPath(),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/settings/control-bounds]', detail)
    res.status(500).json({ error: detail })
  }
})

settingsRouter.put('/settings/control-bounds', (req, res) => {
  try {
    const body = req.body as { bounds?: ControlBounds } | ControlBounds
    const raw =
      body && typeof body === 'object' && 'bounds' in body && body.bounds
        ? body.bounds
        : (body as ControlBounds)
    const bounds = normalize(raw)
    if (bounds.sintering_temp.min >= bounds.sintering_temp.max) {
      res.status(400).json({ error: 'sintering_temp.min must be < max' })
      return
    }
    if (bounds.humidity.min >= bounds.humidity.max) {
      res.status(400).json({ error: 'humidity.min must be < max' })
      return
    }
    writeBounds(bounds)
    console.info(`[settings] control_bounds updated → ${resolveBoundsPath()}`)
    res.json({
      ok: true,
      bounds,
      path: resolveBoundsPath(),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[PUT /api/settings/control-bounds]', detail)
    res.status(500).json({ error: detail })
  }
})
