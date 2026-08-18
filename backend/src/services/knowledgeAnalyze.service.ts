import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import { proxyKnowledgeAnalyze } from './aiProxy.js'
import { listLlmKeysWithSecrets } from './llmKeyStore.js'
import { getLotById, type LotDto } from './lot.service.js'

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

export type LibraryAnalysisSnapshot = {
  id: number
  analysisContent: string
  createdAt: string
}

type AnalysisRow = {
  id: number | bigint
  analysis_content: string
  created_at: Date | string
}

function isDupEntry(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  return e.code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(e.message || '')
}

function formatCreatedAt(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString()
  if (value) return String(value)
  return new Date().toISOString()
}

function toSnapshot(row: AnalysisRow): LibraryAnalysisSnapshot {
  return {
    id: Number(row.id),
    analysisContent: row.analysis_content,
    createdAt: formatCreatedAt(row.created_at),
  }
}

function cachedResult(
  snap: LibraryAnalysisSnapshot,
  extras?: { mode?: string; provider?: string | null; error?: string | null },
): KnowledgeAnalyzeResult {
  return {
    id: snap.id,
    reply: snap.analysisContent,
    created_at: snap.createdAt,
    mode: extras?.mode ?? 'cached',
    provider: extras?.provider ?? null,
    error: extras?.error ?? null,
  }
}

export async function getLibraryAnalysisByLotId(
  lotId: string,
): Promise<LibraryAnalysisSnapshot | null> {
  const rows = await query<AnalysisRow[]>(
    `SELECT id, analysis_content, created_at
     FROM AI_LIBRARY_ANALYSIS
     WHERE lot_id = ?
     LIMIT 1`,
    [lotId],
  )
  return rows[0] ? toSnapshot(rows[0]) : null
}

async function callApiLlm(message: string): Promise<{
  reply: string
  mode: string
  provider: string | null
  error: string | null
}> {
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

  return {
    reply,
    mode: ai.mode,
    provider: ai.provider ?? ai.mode ?? null,
    error: ai.error ?? null,
  }
}

function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '-'
  return String(v)
}

function buildLotDiagnosisPrompt(issue: {
  issueId: string
  issueContent: string
  actionContent: string | null
  lotId: string
}, lot: LotDto | null): string {
  const lotLines = lot
    ? [
        `timestamp=${lot.recordedAt || '-'}`,
        `d50=${fmtNum(lot.d50)}`,
        `d90=${fmtNum(lot.d90)}`,
        `metal_impurity=${fmtNum(lot.metalImpurity)}`,
        `lithium_input=${fmtNum(lot.lithiumInput)}`,
        `additive_ratio=${fmtNum(lot.additiveRatio)}`,
        `process_time=${fmtNum(lot.processTime)}`,
        `sintering_temp=${fmtNum(lot.sinteringTemp)}`,
        `humidity=${fmtNum(lot.humidity)}`,
        `tank_pressure=${fmtNum(lot.tankPressure)}`,
        `operator_id=${lot.operatorId || '-'}`,
        `probability=${fmtNum(lot.defectProb)}`,
        `residual_li=${fmtNum(lot.residualLithium)}`,
        `spc_status=${lot.spcStatus || '-'}`,
        `risk_level=${lot.riskLevel}`,
        `risk_reason=${lot.riskReason || '-'}`,
      ].join(', ')
    : 'LOT 행 없음'

  return `완료 이슈 "${issue.issueContent}"(이슈 ID: ${issue.issueId}, LOT: ${issue.lotId})를 검토해 주세요. 다른 완료 이슈와의 유사 가능성과 대안 조치 방안을 한국어로 간결하게 설명하세요. 이슈 상세: ${issue.actionContent || '기록 없음'}
LOT 공정·채점: ${lotLines}`
}

export async function runKnowledgeAnalyze(
  input: KnowledgeAnalyzeInput,
): Promise<KnowledgeAnalyzeResult> {
  const message = (input.message || '').trim()
  if (!message) {
    throw new AppError(400, 'message is required')
  }

  const ai = await callApiLlm(message)
  const name = (input.name || input.userId).slice(0, 50)
  let insertId: number
  try {
    const result = (await query(
      `INSERT INTO AI_LIBRARY_ANALYSIS (user_id, name, lot_id, analysis_content)
       VALUES (?, ?, NULL, ?)`,
      [input.userId, name, ai.reply],
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

  return {
    id: insertId,
    reply: ai.reply,
    created_at: formatCreatedAt(rows[0]?.created_at),
    mode: ai.mode,
    provider: ai.provider,
    error: ai.error,
  }
}

/** Idempotent LOT diagnosis: return cache or generate once via API_LLM. */
export async function runLotDiagnosisAnalyze(lotIdRaw: string): Promise<KnowledgeAnalyzeResult> {
  const lotId = (lotIdRaw || '').trim()
  if (!lotId) {
    throw new AppError(400, 'lotId is required')
  }

  const cached = await getLibraryAnalysisByLotId(lotId)
  if (cached) return cachedResult(cached)

  const issueRows = await query<
    {
      issue_id: string
      issue_content: string
      action_content: string | null
      lot_id: string
    }[]
  >(
    `SELECT issue_id, issue_content, action_content, lot_id
     FROM ISSUES
     WHERE lot_id = ? AND completed_at IS NOT NULL
     ORDER BY completed_at DESC, created_at DESC
     LIMIT 1`,
    [lotId],
  )
  const issue = issueRows[0]
  if (!issue) {
    throw new AppError(404, '해당 LOT의 완료 이슈(과거 자료)를 찾을 수 없습니다.')
  }

  let lot: LotDto | null = null
  try {
    lot = await getLotById(lotId)
  } catch (err) {
    if (!(err instanceof AppError) || err.statusCode !== 404) throw err
  }

  const ai = await callApiLlm(
    buildLotDiagnosisPrompt(
      {
        issueId: issue.issue_id,
        issueContent: issue.issue_content,
        actionContent: issue.action_content,
        lotId: issue.lot_id,
      },
      lot,
    ),
  )

  try {
    const result = (await query(
      `INSERT INTO AI_LIBRARY_ANALYSIS (user_id, name, lot_id, analysis_content)
       VALUES (NULL, NULL, ?, ?)`,
      [lotId, ai.reply],
    )) as { insertId?: number | bigint }
    const insertId = Number(result?.insertId ?? 0)
    if (!insertId) {
      throw new AppError(500, '분석 결과 저장 실패: insertId 없음')
    }
    const rows = await query<{ created_at: Date | string }[]>(
      `SELECT created_at FROM AI_LIBRARY_ANALYSIS WHERE id = ? LIMIT 1`,
      [insertId],
    )
    return {
      id: insertId,
      reply: ai.reply,
      created_at: formatCreatedAt(rows[0]?.created_at),
      mode: ai.mode,
      provider: ai.provider,
      error: ai.error,
    }
  } catch (err) {
    if (isDupEntry(err)) {
      const again = await getLibraryAnalysisByLotId(lotId)
      if (again) return cachedResult(again, { mode: ai.mode, provider: ai.provider, error: ai.error })
    }
    if (err instanceof AppError) throw err
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/knowledge/analyze] lot_insert_failed:', detail)
    throw new AppError(500, `분석 결과 저장 실패: ${detail}`)
  }
}
