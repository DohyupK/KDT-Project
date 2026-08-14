/**
 * Mirror SPC_LOT → lots (process only), then score new + unscored lots
 * (analysis_lots + judgment_lots + lot_results NULL-fill).
 *
 * Priority: judgment/analysis/scored_at/missing LR (newest) then LR field backfill.
 * risk_reason runs after the sync lock is released.
 */
import { query } from '../db/connection.js'
import * as lotService from './lot.service.js'
import { fillRiskReasonsForLots } from './lotRiskReason.service.js'
import { fillRecommendedActionsForLots } from './lotRecommendedAction.service.js'
import { pickUnscoredLotIds, SYS_HANDOVER_LOT_ID } from './unscoredLots.js'
import { dispatchNewRiskTopIssueReports } from './issueReportN8n.js'

export type SyncSpcLotsOptions = {
  skipScore?: boolean
  /** Skip vLLM risk_reason fill (boot kick / tests). */
  skipRiskReason?: boolean
  /** Skip ensureIssuesForRiskLots (boot kick can leave issues to poller). */
  skipIssues?: boolean
  concurrency?: number
  /** Max unscored lots to pick up per tick. */
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
};
  if (running) {
    log(opts.quiet, '[spc-sync] skipped (already running)')
    return {
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
  }
  running = true

  let scoreIds: string[] = []
  let skipRiskReason = Boolean(opts.skipRiskReason)
  let skipIssues = Boolean(opts.skipIssues)
  let scored = 0
  let failed = 0
  let issuesCreated = 0
  let insertedCount = 0
  let reasonsUpdated = 0;
let actionsUpdated = 0
  const errors: string[] = []
  const quiet = opts.quiet

  try {
    const concurrency = Math.min(Math.max(opts.concurrency ?? 4, 1), 16)
    const unscoredLimit = Math.min(Math.max(opts.unscoredLimit ?? 100, 1), 500)

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
    insertedCount = inserted.length
    if (inserted.length) log(quiet, '[spc-sync] inserted', inserted.length)

    if (opts.skipScore) {
      skipRiskReason = true
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

    const picked = await pickUnscoredLotIds(unscoredLimit)
    scoreIds = [
      ...new Set(
        [...inserted, ...picked.lotIds].filter((id) => id !== SYS_HANDOVER_LOT_ID),
      ),
    ]

// Variables already declared earlier; reuse them.
// (No redeclaration needed)
    if (scoreIds.length > 0) {
      log(quiet, '[spc-sync] score_start', {
        lotIds: scoreIds.length,
        inserted: inserted.length,
        unscored: picked.rows.length,
        queue_a: picked.reason.queue_a,
        queue_b: picked.reason.queue_b,
        concurrency,
      })
      const started = Date.now()
      let lastLog = 0
      const scoreResult = await lotService.scoreAllLots({
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
        JSON.stringify(scoreResult),
        `elapsed_ms=${Date.now() - started}`,
      )
      scored = scoreResult.scored
      failed = scoreResult.failed
      errors.push(...scoreResult.errors)

      if (!skipRiskReason) {
        try {
          const reasonResult = await fillRiskReasonsForLots(scoreIds, {
            concurrency: 2,
            quiet,
          })
          reasonsUpdated = reasonResult.updated
          log(quiet, '[spc-sync] risk_reasons', reasonResult)
        } catch (err: unknown) {
          const detail = err instanceof Error ? err.message : String(err)
          console.error('[spc-sync] risk_reason_failed', detail)
          errors.push(`risk_reason: ${detail}`)
        }
      }

      try {
        const actionResult = await fillRecommendedActionsForLots(scoreIds, {
          concurrency: 2,
          quiet,
        })
        actionsUpdated = actionResult.updated
        log(quiet, '[spc-sync] recommended_actions', actionResult)
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err)
        console.error('[spc-sync] recommended_actions_failed', detail)
        errors.push(`recommended_actions: ${detail}`)
      }
    }

    // Seed open issues for 심각 lots unless explicitly skipped.
    if (!skipIssues) {
      issuesCreated = await lotService.ensureIssuesForRiskLots()
      if (issuesCreated) log(quiet, '[spc-sync] issues_created', issuesCreated)
      try {
        const mailed = await dispatchNewRiskTopIssueReports()
        if (mailed.enabled && (mailed.inserted || mailed.baseline)) {
          log(quiet, '[spc-sync] issue_reports', mailed)
        }
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err)
        console.error('[spc-sync] issue_reports_failed', detail)
        errors.push(`issue_reports: ${detail}`)
      }
    }
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
