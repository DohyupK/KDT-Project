/**
 * Smoke: pick 5 심각+(주의|이탈) lots with risk_reason,
 * summarize via api_llm (knowledge-analyze style), INSERT into issues.
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import { listLlmKeysWithSecrets } from '../src/services/llmKeyStore.js'
import { proxyKnowledgeAnalyze } from '../src/services/aiProxy.js'

const SYSTEM_HINT = `당신은 공정 이슈 본문 작성기입니다.
입력된 risk_reason만 근거로 한국어 한 문장으로 짧게 요약합니다.
새 수치·원인을 지어내지 말고, LOT ID·마크다운·불릿 없이 본문만 출력합니다. 255자 이내.`

async function summarizeIssueContent(riskReason: string): Promise<{ text: string; provider: string | null }> {
  const keys = listLlmKeysWithSecrets()
  if (!keys.length) {
    throw new Error('등록된 API 키가 없습니다. /security에서 LLM 키를 저장하세요.')
  }
  const message = `${SYSTEM_HINT}\n\nrisk_reason: ${riskReason}\n\n위 risk_reason만 issue_content로 짧게 요약하세요. 본문만.`
  const res = await proxyKnowledgeAnalyze({
    message,
    llm_mode: 'auto',
    llm_credentials: keys.map((k) => ({
      id: k.id,
      display_name: k.display_name,
      provider_kind: k.provider_kind,
      company: k.company,
      model: k.model,
      base_url: k.base_url,
      api_key: k.api_key,
      cost_score: k.cost_score,
    })),
  })
  if (res.error || !res.reply?.trim()) {
    throw new Error(
      `${res.error || 'empty_llm_reply'} (mode=${res.mode} provider=${res.provider ?? '-'})`,
    )
  }
  // Strip common wrappers
  let text = res.reply.trim()
  text = text.replace(/^["「『]|["」』]$/g, '').trim()
  if (text.length > 255) text = text.slice(0, 255)
  return { text, provider: res.provider ?? null }
}

function formatDateTime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function nextIssueId(day: string): Promise<string> {
  const last = await query<{ issue_id: string }[]>(
    `SELECT issue_id FROM issues
     WHERE issue_id REGEXP ?
     ORDER BY issue_id DESC LIMIT 1`,
    [`^ISS-${day}-[0-9]{3}$`],
  )
  const seq = last[0]?.issue_id ? Number(last[0].issue_id.slice(-3)) + 1 : 1
  return `ISS-${day}-${String(seq).padStart(3, '0')}`
}

async function main() {
  const lots = await query<
    {
      lot_id: string
      recorded_at: Date | string
      risk_level: string
      spc_status: string
      risk_reason: string
    }[]
  >(
    `SELECT l.id AS lot_id, l.\`timestamp\` AS recorded_at, a.risk_level, a.spc_status, a.risk_reason
     FROM lots l
     INNER JOIN analysis_lots a ON a.lot_id = l.id
     WHERE a.risk_level = '심각'
       AND a.spc_status IN ('주의', '이탈')
       AND a.risk_reason IS NOT NULL AND TRIM(a.risk_reason) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM issues i WHERE i.lot_id = l.id AND i.completed_at IS NULL
       )
     ORDER BY l.\`timestamp\` DESC
     LIMIT 5`,
  )

  console.log('CANDIDATES', lots.length)
  if (lots.length === 0) {
    // Fallback: any 심각+spc even without risk_reason
    const fallback = await query<
      {
        lot_id: string
        recorded_at: Date | string
        risk_level: string
        spc_status: string
        risk_reason: string | null
      }[]
    >(
      `SELECT l.id AS lot_id, l.\`timestamp\` AS recorded_at, a.risk_level, a.spc_status, a.risk_reason
       FROM lots l
       INNER JOIN analysis_lots a ON a.lot_id = l.id
       WHERE a.risk_level = '심각'
         AND a.spc_status IN ('주의', '이탈')
       ORDER BY l.\`timestamp\` DESC
       LIMIT 5`,
    )
    console.log('FALLBACK_CANDIDATES', fallback.length)
    for (const r of fallback) console.log(r)
    if (fallback.length === 0) {
      throw new Error('심각+(주의|이탈) LOT가 없습니다. score 후 다시 시도하세요.')
    }
  }

  const targets = lots.length > 0 ? lots : await query<
    {
      lot_id: string
      recorded_at: Date | string
      risk_level: string
      spc_status: string
      risk_reason: string | null
    }[]
  >(
    `SELECT l.id AS lot_id, l.\`timestamp\` AS recorded_at, a.risk_level, a.spc_status, a.risk_reason
     FROM lots l
     INNER JOIN analysis_lots a ON a.lot_id = l.id
     WHERE a.risk_level = '심각'
       AND a.spc_status IN ('주의', '이탈')
     ORDER BY l.\`timestamp\` DESC
     LIMIT 5`,
  )

  const created: { issue_id: string; lot_id: string; issue_content: string; risk_reason: string; provider: string | null }[] = []

  for (const lot of targets.slice(0, 5)) {
    const reason = (lot.risk_reason || '').trim() || `${lot.risk_level}: SPC ${lot.spc_status}`
    const { text, provider } = await summarizeIssueContent(reason)
    const createdAt = formatDateTime(lot.recorded_at)
    const day = createdAt.slice(2, 10).replace(/-/g, '')
    const issueId = await nextIssueId(day)

    await query(
      `INSERT INTO issues (issue_id, lot_id, issue_content, created_at)
       VALUES (?, ?, ?, ?)`,
      [issueId, lot.lot_id, text, createdAt],
    )
    created.push({
      issue_id: issueId,
      lot_id: lot.lot_id,
      issue_content: text,
      risk_reason: reason,
      provider,
    })
    console.log('OK', issueId, lot.lot_id, provider, text)
  }

  console.log('CREATED', JSON.stringify(created, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
