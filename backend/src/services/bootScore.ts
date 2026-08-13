/**
 * One-shot boot scoring after ai-service is ready.
 * Ensures SPC mirror + unscored lot scoring run on backend start
 * even if interval pollers are delayed/disabled mid-flight.
 */
import { syncSpcLotsToApp } from './spcLotSync.js'
import * as lotService from './lot.service.js'
import { pickUnscoredLotIds, splitAnalysisOnly } from './unscoredLots.js'

function bootScoreEnabled(): boolean {
  const v = (process.env.SCORE_ON_BOOT ?? '1').trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no')
}

/**
 * Run once at backend startup (after AI supervisor).
 * Path: SPC_LOT→lots + /predict-voting 3-stage score (risk_reason/issues via pollers).
 */
export async function runBootScoreOnce(): Promise<void> {
  if (!bootScoreEnabled()) {
    console.log('[boot-score] disabled (SCORE_ON_BOOT=0)')
    return
  }

  console.log('[boot-score] start')
  try {
    // Fast path: score only. risk_reason/issues are handled by analysis poller ticks.
    const sync = await syncSpcLotsToApp({
      concurrency: 4,
      unscoredLimit: 100,
      quiet: false,
      skipRiskReason: true,
      skipIssues: true,
    })
    console.log('[boot-score] spc_sync', {
      skipped: sync.skipped,
      inserted: sync.inserted,
      scored: sync.scored,
      failed: sync.failed,
    })

    // If SPC sync was skipped (lock), still try analysis-only / unscored path.
    if (sync.skipped) {
      const picked = await pickUnscoredLotIds(100)
      if (picked.lotIds.length === 0) {
        console.log('[boot-score] nothing unscored')
      } else {
        const { analysisOnlyIds, fullScoreIds } = splitAnalysisOnly(picked.rows)
        console.log('[boot-score] fallback_score', {
          count: picked.lotIds.length,
          analysis_only: analysisOnlyIds.length,
          full: fullScoreIds.length,
        })
        for (const id of analysisOnlyIds) {
          await lotService.scoreAnalysisFromJudgment(id)
        }
        if (fullScoreIds.length > 0) {
          const scored = await lotService.scoreAllLots({
            lotIds: fullScoreIds,
            concurrency: 4,
          })
          console.log('[boot-score] score_done', scored)
        }
      }
    }
  } catch (err) {
    console.error('[boot-score] error', err)
  }
  console.log('[boot-score] done')
}
