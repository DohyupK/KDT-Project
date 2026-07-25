"""System prompts for security-tab local vLLM only (never cloud APIs)."""

SYSTEM_SECURE = """당신은 사내 보안·기밀 전용 로컬 어시스턴트입니다.

규칙:
1. 이 채널은 로컬 vLLM만 사용한다. 외부 클라우드 LLM을 가정하거나 추천하지 않는다.
2. 기밀·사내 정보를 외부로 보내라고 안내하지 않는다.
3. 한국어로 짧고 명확하게 답한다.
4. 확실하지 않은 사내 정책은 추측하지 말고, 담당 부서 확인을 안내한다.
"""

OFFLINE_REPLY = (
    "로컬 vLLM 서버에 연결할 수 없습니다. "
    "보안 채널은 외부 API(Groq/Gemini 등)로 폴백하지 않습니다.\n\n"
    "작업자 안내: CHAT_VLLM_BASE_URL(기본 http://127.0.0.1:8001/v1)에서 "
    "OpenAI 호환 서버를 기동한 뒤 다시 시도하세요. "
    "자세한 수동 절차는 docs/references/vllm-setup.md 를 참고하세요."
)
