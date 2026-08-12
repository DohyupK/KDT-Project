/**
 * Every 10 minutes: score lots missing analysis_lots (or null probability),
 * then fill risk_reason via local vLLM. Always re-seed open issues for 심각 lots
 * (even when there is nothing left to score). Complements per-insert syncSpcLots.
 */
import * as lotService from './lot.service.js'
import { fillRiskReasonsForLots } from './lotRiskReason.service.js'
import { pickUnscoredLotIds, splitAnalysisOnly } from './unscoredLots.js'

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

  let lotIds: string[] = []
  try {
    const picked = await pickUnscoredLotIds(200)
    lotIds = picked.lotIds
    const { analysisOnlyIds, fullScoreIds } = splitAnalysisOnly(picked.rows)
    if (lotIds.length === 0) {
      console.log('[analysis-sync] nothing to score')
    } else {
      console.log('[analysis-sync] score_start', {
        count: lotIds.length,
        queue_a: picked.reason.queue_a,
        queue_b: picked.reason.queue_b,
        analysis_only: analysisOnlyIds.length,
        full: fullScoreIds.length,
      })
      if (analysisOnlyIds.length > 0) {
        let rebuilt = 0
        for (const id of analysisOnlyIds) {
          if (await lotService.scoreAnalysisFromJudgment(id)) rebuilt++
        }
        console.log('[analysis-sync] analysis_only_done', { rebuilt })
      }
      if (fullScoreIds.length > 0) {
        const scored = await lotService.scoreAllLots({
          lotIds: fullScoreIds,
          concurrency: 4,
        })
        console.log('[analysis-sync] score_done', scored)
      }
    }
    const issuesCreated = await lotService.ensureIssuesForRiskLots()
    if (issuesCreated) console.log('[analysis-sync] issues_created', issuesCreated)
  } catch (err) {
    console.error('[analysis-sync] error', err)
  } finally {
    running = false
  }

  if (lotIds.length === 0) return
  try {
    const reasons = await fillRiskReasonsForLots(lotIds, { concurrency: 2 })
    console.log('[analysis-sync] risk_reasons', reasons)
  } catch (err) {
    console.error('[analysis-sync] risk_reason_failed', err)
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
