/**
 * Encrypted LLM API keys stored under ai-service/DB (not backend/data).
 * Logic (encrypt/CRUD) lives in Express; only the sqlite file path is in ai-service.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

export type LlmProviderKind =
  | 'openai_compatible'
  | 'gemini'
  | 'anthropic'

export type LlmKeyRecord = {
  id: string
  display_name: string
  provider_kind: LlmProviderKind
  /** Company preset id for Auto pricing: groq | openai | deepseek | gemini | xai | nvidia | anthropic | custom */
  company: string
  model: string
  base_url: string | null
  key_last4: string
  cost_score: number
  created_at: string
}

export type LlmKeySecret = LlmKeyRecord & {
  api_key: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Default: <repo>/ai-service/DB/llm_keys.sqlite */
export function defaultLlmKeysDbPath(): string {
  return path.resolve(__dirname, '../../../ai-service/DB/llm_keys.sqlite')
}

function dbPath(): string {
  return process.env.LLM_KEYS_SQLITE_PATH || defaultLlmKeysDbPath()
}

let sqliteDb: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (sqliteDb) return sqliteDb
  const p = dbPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  sqliteDb = new DatabaseSync(p)
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS llm_api_keys (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      provider_kind TEXT NOT NULL,
      company TEXT NOT NULL,
      model TEXT NOT NULL,
      base_url TEXT,
      key_last4 TEXT NOT NULL,
      cost_score REAL NOT NULL DEFAULT 1,
      ciphertext BLOB NOT NULL,
      iv BLOB NOT NULL,
      tag BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return sqliteDb
}

function deriveKey(): Buffer {
  const secret = (process.env.LLM_KEYS_ENCRYPTION_KEY || '').trim()
  if (!secret || secret.length < 16) {
    throw new Error(
      'LLM_KEYS_ENCRYPTION_KEY missing or too short (min 16 chars). Set in backend/.env',
    )
  }
  return scryptSync(secret, 'kdt-llm-keys-v1', 32)
}

function encrypt(plain: string): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext, iv, tag }
}

function decrypt(ciphertext: Buffer, iv: Buffer, tag: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/** Default cost_score from 2026-07 reference table (blended ~0.4*in+0.6*out). */
export const COMPANY_COST_DEFAULTS: Record<string, number> = {
  groq: 0.068,
  nvidia: 0.11,
  deepseek: 0.224,
  gemini: 0.28,
  openai: 0.42,
  xai: 2.0,
  anthropic: 6.8,
  custom: 1.0,
}

export function detectCompanyFromKey(apiKey: string): string {
  const k = apiKey.trim()
  if (k.startsWith('gsk_')) return 'groq'
  if (k.startsWith('sk-ant-')) return 'anthropic'
  if (k.startsWith('AIza')) return 'gemini'
  if (k.startsWith('nvapi-') || k.startsWith('nvapi_')) return 'nvidia'
  if (k.startsWith('xai-')) return 'xai'
  if (k.startsWith('sk-')) return 'openai'
  return 'custom'
}

export function kindForCompany(company: string): LlmProviderKind {
  if (company === 'gemini') return 'gemini'
  if (company === 'anthropic') return 'anthropic'
  return 'openai_compatible'
}

export function defaultBaseUrl(company: string): string | null {
  switch (company) {
    case 'groq':
      return 'https://api.groq.com/openai/v1'
    case 'openai':
      return 'https://api.openai.com/v1'
    case 'deepseek':
      return 'https://api.deepseek.com/v1'
    case 'xai':
      return 'https://api.x.ai/v1'
    case 'nvidia':
      return 'https://integrate.api.nvidia.com/v1'
    default:
      return null
  }
}

export function defaultModel(company: string, tier: 'lite' | 'quality'): string {
  const lite: Record<string, string> = {
    groq: 'llama-3.1-8b-instant',
    openai: 'gpt-4o-mini',
    deepseek: 'deepseek-v4-flash',
    gemini: 'gemini-2.5-flash-lite',
    xai: 'grok-4-1-fast',
    nvidia: 'meta/llama-3.1-8b-instruct',
    anthropic: 'claude-haiku-4-5-20251001',
    custom: 'local-model',
  }
  const quality: Record<string, string> = {
    groq: 'llama-3.3-70b-versatile',
    openai: 'gpt-4o',
    deepseek: 'deepseek-v4-pro',
    gemini: 'gemini-2.5-pro',
    xai: 'grok-4-5',
    nvidia: 'meta/llama-3.3-70b-instruct',
    anthropic: 'claude-sonnet-5',
    custom: 'local-model',
  }
  return (tier === 'lite' ? lite : quality)[company] || 'local-model'
}

function rowToPublic(row: Record<string, unknown>): LlmKeyRecord {
  return {
    id: String(row.id),
    display_name: String(row.display_name),
    provider_kind: row.provider_kind as LlmProviderKind,
    company: String(row.company),
    model: String(row.model),
    base_url: row.base_url != null ? String(row.base_url) : null,
    key_last4: String(row.key_last4),
    cost_score: Number(row.cost_score),
    created_at: String(row.created_at),
  }
}

export function listLlmKeys(): LlmKeyRecord[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, display_name, provider_kind, company, model, base_url, key_last4, cost_score, created_at
       FROM llm_api_keys ORDER BY cost_score ASC, created_at ASC`,
    )
    .all() as Record<string, unknown>[]
  return rows.map(rowToPublic)
}

export function listLlmKeysWithSecrets(): LlmKeySecret[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, display_name, provider_kind, company, model, base_url, key_last4, cost_score, created_at,
              ciphertext, iv, tag
       FROM llm_api_keys ORDER BY cost_score ASC, created_at ASC`,
    )
    .all() as Record<string, unknown>[]
  return rows.map((row) => {
    const api_key = decrypt(
      Buffer.from(row.ciphertext as Uint8Array),
      Buffer.from(row.iv as Uint8Array),
      Buffer.from(row.tag as Uint8Array),
    )
    return { ...rowToPublic(row), api_key }
  })
}

export type CreateLlmKeyInput = {
  display_name: string
  api_key: string
  company?: string
  model?: string
  base_url?: string | null
  cost_score?: number
  provider_kind?: LlmProviderKind
}

export function createLlmKey(input: CreateLlmKeyInput): LlmKeyRecord {
  const api_key = input.api_key.trim()
  if (!api_key) throw new Error('api_key is required')
  const display_name = input.display_name.trim()
  if (!display_name) throw new Error('display_name is required')

  const company = (input.company || detectCompanyFromKey(api_key)).trim().toLowerCase()
  const provider_kind = input.provider_kind || kindForCompany(company)
  const model = (input.model || defaultModel(company, 'lite')).trim()
  const base_url =
    input.base_url !== undefined
      ? input.base_url
      : defaultBaseUrl(company)
  const cost_score =
    input.cost_score ?? COMPANY_COST_DEFAULTS[company] ?? COMPANY_COST_DEFAULTS.custom

  const id = randomId()
  const key_last4 = api_key.slice(-4)
  const { ciphertext, iv, tag } = encrypt(api_key)

  const db = getDb()
  db.prepare(
    `INSERT INTO llm_api_keys
      (id, display_name, provider_kind, company, model, base_url, key_last4, cost_score, ciphertext, iv, tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    display_name,
    provider_kind,
    company,
    model,
    base_url,
    key_last4,
    cost_score,
    ciphertext,
    iv,
    tag,
  )

  return {
    id,
    display_name,
    provider_kind,
    company,
    model,
    base_url,
    key_last4,
    cost_score,
    created_at: new Date().toISOString(),
  }
}

export function deleteLlmKey(id: string): boolean {
  const db = getDb()
  const result = db.prepare(`DELETE FROM llm_api_keys WHERE id = ?`).run(id)
  return Number(result.changes) > 0
}

export function getLlmKeysDbPathForDocs(): string {
  return dbPath()
}

function randomId(): string {
  return randomBytes(16).toString('hex')
}
