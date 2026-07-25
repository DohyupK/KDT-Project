'use client'

import SecurityChatbot from '@/components/chat/SecurityChatbot'
import { useUiSettings } from '@/components/layout/AppShell'

export default function SecurityPage() {
  const { isDark, language, copy } = useUiSettings()

  return (
    <div className="h-full overflow-y-auto p-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">보안</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
        보안·기밀 질의는 이 탭에서만 처리합니다. 메시지는 외부 LLM(Groq/Gemini)으로 나가지 않고,
        로컬 vLLM(<code className="text-xs">CHAT_VLLM_BASE_URL</code>, 기본{' '}
        <code className="text-xs">:8001</code>)만 사용합니다. 일반 챗봇과는 API가 분리되어 있습니다.
    <div
      className={`h-full overflow-y-auto p-8 ${
        isDark ? 'bg-slate-900 text-slate-100' : 'bg-transparent text-slate-900'
      }`}
    >
      <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
        {copy.menus['/security']}
      </h1>
      <p className={`mt-3 max-w-2xl text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
        {language === 'en'
          ? 'Handle security documents and sensitive queries in this tab. Routing and directory scaffolding are ready; local vLLM integration comes later.'
          : '보안·기밀 문서와 민감 질의는 이 탭에서 처리합니다. 현재는 라우팅·디렉터리 골격만 준비되어 있으며, 로컬 vLLM 연동은 이후 작업입니다.'}
      </p>
      <div
        className={`mt-8 max-w-xl ${
          isDark
            ? '[&>div]:border-slate-600 [&>div]:bg-slate-800 [&>div]:text-slate-400 [&>div>p:first-child]:text-slate-100 [&_code]:text-slate-300'
            : ''
        }`}
      >
        <SecurityChatbot />
      </div>
      <p className="mt-6 text-xs text-slate-400">
        참고: docs/references/security-chat-skeleton.md · docs/references/vllm-setup.md
      </p>
    </div>
  )
}
