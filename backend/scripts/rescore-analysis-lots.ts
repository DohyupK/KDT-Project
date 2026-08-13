/**
 * One-shot: TRUNCATE analysis_lots → scoreAllLots → vLLM risk_reason → ensureIssues.
 * Usage: npx tsx scripts/rescore-analysis-lots.ts
 * Requires: ai-service + local vLLM for reasons (reasons fall back to rule text on failure).
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import * as lotService from '../src/services/lot.service.js'
import { fillRiskReasonsForLots } from '../src/services/lotRiskReason.service.js'
import { fillRecommendedActionsForLots } from '../src/services/lotRecommendedAction.service.js'

async function main() {
  const before = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM analysis_lots`,
  )
  console.log('ANALYSIS_BEFORE', Number(before[0]?.c ?? 0))

  await query(`DELETE FROM analysis_lots`)
  console.log('ANALYSIS_CLEARED')

  const lots = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM lots WHERE id <> 'LOT-SYS-HANDOVER'`,
  )
  console.log('LOTS_TO_SCORE', Number(lots[0]?.c ?? 0))

  console.log('SCORE_START')
  const started = Date.now()
  let lastLog = 0
  const scoreResult = await lotService.scoreAllLots({
    concurrency: 4,
    onProgress: (done, total, lotId) => {
      if (done - lastLog >= 50 || done === total) {
        lastLog = done
        console.log(`PROGRESS ${done}/${total} last=${lotId}`)
      }
    },
  })
  console.log(
    'SCORE_DONE',
    JSON.stringify(scoreResult),
    `elapsed_ms=${Date.now() - started}`,
  )

  console.log('RISK_REASON_START')
  const reasonStarted = Date.now()
  const reasonResult = await fillRiskReasonsForLots(undefined, {
    concurrency: 2,
  })
  console.log(
    'RISK_REASON_DONE',
    JSON.stringify(reasonResult),
    `elapsed_ms=${Date.now() - reasonStarted}`,
  )

  console.log('RECOMMENDED_ACTION_START')
  const actionStarted = Date.now()
  const actionResult = await fillRecommendedActionsForLots(scoreResult.lotIds, {
    concurrency: 2,
  })
  console.log(
    'RECOMMENDED_ACTION_DONE',
    JSON.stringify(actionResult),
    `elapsed_ms=${Date.now() - actionStarted}`,
  )

  const issuesCreated = await lotService.ensureIssuesForRiskLots()
  console.log('ISSUES_CREATED', issuesCreated)

  const after = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM analysis_lots`,
  )
  const sample = await query<
    {
      lot_id: string
      probability: number | null
      spc_status: string | null
      risk_level: string | null
      risk_reason: string | null
    }[]
  >(
    `SELECT lot_id, probability, spc_status, risk_level, risk_reason
     FROM analysis_lots
     ORDER BY lot_id DESC
     LIMIT 5`,
  )
  console.log('ANALYSIS_AFTER', Number(after[0]?.c ?? 0))
  console.log('SAMPLE', JSON.stringify(sample, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
