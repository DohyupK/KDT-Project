"""System prompts for security-tab local vLLM only (never cloud APIs)."""

from __future__ import annotations

from typing import Any

SYSTEM_SECURE = """당신은 사내 보안·기밀 전용 로컬 어시스턴트입니다.

규칙:
1. 이 채널은 로컬 vLLM만 사용한다. 외부 클라우드 LLM을 가정하거나 추천하지 않는다.
2. 기밀·사내 정보를 외부로 보내라고 안내하지 않는다.
3. 한국어로 짧고 명확하게 답한다.
4. 확실하지 않은 사내 정책은 추측하지 말고, 담당 부서 확인을 안내한다.
"""

SYSTEM_SECURE_RAG = """당신은 사내 보안 문서(RAG) 전용 로컬 어시스턴트입니다.

규칙:
1. 제공된 「검색된 사내 문서 발췌」에 있는 내용만으로 답한다. 일반 상식·추측·외부 지식으로 채우지 않는다.
2. 발췌에 없으면 답하지 말고, 문서에 없다고 말한다.
3. 답변 끝(또는 관련 문장 끝)에 반드시 `[출처: 문서 제목]` 형식으로 인용한다. 제목은 발췌 메타의 title을 그대로 쓴다.
4. 외부 클라우드 LLM/반출을 안내하지 않는다.
5. 한국어로 명확히 답한다.
"""

OFFLINE_REPLY = (
    "로컬 vLLM 서버에 연결할 수 없습니다. "
    "보안 채널은 외부 API(Groq/Gemini 등)로 폴백하지 않습니다.\n\n"
    "작업자 안내: CHAT_VLLM_BASE_URL(기본 http://127.0.0.1:8001/v1)에서 "
    "OpenAI 호환 서버를 기동한 뒤 다시 시도하세요. "
    "자세한 수동 절차는 docs/references/vllm-setup.md 를 참고하세요."
)

HIT_BUT_LLM_TIMEOUT_REPLY = (
    "사내 보안 문서에서는 관련 내용을 찾았지만, "
    "로컬 LLM(vLLM/LM Studio) 응답이 시간 초과·실패했습니다. "
    "보안 채널은 외부 API로 폴백하지 않습니다.\n\n"
    "작업자 안내: LM Studio가 생성 중(GEN)인지 확인하고, "
    "모델 부하를 낮추거나 잠시 후 다시 시도하세요. "
    "CHAT_VLLM_BASE_URL · CHAT_VLLM_MODEL 설정도 확인하세요."
)


def format_rag_context(sources: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for i, s in enumerate(sources, start=1):
        title = s.get("title") or s.get("doc_id") or f"doc-{i}"
        blocks.append(
            f"[{i}] title={title}\n"
            f"doc_id={s.get('doc_id')} category={s.get('category')} "
            f"process={s.get('process')} chunk={s.get('chunk_index')}\n"
            f"{s.get('text') or ''}"
        )
    return "\n\n".join(blocks)


def format_extractive_reply(
    sources: list[dict[str, Any]],
    *,
    notice: str | None = None,
) -> str:
    """Return cited document excerpts without calling the chat LLM."""
    titles = sorted(
        {str(s.get("title") or "") for s in sources if s.get("title")}
    )
    lines: list[str] = []
    if notice:
        lines.append(notice)
        lines.append("")
    lines.append("검색된 사내 보안 문서 발췌:")
    lines.append("")
    for i, s in enumerate(sources[:4], start=1):
        title = s.get("title") or s.get("doc_id") or f"doc-{i}"
        text = (s.get("text") or "").strip()
        if len(text) > 900:
            text = text[:900].rstrip() + "…"
        lines.append(f"### {i}. {title}")
        lines.append(text)
        lines.append("")
    if titles:
        lines.append(" ".join(f"[출처: {t}]" for t in titles if t))
    return "\n".join(lines).strip()
