/**
 * Mirror SPC_LOT → lots (process only), then score new + unscored lots
 * (analysis_lots + judgment_lots NULL-only AI fill). Always re-seeds open
 * issues for risk_level=심각 after each tick.
 */
import { query } from '../db/connection.js'
import * as lotService from './lot.service.js'
import { fillRiskReasonsForLots } from './lotRiskReason.service.js'
import { fillRecommendedActionsForLots } from './lotRecommendedAction.service.js'

export type SyncSpcLotsOptions = {
  skipScore?: boolean
  concurrency?: number
  /** Max unscored lots to pick up per tick (no analysis row or probability IS NULL). */
  unscoredLimit?: number
  quiet?: boolean
}

export type SyncSpcLotsResult = {
  skipped: boolean
  table: string
  inserted: number
  scored: number
  failed: number
  issuesCreated: number
  reasonsUpdated: number
  actionsUpdated: number
  errors: string[]
}

let running = false

function spcTableName(): string {
  return (process.env.SPC_LOTS_TABLE || 'SPC_LOT').replace(/[^\w]/g, '')
}

type SpcRow = {
  lot_id: string
  produced_at: Date | string
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
}

function formatTs(v: Date | string): string {
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`
  }
  return String(v).replace('T', ' ').slice(0, 19)
}

function log(quiet: boolean | undefined, ...args: unknown[]) {
  if (!quiet) console.log(...args)
}

/**
 * Insert missing SPC_LOT rows into lots, then score inserted + unscored ids.
 * Concurrent calls while one run is in progress return `{ skipped: true }`.
 */
export async function syncSpcLotsToApp(
  opts: SyncSpcLotsOptions = {},
): Promise<SyncSpcLotsResult> {
  const table = spcTableName()
  const empty: SyncSpcLotsResult = {
    skipped: true,
    table,
    inserted: 0,
    scored: 0,
    failed: 0,
    issuesCreated: 0,
    reasonsUpdated: 0,
    actionsUpdated: 0,
    errors: [],
  }
  if (running) {
    log(opts.quiet, '[spc-sync] skipped (already running)')
    return empty
  }
  running = true

  try {
    const concurrency = Math.min(Math.max(opts.concurrency ?? 4, 1), 16)
    const unscoredLimit = Math.min(Math.max(opts.unscoredLimit ?? 100, 1), 500)
    const quiet = opts.quiet

    const missing = await query<SpcRow[]>(
      `SELECT s.lot_id, s.produced_at, s.d50, s.d90, s.metal_impurity, s.lithium_input,
              s.additive_ratio, s.process_time, s.sintering_temp, s.humidity, s.tank_pressure,
              s.operator_id
       FROM \`${table}\` s
       LEFT JOIN lots l ON l.id = s.lot_id
       WHERE l.id IS NULL AND s.lot_id IS NOT NULL
       ORDER BY s.produced_at ASC, s.lot_id ASC`,
    )

    log(quiet, '[spc-sync] missing', { table, count: missing.length })

    const inserted: string[] = []
    const CHUNK = 200
    for (let i = 0; i < missing.length; i += CHUNK) {
      const slice = missing.slice(i, i + CHUNK)
      const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
      const params: unknown[] = []
      for (const r of slice) {
        params.push(
          r.lot_id,
          formatTs(r.produced_at),
          r.d50,
          r.d90,
          r.metal_impurity,
          r.lithium_input,
          r.additive_ratio,
          r.process_time,
          r.sintering_temp,
          r.humidity,
          r.tank_pressure,
          r.operator_id,
        )
        inserted.push(r.lot_id)
      }
      await query(
        `INSERT INTO lots (
          id, \`timestamp\`, d50, d90, metal_impurity, lithium_input, additive_ratio,
          process_time, sintering_temp, humidity, tank_pressure, operator_id
        ) VALUES ${placeholders}`,
        params,
      )
    }
    if (inserted.length) log(quiet, '[spc-sync] inserted', inserted.length)

    if (opts.skipScore) {
      return {
        skipped: false,
        table,
        inserted: inserted.length,
        scored: 0,
        failed: 0,
        issuesCreated: 0,
        reasonsUpdated: 0,
        actionsUpdated: 0,
        errors: [],
      }
    }

    // Placeholder lot for handover notes (issue.service) — never score into analysis_lots.
    const SYS_HANDOVER_LOT_ID = 'LOT-SYS-HANDOVER'
    const unscoredRows = await query<{ id: string }[]>(
      `SELECT l.id
       FROM lots l
       LEFT JOIN analysis_lots a ON a.lot_id = l.id
       WHERE (a.lot_id IS NULL OR a.probability IS NULL)
         AND l.id <> ?
       ORDER BY l.\`timestamp\` ASC, l.id ASC
       LIMIT ?`,
      [SYS_HANDOVER_LOT_ID, unscoredLimit],
    )
    const scoreIds = [
      ...new Set(
        [...inserted, ...unscoredRows.map((r) => r.id)].filter((id) => id !== SYS_HANDOVER_LOT_ID),
      ),
    ]

    let scored = 0
    let failed = 0
    let reasonsUpdated = 0
    let actionsUpdated = 0
    const errors: string[] = []

    if (scoreIds.length > 0) {
      log(quiet, '[spc-sync] score_start', {
        lotIds: scoreIds.length,
        inserted: inserted.length,
        unscored: unscoredRows.length,
        concurrency,
      })
      const started = Date.now()
      let lastLog = 0
      const result = await lotService.scoreAllLots({
        lotIds: scoreIds,
        concurrency,
        onProgress: (done, total, lotId) => {
          if (quiet) return
          if (done - lastLog >= 20 || done === total) {
            lastLog = done
            console.log(`[spc-sync] progress ${done}/${total} last=${lotId}`)
          }
        },
      })
      log(
        quiet,
        '[spc-sync] score_done',
        JSON.stringify(result),
        `elapsed_ms=${Date.now() - started}`,
      )
      scored = result.scored
      failed = result.failed
      errors.push(...result.errors)

      try {
        const reasonResult = await fillRiskReasonsForLots(scoreIds, {
          concurrency: 2,
          quiet,
        })
        reasonsUpdated = reasonResult.updated
        log(quiet, '[spc-sync] risk_reasons', reasonResult)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        console.error('[spc-sync] risk_reason_failed', detail)
        errors.push(`risk_reason: ${detail}`)
      }

      try {
        const actionResult = await fillRecommendedActionsForLots(scoreIds, {
          concurrency: 2,
          quiet,
        })
        actionsUpdated = actionResult.updated
        log(quiet, '[spc-sync] recommended_actions', actionResult)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        console.error('[spc-sync] recommended_actions_failed', detail)
        errors.push(`recommended_actions: ${detail}`)
      }
    }

    // Always seed: already-scored 심각 lots must still get open issues.
    const issuesCreated = await lotService.ensureIssuesForRiskLots()
    if (issuesCreated) log(quiet, '[spc-sync] issues_created', issuesCreated)

    return {
      skipped: false,
      table,
      inserted: inserted.length,
      scored,
      failed,
      issuesCreated,
      reasonsUpdated,
      actionsUpdated,
      errors,
    }
  } finally {
    running = false
  }
}

export function isSpcLotSyncRunning(): boolean {
  return running
}
