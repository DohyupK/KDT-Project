/**
 * Periodic score for lots missing ANALYSIS / JUDGMENT / LOT_RESULTS / scored_at.
 * Complements per-insert syncSpcLots. Started after ai-service health (index.ts).
 */
import * as lotService from './lot.service.js'
import { fillRiskReasonsForLots } from './lotRiskReason.service.js'
import { pickUnscoredLotIds, splitAnalysisOnly } from './unscoredLots.js'
import { dispatchNewRiskTopIssueReports } from './issueReportN8n.js'
import { lotScoreOnAws } from './lotScoreRole.js'

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
    if (!lotScoreOnAws()) {
      console.log('[analysis-sync] skip score (LOT_SCORE_ON_AWS=0) — issues/mail only')
    } else {
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
    }
  } catch (err) {
    console.error('[analysis-sync] error', err)
  } finally {
    running = false
  }

  if (lotScoreOnAws() && lotIds.length > 0) {
    try {
      const reasons = await fillRiskReasonsForLots(lotIds, { concurrency: 2 })
      console.log('[analysis-sync] risk_reasons', reasons)
    } catch (err) {
      console.error('[analysis-sync] risk_reason_failed', err)
    }
  }

  try {
    const issuesCreated = await lotService.ensureIssuesForRiskLots()
    if (issuesCreated) console.log('[analysis-sync] issues_created', issuesCreated)
  } catch (err) {
    console.error('[analysis-sync] issues_failed', err)
  }

  try {
    const mailed = await dispatchNewRiskTopIssueReports()
    if (mailed.enabled && (mailed.inserted || mailed.baseline)) {
      console.log('[analysis-sync] issue_reports', mailed)
    }
  } catch (err) {
    console.error('[analysis-sync] issue_reports_failed', err)
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
  // Immediate tick on backend boot so unscored lots are scored without waiting.
  void tick()
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
