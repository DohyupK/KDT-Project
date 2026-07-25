import SecurityChatbot from '@/components/chat/SecurityChatbot'

export default function SecurityPage() {
  return (
    <div className="h-full overflow-y-auto p-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">보안</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
        보안·기밀 질의는 이 탭에서만 처리합니다. 메시지는 외부 LLM(Groq/Gemini)으로 나가지 않고,
        로컬 vLLM(<code className="text-xs">CHAT_VLLM_BASE_URL</code>, 기본{' '}
        <code className="text-xs">:8001</code>)만 사용합니다. 일반 챗봇과는 API가 분리되어 있습니다.
      </p>
      <div className="mt-8 max-w-xl">
        <SecurityChatbot />
      </div>
      <p className="mt-6 text-xs text-slate-400">
        참고: docs/references/security-chat-skeleton.md · docs/references/vllm-setup.md
      </p>
    </div>
  )
}
