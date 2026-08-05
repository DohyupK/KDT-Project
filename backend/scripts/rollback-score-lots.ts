import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

/**
 * Rollback AI/SPC scores on analysis_lots (+ residual_li on judgment_lots)
 * and remove auto-seeded open issues created by ensureIssuesForRiskLots
 * (심각/주의, 접수, no assignee/action).
 */
async function main() {
  const beforeScores = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM analysis_lots WHERE scored_at IS NOT NULL`,
  )
  const beforeIssues = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM issues
     WHERE risk_level IN ('심각', '주의')
       AND status = '접수'
       AND assignee_user_id IS NULL
       AND (action_content IS NULL OR action_content = '')
       AND completed_at IS NULL`,
  )
  console.log('BEFORE', {
    scoredLots: Number(beforeScores[0]?.c || 0),
    autoIssues: Number(beforeIssues[0]?.c || 0),
  })

  const delResult = await query<unknown>(
    `DELETE FROM issues
     WHERE risk_level IN ('심각', '주의')
       AND status = '접수'
       AND assignee_user_id IS NULL
       AND (action_content IS NULL OR action_content = '')
       AND completed_at IS NULL`,
  )
  const deleted =
    delResult && typeof delResult === 'object' && 'affectedRows' in delResult
      ? Number((delResult as { affectedRows: number }).affectedRows)
      : delResult
  console.log('ISSUES_DELETED', deleted)

  await query(`UPDATE judgment_lots SET residual_li = NULL`)
  await query(
    `UPDATE analysis_lots SET
      defect_prob = NULL,
      spc_status = NULL,
      risk_level = '안정',
      risk_reason = NULL,
      clf_model_version = NULL,
      residual_model_version = NULL,
      spc_limit_version = NULL,
      scored_at = NULL`,
  )
  console.log('JUDGMENT_RESIDUAL_CLEARED')
  console.log('ANALYSIS_LOTS_SCORES_CLEARED')

  const afterScores = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM analysis_lots WHERE scored_at IS NOT NULL`,
  )
  const afterIssues = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM issues
     WHERE risk_level IN ('심각', '주의')
       AND status = '접수'
       AND assignee_user_id IS NULL
       AND (action_content IS NULL OR action_content = '')
       AND completed_at IS NULL`,
  )
  console.log('AFTER', {
    scoredLots: Number(afterScores[0]?.c || 0),
    autoIssues: Number(afterIssues[0]?.c || 0),
  })
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
