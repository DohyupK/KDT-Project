import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import { proxyKnowledgeAnalyze } from './aiProxy.js'
import { listLlmKeysWithSecrets } from './llmKeyStore.js'

const MAX_MESSAGE_CHARS = 24_000

export type KnowledgeAnalyzeInput = {
  message: string
  userId: string
  name: string
}

export type KnowledgeAnalyzeResult = {
  id: number
  reply: string
  created_at: string
  mode: string
  provider: string | null
  error: string | null
}

export async function runKnowledgeAnalyze(
  input: KnowledgeAnalyzeInput,
): Promise<KnowledgeAnalyzeResult> {
  const message = (input.message || '').trim()
  if (!message) {
    throw new AppError(400, 'message is required')
  }
  const clipped =
    message.length > MAX_MESSAGE_CHARS ? message.slice(0, MAX_MESSAGE_CHARS) : message

  let llm_credentials: Awaited<ReturnType<typeof listLlmKeysWithSecrets>> = []
  try {
    llm_credentials = listLlmKeysWithSecrets()
  } catch (err) {
    console.warn(
      '[POST /api/knowledge/analyze] llm keys unavailable:',
      err instanceof Error ? err.message : err,
    )
  }

  let ai: Awaited<ReturnType<typeof proxyKnowledgeAnalyze>>
  try {
    ai = await proxyKnowledgeAnalyze({
      message: clipped,
      llm_mode: 'auto',
      llm_credentials: llm_credentials.map((k) => ({
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
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/knowledge/analyze] proxy_failed:', detail)
    throw new AppError(502, `LLM 요청 실패: ${detail}`)
  }

  const reply = (ai.reply ?? '').trim()
  if (!reply) {
    console.warn(
      '[POST /api/knowledge/analyze] empty_or_ai_error:',
      `error=${ai.error ?? 'null'}`,
      `mode=${ai.mode ?? 'unknown'}`,
    )
    throw new AppError(502, ai.error || 'LLM 응답이 비어 있습니다.')
  }

  if (ai.error) {
    console.warn('[POST /api/knowledge/analyze] ai.error:', ai.error)
  }

  const name = (input.name || input.userId).slice(0, 50)
  let insertId: number
  try {
    const result = (await query(
      `INSERT INTO AI_LIBRARY_ANALYSIS (user_id, name, analysis_content)
       VALUES (?, ?, ?)`,
      [input.userId, name, reply],
    )) as { insertId?: number | bigint }
    insertId = Number(result?.insertId ?? 0)
    if (!insertId) {
      throw new AppError(500, '분석 결과 저장 실패: insertId 없음')
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/knowledge/analyze] insert_failed:', detail)
    throw new AppError(500, `분석 결과 저장 실패: ${detail}`)
  }

  const rows = await query<{ created_at: Date | string }[]>(
    `SELECT created_at FROM AI_LIBRARY_ANALYSIS WHERE id = ? LIMIT 1`,
    [insertId],
  )
  const createdRaw = rows[0]?.created_at
  const created_at =
    createdRaw instanceof Date
      ? createdRaw.toISOString()
      : createdRaw
        ? String(createdRaw)
        : new Date().toISOString()

  return {
    id: insertId,
    reply,
    created_at,
    mode: ai.mode,
    provider: ai.provider ?? ai.mode ?? null,
    error: ai.error ?? null,
  }
}
