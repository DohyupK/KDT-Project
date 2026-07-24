import SecurityChatbot from '@/components/chat/SecurityChatbot'

export default function SecurityPage() {
  return (
    <div className="h-full overflow-y-auto p-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">보안</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
        보안·기밀 문서와 민감 질의는 이 탭에서 처리합니다. 현재는 라우팅·디렉터리 골격만
        준비되어 있으며, 로컬 vLLM 연동은 이후 작업입니다.
      </p>
      <div className="mt-8 max-w-xl">
        <SecurityChatbot />
      </div>
      <p className="mt-6 text-xs text-slate-400">
        참고: docs/references/security-chat-skeleton.md
      </p>
    </div>
  )
}
