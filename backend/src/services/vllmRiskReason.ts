/**
 * Compose ANALYSIS_LOTS.risk_reason via local OpenAI-compatible vLLM
 * (CHAT_VLLM_BASE_URL) — same stack as security chat, no RAG.
 */
function vllmBaseUrl(): string {
  const raw = (
    process.env.CHAT_VLLM_BASE_URL ||
    process.env.VLLM_BASE_URL ||
    'http://127.0.0.1:8001/v1'
  ).trim()
  return raw.replace(/\/$/, '')
}

function vllmModel(): string {
  return (process.env.CHAT_VLLM_MODEL || process.env.VLLM_MODEL || 'local-model').trim()
}

const SYSTEM = `당신은 양극재 LOT 위험 사유를 짧게 적는 작성기입니다.
제공된 JSON 숫자·상태만 근거로 한국어 한두 문장을 씁니다.
규칙:
1. risk_level이 「안정」이고 spc_status도 문제 없음(안정)일 때만 「기준 범위 내」류로 짧게 적습니다.
2. risk_level이 「주의」또는 「심각」이면 절대 「기준 범위 내」라고 쓰지 말고,
   불량확률·잔류리튬·SPC 상태 등 주어진 값으로 왜 주의/심각인지 적습니다.
3. 수치를 지어내거나 Main LOT 클릭·What-if·사용법 안내를 하지 않습니다.
4. 255자 이내, 마크다운·코드펜스 없이 본문만.`

export type VllmRiskFacts = {
  lot_id: string
  probability?: number | null
  spc_status?: string | null
  risk_level?: string | null
  residual_li?: number | null
  capacity?: number | null
  quality_defect?: number | null
}

/** Reject LLM text that contradicts elevated risk_level. */
export function isRiskReasonAcceptable(
  riskLevel: string | null | undefined,
  text: string,
): boolean {
  const t = (text || '').trim()
  if (!t) return false
  const level = (riskLevel || '').trim()
  const elevated = level === '주의' || level === '심각' || level === '높음' || level === 'A' || level === 'B' || level === '중간'
  if (elevated && /기준\s*범위/.test(t)) return false
  return true
}

/** Deterministic fallback matching combineLotScore reason style. */
export function buildRuleRiskReason(facts: VllmRiskFacts): string {
  const reasons: string[] = []
  const prob = facts.probability
  const residual = facts.residual_li
  const spc = facts.spc_status
  const level = (facts.risk_level || '').trim()

  if (prob != null && Number.isFinite(prob) && prob >= 0.2) {
    reasons.push(`불량확률 ${(prob * 100).toFixed(1)}%`)
  }
  if (residual != null && Number.isFinite(residual) && residual >= 3000) {
    reasons.push(`잔류리튬 ${Number(residual).toFixed(1)}ppm`)
  }
  if (spc && spc !== '안정') {
    reasons.push(`SPC ${spc}`)
  }
  if (reasons.length === 0) {
    if (level === '주의' || level === '심각') {
      return `${level}: 모델·SPC 복합 신호`.slice(0, 255)
    }
    return '기준 범위 내'
  }
  return reasons.join(', ').slice(0, 255)
}

export async function composeRiskReasonViaVllm(
  facts: VllmRiskFacts,
): Promise<{ risk_reason: string; error: string | null; usedFallback?: boolean }> {
  const url = `${vllmBaseUrl()}/chat/completions`
  const timeoutMs = Number(process.env.SECURE_VLLM_TIMEOUT || 45) * 1000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 45_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: vllmModel(),
        temperature: 0.2,
        max_tokens: 120,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `다음 LOT 채점 결과로 risk_reason만 작성하세요.\n${JSON.stringify(facts)}`,
          },
        ],
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        risk_reason: '',
        error: `vllm ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = (data.choices?.[0]?.message?.content || '').trim()
    if (!content || /^[.:…·\-_/\\|*\s]+$/.test(content)) {
      return { risk_reason: '', error: 'empty_vllm_reply' }
    }
    const clipped = content.slice(0, 255)
    if (!isRiskReasonAcceptable(facts.risk_level, clipped)) {
      return {
        risk_reason: buildRuleRiskReason(facts),
        error: null,
        usedFallback: true,
      }
    }
    return { risk_reason: clipped, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { risk_reason: '', error: msg.slice(0, 300) }
  } finally {
    clearTimeout(timer)
  }
}

const ISSUE_SYSTEM = `당신은 양극재 LOT 이슈 제목/요약을 짧게 쓰는 작성기입니다.
주어진 risk_reason·위험도·LOT ID만 근거로 한국어 한 문장(이슈 내용)을 씁니다.
규칙:
1. 255자 이내, 마크다운·코드펜스 없이 본문만.
2. 수치를 지어내지 않습니다.
3. 「기준 범위 내」는 위험도가 주의/심각일 때 쓰지 않습니다.
4. LOT ID를 앞머리에 넣어도 됩니다.`

/**
 * Summarize analysis risk_reason into ISSUES.issue_content via local vLLM.
 * On failure the caller should fall back to buildIssueTitle.
 */
export async function composeIssueContentViaVllm(input: {
  lotId: string
  riskLevel: string
  riskReason: string
}): Promise<{ issue_content: string; error: string | null; usedFallback?: boolean }> {
  const url = `${vllmBaseUrl()}/chat/completions`
  const timeoutMs = Number(process.env.SECURE_VLLM_TIMEOUT || 45) * 1000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 45_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: vllmModel(),
        temperature: 0.2,
        max_tokens: 100,
        messages: [
          { role: 'system', content: ISSUE_SYSTEM },
          {
            role: 'user',
            content: `다음 JSON으로 issue_content 한 문장만 작성하세요.\n${JSON.stringify({
              lot_id: input.lotId,
              risk_level: input.riskLevel,
              risk_reason: input.riskReason,
            })}`,
          },
        ],
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        issue_content: '',
        error: `vllm ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = (data.choices?.[0]?.message?.content || '').trim()
    if (!content || /^[.:…·\-_/\\|*\s]+$/.test(content)) {
      return { issue_content: '', error: 'empty_vllm_reply' }
    }
    const clipped = content.slice(0, 255)
    if (!isRiskReasonAcceptable(input.riskLevel, clipped)) {
      return { issue_content: '', error: 'unacceptable_issue_content' }
    }
    return { issue_content: clipped, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { issue_content: '', error: msg.slice(0, 300) }
  } finally {
    clearTimeout(timer)
  }
}
