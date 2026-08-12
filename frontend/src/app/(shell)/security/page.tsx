'use client'

import { useState } from 'react'
import SecurityChatbot from '@/components/chat/SecurityChatbot'
import { useUiSettings } from '@/components/layout/AppShell'
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent'
import { useShellRefresh } from '@/hooks/useShellRefresh'

export default function SecurityPage() {
  const { isDark, language, copy } = useUiSettings()
  const [refreshKey, setRefreshKey] = useState(0)

  useShellRefresh(() => {
    setRefreshKey((key) => key + 1)
  })

  return (
    <div
      className={`h-full overflow-y-auto ${
        isDark
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100'
          : 'bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 text-slate-900'
      }`}
    >
      <div className={`${SHELL_CONTENT_CLASS} py-6`}>
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
              ? 'Sensitive chat runs on local vLLM here. Register general-chat API keys under Settings.'
              : '기밀 질의는 로컬 vLLM 보안 챗을 사용합니다. 일반 챗봇 API 키 등록은 설정 페이지에서 합니다.'}
          </p>
        </div>

        <div
          className={`max-w-xl ${
            isDark
              ? '[&>div]:border-slate-600 [&>div]:bg-slate-800 [&>div]:text-slate-400 [&>div>p:first-child]:text-slate-100 [&_code]:text-slate-300'
              : ''
          }`}
        >
          <h2 className={`mb-3 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {language === 'en' ? 'Secure chat (local vLLM)' : '보안 챗 (로컬 vLLM)'}
          </h2>
          <SecurityChatbot key={`chat-${refreshKey}`} />
        </div>
        <p className={`mt-6 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          참고: docs/references/security-chat-skeleton.md · docs/references/vllm-setup.md ·
          docs/references/ai-service-feature-catalog.md
        </p>
      </div>
    </div>
  )
}
