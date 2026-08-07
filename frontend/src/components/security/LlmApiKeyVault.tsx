'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  createLlmKey,
  deleteLlmKey,
  fetchLlmKeys,
  refreshLlmProvidersCache,
  type LlmKeyPublic,
} from '@/api/llmKeysApi'

const COMPANY_OPTIONS = [
  { value: '', label: '자동 감지 (키 접두어)' },
  { value: 'groq', label: 'Groq' },
  { value: 'openai', label: 'OpenAI (GPT)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'xai', label: 'xAI Grok' },
  { value: 'nvidia', label: 'NVIDIA' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'custom', label: 'Custom (OpenAI 호환)' },
]

type Props = {
  isDark?: boolean
}

export default function LlmApiKeyVault({ isDark = false }: Props) {
  const [keys, setKeys] = useState<LlmKeyPublic[]>([])
  const [openForm, setOpenForm] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await fetchLlmKeys()
      setKeys(list)
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String(
              (err as { response?: { data?: { error?: string } } }).response?.data
                ?.error || '목록을 불러오지 못했습니다.',
            )
          : '목록을 불러오지 못했습니다. 프로젝트 루트 .env 에 LLM_KEYS_ENCRYPTION_KEY 를 설정했는지 확인하세요.'
      setError(msg)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onSave = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await createLlmKey({
        display_name: displayName.trim(),
        api_key: apiKey.trim(),
        company: company || undefined,
      })
      const list = await refreshLlmProvidersCache()
      setKeys(list)
      setDisplayName('')
      setApiKey('')
      setCompany('')
      setOpenForm(false)
      setNotice('저장됨 · 챗봇 목록 캐시가 갱신되었습니다.')
    } catch (err) {
      let msg = '저장에 실패했습니다.'
      if (err && typeof err === 'object') {
        const ax = err as { response?: { data?: { error?: string } }; message?: string }
        if (ax.response?.data?.error) msg = ax.response.data.error
        else if (ax.message) msg = ax.message
      }
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      await deleteLlmKey(id)
      const list = await refreshLlmProvidersCache()
      setKeys(list)
      setNotice('삭제됨 · 챗봇 목록 캐시가 갱신되었습니다.')
    } catch {
      setError('삭제에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const card = isDark
    ? 'border-slate-600 bg-slate-800 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900'
  const muted = isDark ? 'text-slate-400' : 'text-slate-500'
  const inputCls = isDark
    ? 'border-slate-600 bg-slate-900 text-slate-100'
    : 'border-slate-300 bg-white text-slate-900'

  return (
    <section className={`mt-10 max-w-xl rounded-2xl border p-5 ${card}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">일반 챗봇 API 키</h2>
          <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
            등록한 키만 챗봇 좌하단 목록에 표시됩니다. 키 본문은{' '}
            <code className="text-[10px]">ai-service/DB</code>에 암호화 저장되고, 목록
            캐시는 저장 시 브라우저에 갱신됩니다.
          </p>
        </div>
        <button
          type="button"
          aria-label="API 키 추가"
          disabled={busy}
          onClick={() => setOpenForm((v) => !v)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={18} />
        </button>
      </div>

      {openForm ? (
        <div className={`mt-4 space-y-3 rounded-xl border p-3 ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
          <label className="block text-xs font-medium">
            표시 이름 (직접 지정)
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="예: 공장 Groq"
              className={`mt-1 h-9 w-full rounded-lg border px-2 text-sm ${inputCls}`}
            />
          </label>
          <label className="block text-xs font-medium">
            API 키
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="비밀 키"
              autoComplete="off"
              className={`mt-1 h-9 w-full rounded-lg border px-2 text-sm ${inputCls}`}
            />
          </label>
          <label className="block text-xs font-medium">
            회사 (Auto 단가용, 비우면 키로 감지)
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={`mt-1 h-9 w-full rounded-lg border px-2 text-sm ${inputCls}`}
            >
              {COMPANY_OPTIONS.map((o) => (
                <option key={o.value || 'auto'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !displayName.trim() || !apiKey.trim()}
            onClick={() => void onSave()}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-red-500">{error}</p> : null}
      {notice ? <p className="mt-3 text-xs text-emerald-600">{notice}</p> : null}

      <ul className="mt-4 space-y-2">
        {keys.length === 0 ? (
          <li className={`text-xs ${muted}`}>등록된 API가 없습니다. + 로 추가하세요.</li>
        ) : (
          keys.map((k) => (
            <li
              key={k.id}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                isDark ? 'border-slate-600' : 'border-slate-100'
              }`}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{k.display_name}</div>
                <div className={`text-[11px] ${muted}`}>
                  {k.company} · …{k.key_last4} · score {k.cost_score}
                </div>
              </div>
              <button
                type="button"
                aria-label="삭제"
                disabled={busy}
                onClick={() => void onDelete(k.id)}
                className={`rounded-md p-1.5 ${muted} hover:text-red-500`}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
