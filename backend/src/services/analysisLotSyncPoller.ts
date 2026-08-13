/**
 * Every 10 minutes: score lots missing analysis_lots (or null probability),
 * then fill risk_reason via local vLLM. Always re-seed open issues for 심각 lots
 * (even when there is nothing left to score). Complements per-insert syncSpcLots.
 */
import { query } from '../db/connection.js'
import * as lotService from './lot.service.js'
import { fillRiskReasonsForLots } from './lotRiskReason.service.js'
import { fillRecommendedActionsForLots } from './lotRecommendedAction.service.js'

const SYS_HANDOVER = 'LOT-SYS-HANDOVER'

let timer: ReturnType<typeof setInterval> | null = null
let running = false

function envEnabled(): boolean {
  const v = (process.env.ANALYSIS_SYNC_ENABLED ?? '1').trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no')
}

function intervalMs(): number {
  const n = Number(process.env.ANALYSIS_SYNC_INTERVAL_MS || 600_000)
  if (!Number.isFinite(n) || n < 60_000) return 600_000
  return Math.floor(n)
}

async function tick() {
  if (running) {
    console.log('[analysis-sync] skipped (already running)')
    return
  }
  running = true
  try {
    const rows = await query<{ id: string }[]>(
      `SELECT l.id
       FROM lots l
       LEFT JOIN analysis_lots a ON a.lot_id = l.id
       WHERE (a.lot_id IS NULL OR a.probability IS NULL)
         AND l.id <> ?
       ORDER BY l.\`timestamp\` ASC, l.id ASC
       LIMIT 200`,
      [SYS_HANDOVER],
    )
    const lotIds = rows.map((r) => r.id)
    if (lotIds.length === 0) {
      console.log('[analysis-sync] nothing to score')
    } else {
      console.log('[analysis-sync] score_start', { count: lotIds.length })
      const scored = await lotService.scoreAllLots({
        lotIds,
        concurrency: 4,
      })
      console.log('[analysis-sync] score_done', scored)
      const reasons = await fillRiskReasonsForLots(lotIds, { concurrency: 2 })
      console.log('[analysis-sync] risk_reasons', reasons)
      const actions = await fillRecommendedActionsForLots(lotIds, { concurrency: 2 })
      console.log('[analysis-sync] recommended_actions', actions)
    }
    // Backfill issues for already-scored 심각 lots (seed is not scoring-dependent).
    const issuesCreated = await lotService.ensureIssuesForRiskLots()
    if (issuesCreated) console.log('[analysis-sync] issues_created', issuesCreated)
  } catch (err) {
    console.error('[analysis-sync] error', err)
  } finally {
    running = false
  }
}

export function startAnalysisLotSyncPoller(): void {
  if (!envEnabled()) {
    console.log('[analysis-sync] disabled (ANALYSIS_SYNC_ENABLED=0)')
    return
  }
  if (timer) return
  const ms = intervalMs()
  console.log(`[analysis-sync] started interval_ms=${ms}`)
  // First tick delayed slightly so SPC sync can run first on boot.
  setTimeout(() => {
    void tick()
  }, 15_000)
  timer = setInterval(() => {
    void tick()
  }, ms)
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    timer.unref()
  }
}

export function stopAnalysisLotSyncPoller(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
