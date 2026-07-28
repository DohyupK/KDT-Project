import { apiClient } from '@/api/axios'

export type LlmKeyPublic = {
  id: string
  display_name: string
  provider_kind: string
  company: string
  model: string
  base_url: string | null
  key_last4: string
  cost_score: number
  created_at: string
}

const CACHE_KEY = 'kdt_llm_providers_cache'

export type LlmProvidersCache = {
  keys: LlmKeyPublic[]
  updatedAt: string
}

export function readLlmProvidersCache(): LlmProvidersCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LlmProvidersCache
  } catch {
    return null
  }
}

export function writeLlmProvidersCache(keys: LlmKeyPublic[]): LlmProvidersCache {
  const payload: LlmProvidersCache = {
    keys,
    updatedAt: new Date().toISOString(),
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  }
  return payload
}

export async function fetchLlmKeys(): Promise<LlmKeyPublic[]> {
  const { data } = await apiClient.get<{ keys: LlmKeyPublic[] }>('/llm-keys')
  return data.keys ?? []
}

/** Fetch from server and refresh localStorage cache (call after security-tab Save). */
export async function refreshLlmProvidersCache(): Promise<LlmKeyPublic[]> {
  const keys = await fetchLlmKeys()
  writeLlmProvidersCache(keys)
  return keys
}

export async function createLlmKey(body: {
  display_name: string
  api_key: string
  company?: string
  model?: string
  base_url?: string | null
}): Promise<LlmKeyPublic> {
  const { data } = await apiClient.post<{ key: LlmKeyPublic }>('/llm-keys', body)
  return data.key
}

export async function deleteLlmKey(id: string): Promise<void> {
  await apiClient.delete(`/llm-keys/${id}`)
}
