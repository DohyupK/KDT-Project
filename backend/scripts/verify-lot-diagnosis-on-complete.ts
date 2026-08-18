/**
 * One-shot: mock ISSUES complete → background lot diagnosis → print analysis_content.
 * Cleans up the mock ISSUES row and the test AI_LIBRARY_ANALYSIS row.
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import { getLibraryAnalysisByLotId } from '../src/services/knowledgeAnalyze.service.js'
import { updateIssue } from '../src/services/issue.service.js'

const POLL_MS = 2000
const MAX_WAIT_MS = 90_000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const lots = await query<{ id: string }[]>(
    `SELECT l.id
     FROM LOTS l
     LEFT JOIN AI_LIBRARY_ANALYSIS a ON a.lot_id = l.id
     WHERE a.id IS NULL
     ORDER BY l.\`timestamp\` DESC
     LIMIT 1`,
  )
  const lotId = lots[0]?.id
  if (!lotId) {
    throw new Error('No LOT without AI_LIBRARY_ANALYSIS.lot_id')
  }

  const users = await query<{ user_id: string; name: string }[]>(
    `SELECT user_id, name FROM USERS ORDER BY created_at DESC LIMIT 1`,
  )
  const actor = users[0]
  if (!actor) {
    throw new Error('No USERS row for updateIssue actor')
  }

  const issueId = `ISS-MOCK-${Date.now()}`.slice(0, 32)
  await query(
    `INSERT INTO ISSUES (issue_id, lot_id, issue_content, action_content, created_at)
     VALUES (?, ?, ?, NULL, NOW())`,
    [issueId, lotId, '목업 완료-진단 테스트'],
  )
  console.log('INSERTED', issueId, 'lot', lotId)

  try {
    const saved = await updateIssue(
      issueId,
      { completed: true, actionContent: '목업 조치' },
      { userId: actor.user_id, name: actor.name },
    )
    console.log('COMPLETED', saved.issueId, 'completedAt', saved.completedAt)

    const started = Date.now()
    let content = ''
    while (Date.now() - started < MAX_WAIT_MS) {
      const snap = await getLibraryAnalysisByLotId(lotId)
      if (snap?.analysisContent?.trim()) {
        content = snap.analysisContent.trim()
        break
      }
      await sleep(POLL_MS)
    }

    if (!content) {
      throw new Error(`no analysis_content for lot_id=${lotId} after ${MAX_WAIT_MS}ms`)
    }
    console.log('ANALYSIS_LEN', content.length)
    console.log('ANALYSIS_HEAD', content.slice(0, 400))
  } finally {
    await query(`DELETE FROM AI_LIBRARY_ANALYSIS WHERE lot_id = ?`, [lotId])
    await query(`DELETE FROM ISSUES WHERE issue_id = ?`, [issueId])
    console.log('CLEANED', issueId, lotId)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
