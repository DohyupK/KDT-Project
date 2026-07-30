'use client'

import SecurityChatbot from '@/components/chat/SecurityChatbot'
import { useUiSettings } from '@/components/layout/AppShell'
import LlmApiKeyVault from '@/components/security/LlmApiKeyVault'

export default function SecurityPage() {
  const { isDark, language, copy } = useUiSettings()

  return (
    <div
      className={`h-full overflow-y-auto p-8 ${
        isDark ? 'bg-slate-900 text-slate-100' : 'bg-transparent text-slate-900'
      }`}
    >
      <div className="mb-6 flex flex-col gap-1">
        <p
          className={`text-sm font-bold tracking-wide ${
            isDark ? 'text-blue-400' : 'text-blue-600'
          }`}
        >
          Security Center
        </p>
        <h1
          className={`mt-1 text-3xl font-bold tracking-tight ${
            isDark ? 'text-slate-100' : 'text-gray-900'
          }`}
        >
          {copy.menus['/security']}
        </h1>
        <p className={`mt-2 max-w-2xl text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
          {language === 'en'
            ? 'Register general-chat API keys here (encrypted under ai-service/DB). Sensitive chat stays on local vLLM below.'
            : '일반 챗봇용 API 키는 아래에서 등록합니다(암호문은 ai-service/DB). 기밀 질의는 아래 보안 챗(로컬 vLLM)을 사용합니다.'}
        </p>
      </div>

      <LlmApiKeyVault isDark={isDark} />

      <div
        className={`mt-10 max-w-xl ${
          isDark
            ? '[&>div]:border-slate-600 [&>div]:bg-slate-800 [&>div]:text-slate-400 [&>div>p:first-child]:text-slate-100 [&_code]:text-slate-300'
            : ''
        }`}
      >
        <h2 className={`mb-3 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
          {language === 'en' ? 'Secure chat (local vLLM)' : '보안 챗 (로컬 vLLM)'}
        </h2>
        <SecurityChatbot />
      </div>
      <p className={`mt-6 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        참고: docs/references/security-chat-skeleton.md · docs/references/vllm-setup.md ·
        docs/references/ai-service-feature-catalog.md · docs/references/secure-rag.md
      </p>
    </div>
  )
}
