/**
 * This-PC lot score loop. Writes JUDGMENT/ANALYSIS via local /predict-voting.
 * Does not INSERT issues (AWS analysis poller). Not started by AWS `npm run dev`.
 *
 *   npm run score-pc
 *   npx tsx scripts/run-score-worker.ts   (from backend/; SCORE_PROCESS=1)
 */
import '../src/loadRootEnv.js'

process.env.SCORE_PROCESS = '1'
process.env.AI_SERVICE_URL = (process.env.SCORE_AI_URL || 'http://127.0.0.1:8800').replace(
  /\/$/,
  '',
)

let running = false

function intervalMs(): number {
  const n = Number(process.env.SCORE_PC_INTERVAL_MS || 60_000)
  if (!Number.isFinite(n) || n < 5_000) return 60_000
  return Math.floor(n)
}

async function main(): Promise<void> {
  const lotService = await import('../src/services/lot.service.js')
  const { fillRiskReasonsForLots } = await import('../src/services/lotRiskReason.service.js')
  const { fillRecommendedActionsForLots } = await import(
    '../src/services/lotRecommendedAction.service.js'
  )
  const { pickUnscoredLotIds, splitAnalysisOnly } = await import(
    '../src/services/unscoredLots.js'
  )
  const { mariaDbPoolOptions } = await import('../src/db/config.js')

  async function tick(): Promise<void> {
    if (running) {
      console.log('[score-pc] skipped (already running)')
      return
    }
    running = true
    try {
      const picked = await pickUnscoredLotIds(200)
      const lotIds = picked.lotIds
      const { analysisOnlyIds, fullScoreIds } = splitAnalysisOnly(picked.rows)
      if (lotIds.length === 0) {
        console.log('[score-pc] nothing to score')
        return
      }
      console.log('[score-pc] score_start', {
        count: lotIds.length,
        analysis_only: analysisOnlyIds.length,
        full: fullScoreIds.length,
      })
      if (analysisOnlyIds.length > 0) {
        let rebuilt = 0
        for (const id of analysisOnlyIds) {
          if (await lotService.scoreAnalysisFromJudgment(id)) rebuilt++
        }
        console.log('[score-pc] analysis_only_done', { rebuilt })
      }
      let scoredLotIds = [...analysisOnlyIds]
      if (fullScoreIds.length > 0) {
        const scored = await lotService.scoreAllLots({
          lotIds: fullScoreIds,
          concurrency: 4,
        })
        console.log('[score-pc] score_done', {
          scored: scored.scored,
          failed: scored.failed,
          errors: scored.errors.slice(0, 3),
        })
        scoredLotIds = [...scoredLotIds, ...scored.lotIds]
      }
      if (scoredLotIds.length > 0) {
        try {
          const reasons = await fillRiskReasonsForLots(scoredLotIds, { concurrency: 2 })
          console.log('[score-pc] risk_reasons', reasons)
        } catch (err) {
          console.error('[score-pc] risk_reason_failed', err)
        }
        try {
          const actions = await fillRecommendedActionsForLots(scoredLotIds, {
            concurrency: 2,
          })
          console.log('[score-pc] recommended_actions', actions)
        } catch (err) {
          console.error('[score-pc] recommended_actions_failed', err)
        }
      }
      console.log('[score-pc] skip_issues (AWS poller)')
    } catch (err) {
      console.error('[score-pc] error', err)
    } finally {
      running = false
    }
  }

  const db = mariaDbPoolOptions()
  const ms = intervalMs()
  console.log('[score-pc] start', {
    interval_ms: ms,
    AI_SERVICE_URL: process.env.AI_SERVICE_URL,
    DB_HOST: db.host,
  })
  await tick()
  const timer = setInterval(() => {
    void tick()
  }, ms)
  const stop = () => {
    clearInterval(timer)
    console.log('[score-pc] stop')
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
