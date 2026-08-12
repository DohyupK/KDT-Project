/**
 * Periodic score for lots missing analysis / judgment / lot_results / scored_at.
 * Complements per-insert syncSpcLots. Started after ai-service health (index.ts).
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
    if (lotIds.length === 0) {
      console.log('[analysis-sync] nothing to score')
      return
    }

    const { analysisOnlyIds, fullScoreIds } = splitAnalysisOnly(picked.rows)
    console.log('[analysis-sync] score_start', {
      count: lotIds.length,
      analysis_only: analysisOnlyIds.length,
      full: fullScoreIds.length,
      reason: picked.reason,
    })

    let analysisOnlyOk = 0
    const fullIds = [...fullScoreIds]
    for (const id of analysisOnlyIds) {
      const ok = await lotService.scoreAnalysisFromJudgment(id)
      if (ok) analysisOnlyOk++
      else fullIds.push(id)
    }
    if (analysisOnlyOk) {
      console.log('[analysis-sync] analysis_from_judgment', { ok: analysisOnlyOk })
    }

    const scored =
      fullIds.length > 0
        ? await lotService.scoreAllLots({
            lotIds: fullIds,
            concurrency: 4,
          })
        : { scored: 0, failed: 0, errors: [] as string[] }
    console.log('[analysis-sync] score_done', scored)

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
