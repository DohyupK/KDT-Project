/**
 * 1) DELETE all issues
 * 2) For every 심각+(주의|이탈)+risk_reason LOT, API_LLM summarize → INSERT
 *    Rate: 1 lot per INTERVAL_MS (default 10000)
 *
 * Usage: npx tsx scripts/fill-all-issue-content.ts
 * Env: ISSUE_FILL_INTERVAL_MS=10000
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import { listLlmKeysWithSecrets } from '../src/services/llmKeyStore.js'
import { proxyKnowledgeAnalyze } from '../src/services/aiProxy.js'
import { buildIssueTitle, normalizeRiskLevel } from '../src/services/lotScore.js'

const INTERVAL_MS = Math.max(
  0,
  Number(process.env.ISSUE_FILL_INTERVAL_MS || 10_000) || 10_000,
)

const COMPLETE_PROCESS_SQL = `l.d50 IS NOT NULL AND l.d90 IS NOT NULL AND l.metal_impurity IS NOT NULL
  AND l.lithium_input IS NOT NULL AND l.additive_ratio IS NOT NULL AND l.process_time IS NOT NULL
  AND l.sintering_temp IS NOT NULL AND l.humidity IS NOT NULL AND l.tank_pressure IS NOT NULL`

const SYSTEM_HINT = `당신은 공정 이슈 본문 작성기입니다.
입력된 risk_reason만 근거로 한국어 한 문장으로 짧게 요약합니다.
새 수치·원인을 지어내지 말고, LOT ID·마크다운·불릿 없이 본문만 출력합니다. 255자 이내.`

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatDateTime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function summarizeIssueContent(
  riskReason: string,
): Promise<{ text: string; provider: string | null; usedFallback?: boolean }> {
  const keys = listLlmKeysWithSecrets()
  if (!keys.length) {
    return { text: '', provider: null, usedFallback: true }
  }
  const message = `${SYSTEM_HINT}\n\nrisk_reason: ${riskReason}\n\n위 risk_reason만 issue_content로 짧게 요약하세요. 본문만.`
  try {
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
      return { text: '', provider: res.provider ?? null, usedFallback: true }
    }
    let text = res.reply.trim()
    text = text.replace(/^["「『]|["」』]$/g, '').trim()
    if (text.length > 255) text = text.slice(0, 255)
    return { text, provider: res.provider ?? null }
  } catch {
    return { text: '', provider: null, usedFallback: true }
  }
}

async function nextIssueId(day: string): Promise<string> {
  const last = await query<{ issue_id: string }[]>(
    `SELECT issue_id FROM ISSUES
     WHERE issue_id REGEXP ?
     ORDER BY issue_id DESC LIMIT 1`,
    [`^ISS-${day}-[0-9]{3}$`],
  )
  const seq = last[0]?.issue_id ? Number(last[0].issue_id.slice(-3)) + 1 : 1
  if (seq > 999) {
    throw new Error(`issue_id sequence overflow for day ${day}`)
  }
  return `ISS-${day}-${String(seq).padStart(3, '0')}`
}

async function main() {
  const before = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM ISSUES`)
  console.log('DELETE_BEFORE', Number(before[0]?.c ?? 0))
  await query(`DELETE FROM ISSUES`)
  const afterDel = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM ISSUES`)
  console.log('DELETE_AFTER', Number(afterDel[0]?.c ?? 0))

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
     FROM LOTS l
     INNER JOIN ANALYSIS_LOTS a ON a.lot_id = l.id
     WHERE a.risk_level = '심각'
       AND a.spc_status IN ('주의', '이탈')
       AND a.risk_reason IS NOT NULL AND TRIM(a.risk_reason) <> ''
       AND (${COMPLETE_PROCESS_SQL})
     ORDER BY l.\`timestamp\` ASC, l.id ASC`,
  )

  const total = lots.length
  const etaMin = Math.ceil((total * INTERVAL_MS) / 60_000)
  console.log('TOTAL', total, `interval_ms=${INTERVAL_MS}`, `eta_min≈${etaMin}`)

  let ok = 0
  let fallback = 0
  let failed = 0

  for (let i = 0; i < total; i++) {
    const lot = lots[i]
    const started = Date.now()
    const risk = normalizeRiskLevel(lot.risk_level)
    const reason = (lot.risk_reason || '').trim() || `${risk}: SPC ${lot.spc_status}`

    try {
      const ai = await summarizeIssueContent(reason)
      let text = ai.text
      let usedFallback = Boolean(ai.usedFallback) || !text
      if (!text) {
        text = buildIssueTitle(reason, lot.lot_id).slice(0, 255)
        usedFallback = true
      }

      const createdAt = formatDateTime(lot.recorded_at)
      const day = createdAt.slice(2, 10).replace(/-/g, '')
      const issueId = await nextIssueId(day)

      await query(
        `INSERT INTO ISSUES (issue_id, lot_id, issue_content, created_at)
         VALUES (?, ?, ?, ?)`,
        [issueId, lot.lot_id, text, createdAt],
      )

      if (usedFallback) fallback++
      else ok++

      console.log(
        `[${i + 1}/${total}] OK ${issueId} ${lot.lot_id} provider=${ai.provider ?? '-'} fallback=${usedFallback ? 1 : 0} ${text.slice(0, 80)}`,
      )
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[${i + 1}/${total}] FAIL ${lot.lot_id}`, msg.slice(0, 200))
    }

    if (i < total - 1 && INTERVAL_MS > 0) {
      const elapsed = Date.now() - started
      const wait = Math.max(0, INTERVAL_MS - elapsed)
      if (wait > 0) await sleep(wait)
    }
  }

  const finalCount = await query<{ c: number }[]>(`SELECT COUNT(*) AS c FROM ISSUES`)
  console.log('DONE', {
    total,
    ok,
    fallback,
    failed,
    issues_rows: Number(finalCount[0]?.c ?? 0),
  })
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
