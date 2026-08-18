/**
 * Re-score JUDGMENT/ANALYSIS probability from a LOT date (default 2026-08-13).
 * Nulls JUDGMENT_LOTS.probability only, then scoreAllLots so COALESCE fills p_blend.
 * Does not TRUNCATE analysis. Skips vLLM reasons/issues unless --with-reasons.
 *
 *   npx tsx scripts/rescore-probability-from.ts
 *   npx tsx scripts/rescore-probability-from.ts --from=2026-08-13
 *   npx tsx scripts/rescore-probability-from.ts --from=2026-08-13 --with-reasons
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import * as lotService from '../src/services/lot.service.js'
import { fillRiskReasonsForLots } from '../src/services/lotRiskReason.service.js'
import { fillRecommendedActionsForLots } from '../src/services/lotRecommendedAction.service.js'

const HANDOVER = 'LOT-SYS-HANDOVER'

function argValue(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  return hit ? hit.slice(name.length + 1) : fallback
}

async function main() {
  const fromDay = argValue('--from', '2026-08-13')
  const withReasons = process.argv.includes('--with-reasons')
  const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='))
  const concurrency = concurrencyArg ? Number(concurrencyArg.split('=')[1]) : 4
  const fromTs = `${fromDay} 00:00:00`

  const rows = await query<{ id: string }[]>(
    `SELECT id FROM LOTS
     WHERE \`timestamp\` >= ?
       AND id <> ?
     ORDER BY \`timestamp\` ASC, id ASC`,
    [fromTs, HANDOVER],
  )
  const lotIds = rows.map((r) => r.id)
  console.log('FROM', fromDay, 'LOT_COUNT', lotIds.length)
  if (lotIds.length === 0) {
    console.log('NOTHING_TO_SCORE')
    return
  }

  const nulled = await query<{ affectedRows?: number }>(
    `UPDATE JUDGMENT_LOTS j
     INNER JOIN LOTS l ON l.id = j.lot_id
     SET j.probability = NULL
     WHERE l.\`timestamp\` >= ?
       AND l.id <> ?`,
    [fromTs, HANDOVER],
  )
  console.log('JUDGMENT_PROB_NULLED', nulled)

  console.log('SCORE_START', { concurrency, withReasons })
  const started = Date.now()
  let lastLog = 0
  const result = await lotService.scoreAllLots({
    lotIds,
    concurrency: Number.isFinite(concurrency) ? concurrency : 4,
    onProgress: (done, total, lotId) => {
      if (done - lastLog >= 50 || done === total) {
        lastLog = done
        console.log(`PROGRESS ${done}/${total} last=${lotId}`)
      }
    },
  })
  console.log('SCORE_DONE', JSON.stringify(result), `elapsed_ms=${Date.now() - started}`)

  const sample = await query<
    { lot_id: string; j_prob: number | null; a_prob: number | null }[]
  >(
    `SELECT j.lot_id, j.probability AS j_prob, a.probability AS a_prob
     FROM JUDGMENT_LOTS j
     LEFT JOIN ANALYSIS_LOTS a ON a.lot_id = j.lot_id
     INNER JOIN LOTS l ON l.id = j.lot_id
     WHERE l.\`timestamp\` >= ?
       AND l.id <> ?
     ORDER BY j.lot_id DESC
     LIMIT 8`,
    [fromTs, HANDOVER],
  )
  console.log('SAMPLE', JSON.stringify(sample))

  if (!withReasons) {
    console.log('SKIP_REASONS_ISSUES')
    return
  }

  if (result.lotIds.length > 0) {
    const reasonResult = await fillRiskReasonsForLots(result.lotIds, { concurrency: 2 })
    console.log('RISK_REASON_DONE', JSON.stringify(reasonResult))
    const actionResult = await fillRecommendedActionsForLots(result.lotIds, {
      concurrency: 2,
    })
    console.log('RECOMMENDED_ACTION_DONE', JSON.stringify(actionResult))
  }
  const issuesCreated = await lotService.ensureIssuesForRiskLots()
  console.log('ISSUES_CREATED', issuesCreated)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
