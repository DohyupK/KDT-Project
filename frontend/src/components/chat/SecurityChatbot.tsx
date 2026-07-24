'use client'

/**
 * Stub for the future security-channel chatbot (local vLLM only).
 * Do not wire general OpenAI/Gemini/NVIDIA here.
 */
export default function SecurityChatbot() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
      <p className="font-semibold text-slate-800">SecurityChatbot (stub)</p>
      <p className="mt-2 leading-relaxed">
        보안 탭 전용 챗봇 자리입니다. 이후 <code className="text-xs">CHAT_VLLM_BASE_URL</code> 로컬
        vLLM만 연결합니다. 일반 GlobalChatbot 프로바이더(OpenAI / Gemini / NVIDIA)는 사용하지
        않습니다.
      </p>
    </div>
  )
}
