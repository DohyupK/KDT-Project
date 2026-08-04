"""System prompts for security-tab local vLLM only (never cloud APIs)."""

from __future__ import annotations

import re
from typing import Any

SYSTEM_SECURE = """당신은 사내 보안·기밀 전용 로컬 어시스턴트입니다.

규칙:
1. 이 채널은 로컬 vLLM만 사용한다. 외부 클라우드 LLM을 가정하거나 추천하지 않는다.
2. 기밀·사내 정보를 외부로 보내라고 안내하지 않는다.
3. 한국어로 짧고 명확하게 답한다.
4. 확실하지 않은 사내 정책은 추측하지 말고, 담당 부서 확인을 안내한다.
"""

SYSTEM_SECURE_RAG = """당신은 사내 보안 문서(RAG) 전용 로컬 어시스턴트입니다.

최우선 규칙:
제공된 문서(발췌)에 질문과 관련된 내용이 전혀 없다면, 부연 설명이나 사과를 절대 하지 말고 오직 `[SYS_RAG_EMPTY_RESULT]` 이 토큰 하나만 출력하고 생성을 종료해라.

규칙:
1. 제공된 「검색된 사내 문서 발췌」에 있는 내용만으로 답한다. 일반 상식·추측·외부 지식으로 채우지 않는다.
2. 발췌에 관련 내용이 있으면 그 내용으로만 답한다. 없을 때만 위 `[SYS_RAG_EMPTY_RESULT]` 규칙을 따른다.
3. `[SYS_RAG_EMPTY_RESULT]`가 아닌 정상 답변의 끝(또는 관련 문장 끝)에 `[출처: 문서 제목]` 형식으로 인용한다. 제목은 발췌 메타의 title을 그대로 쓴다.
4. 외부 클라우드 LLM/반출을 안내하지 않는다.
5. 한국어로 명확히 답한다.
"""

NO_DOC_TOKEN = "[SYS_RAG_EMPTY_RESULT]"

EMPTY_RAG_REPLY = (
    "제공된 사내 문서에서는 관련된 내용을 찾을 수 없습니다."
)

SUMMARY_INSTRUCTION_SUFFIX = (
    "추가 지시: 숫자·단위는 생략하고, 개조식(명사형 종결)으로 "
    "2~3문장 이내로 아주 짧게 핵심만 요약해라."
)

EXPLAIN_INSTRUCTION_SUFFIX = (
    "추가 지시: 제공된 발췌만 근거로, 공정·수치·조치 포인트를 "
    "개조식(명사형 종결) 3줄 이내로 짧게 브리핑하라. "
    "발췌에 없는 내용은 쓰지 마라."
)

EXPLAIN_MAX_CHARS = 24

ANALYTICS_INTENT_RE = re.compile(
    r"(통계|평균|예측|예상|불량률|추이|집계|상관|히스토그램)",
    re.IGNORECASE,
)

PREDICT_INTENT_RE = re.compile(r"(예측|예상)", re.IGNORECASE)

ANALYTICS_RESULT_HEADER = "[사내 정형 데이터 집계 결과]"

ANALYTICS_GROUNDING_SUFFIX = (
    "추가 지시: 위 집계 결과만 근거로 답하라. "
    "일반 상식·추측으로 숫자를 채우지 마라."
)

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

EMPTY_VLLM_REPLY = (
    "사내 보안 문서에서는 관련 내용을 찾았지만, "
    "로컬 LLM이 빈 답을 반환했습니다. "
    "문서 발췌를 대신 제공합니다. "
    "보안 채널은 외부 API로 폴백하지 않습니다."
)

# Lines that look like prior extractive dumps / system notices — skip in generate history.
_EXTRACTIVE_ASSISTANT_NOISE = re.compile(
    r"^(검색된\s*사내|핵심\s*발췌|로컬\s*LLM|SECURE_GENERATE|"
    r"요약\s*요청으로\s*문서\s*발췌|###\s*\d+\.)",
    re.IGNORECASE,
)

# Also matches: 요약 가능함?, 요약해, 요약?, 요약 부탁 …
SUMMARY_INTENT_RE = re.compile(
    r"(요약\s*(가능|해|해\s*줘|해줘|부탁|\?|？)|"
    r"(요약|짧게|간단히|핵심).{0,24}?(해|알려|정리|부탁|가능))",
    re.IGNORECASE | re.DOTALL,
)

_CITE_MARKER_RE = re.compile(r"\[출처:\s*[^\]]*\]")

FOLLOWUP_RE = re.compile(
    # Pronoun / context-dependent only. No topic-shift conjunctions
    # (그럼|그래서|그러면|관련|이어서) — those cause expand pollution.
    r"^(왜|뭐|무엇|그게|그건|그거|저거|이것|그것|"
    r"자세히|더\s*알려|이유가|이유\s*가|장단점|"
    r"목적|조치|이상\s*시)"
    r".{0,40}$",
    re.IGNORECASE | re.DOTALL,
)


def is_summary_intent(message: str) -> bool:
    """Regex-only summary intent (no LLM)."""
    return bool(SUMMARY_INTENT_RE.search((message or "").strip()))


def is_explain_intent(message: str) -> bool:
    """Short non-summary asks that benefit from a brief explain suffix."""
    t = (message or "").strip()
    if not t or len(t) > EXPLAIN_MAX_CHARS:
        return False
    if is_summary_intent(t):
        return False
    return True


def wants_explain_suffix(message: str, sources: list[dict[str, Any]]) -> bool:
    """Inject EXPLAIN suffix only when short explain intent and RAG hits exist."""
    return is_explain_intent(message) and len(sources or []) >= 1


def is_analytics_intent(message: str) -> bool:
    """Structured analytics route (excludes bare '데이터')."""
    return bool(ANALYTICS_INTENT_RE.search((message or "").strip()))


def is_predict_intent(message: str) -> bool:
    return bool(PREDICT_INTENT_RE.search((message or "").strip()))


def is_no_doc_reply(reply: str) -> bool:
    """True when model signals empty RAG via control token anywhere in the reply."""
    return NO_DOC_TOKEN in (reply or "")


def unique_source_titles(sources: list[dict[str, Any]]) -> list[str]:
    """First-seen unique non-empty titles from retrieve hits."""
    seen: set[str] = set()
    out: list[str] = []
    for s in sources:
        t = str(s.get("title") or "").strip()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def strip_and_force_citations(
    reply: str,
    sources: list[dict[str, Any]],
) -> str:
    """
    Strip any LLM [출처:…] markers, then append unique titles from real sources.
    Blocks citation hallucination. Empty-RAG replies use finalize_reply_sources.
    """
    if is_no_doc_reply(reply):
        return EMPTY_RAG_REPLY
    text = _CITE_MARKER_RE.sub("", reply or "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    titles = unique_source_titles(sources)
    if not titles:
        return text
    cites = " ".join(f"[출처: {t}]" for t in titles)
    return f"{text}\n\n{cites}" if text else cites


def finalize_reply_sources(
    reply: str,
    sources: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]]]:
    """
    Apply citation policy.
    Control token anywhere → hard override to EMPTY_RAG_REPLY and clear sources.
    """
    if is_no_doc_reply(reply):
        return EMPTY_RAG_REPLY, []
    out = strip_and_force_citations(reply, sources)
    return out, list(sources or [])


def is_short_followup(message: str, *, max_chars: int = 40) -> bool:
    """
    Pronoun/context-dependent follow-up only (FOLLOWUP_RE).
    Topic-shift connectors (그럼/그래서/…) are excluded from the regex itself
    (no domain-noun hardcoding). max_chars kept for call-site compat.
    """
    del max_chars  # unused — do not gate on length
    t = (message or "").strip()
    if not t:
        return False
    return bool(FOLLOWUP_RE.search(t))


def last_user_utterance(history_text: str) -> str:
    """Last User: line body from compact history text."""
    last = ""
    for line in (history_text or "").splitlines():
        s = line.strip()
        if s.startswith("User:"):
            last = s[len("User:") :].strip()
    return last


def last_assistant_utterance(
    history_text: str,
    *,
    max_chars: int = 2400,
) -> str:
    """
    Last Assistant turn body from history (multi-line aware).
    Strips [출처:…] markers for summary context.
    """
    raw = (history_text or "").strip()
    if not raw:
        return ""
    if "[단기 윈도우]" in raw:
        raw = raw.split("[단기 윈도우]", 1)[-1].strip()
    elif raw.startswith("[장기기억 유사]"):
        return ""

    turns: list[tuple[str, str]] = []
    role: str | None = None
    buf: list[str] = []

    def _flush() -> None:
        nonlocal role, buf
        if role and buf:
            turns.append((role, "\n".join(buf).strip()))
        role, buf = None, []

    for line in raw.splitlines():
        if line.startswith("User:"):
            _flush()
            role = "User"
            buf = [line[len("User:") :].strip()]
        elif line.startswith("Assistant:"):
            _flush()
            role = "Assistant"
            buf = [line[len("Assistant:") :].strip()]
        elif role is not None:
            buf.append(line)
    _flush()

    last = ""
    for r, body in turns:
        if r == "Assistant" and body.strip():
            last = body.strip()
    if not last:
        return ""
    last = _CITE_MARKER_RE.sub("", last)
    last = re.sub(r"\n{3,}", "\n\n", last).strip()
    if len(last) > max_chars:
        return last[:max_chars].rstrip() + "…"
    return last


def expand_retrieve_query(message: str, history_text: str) -> tuple[str, bool]:
    """
    Merge previous user question with a short follow-up for retrieve.
    Returns (query_for_retrieve, used_expansion).
    """
    msg = (message or "").strip()
    if not is_short_followup(msg):
        return msg, False
    prev = last_user_utterance(history_text)
    if not prev or prev == msg:
        return msg, False
    merged = f"{prev} / {msg}"
    return merged, True


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


def format_rag_context_for_generate(
    sources: list[dict[str, Any]],
    *,
    per_chunk: int = 350,
    max_total: int = 1600,
) -> str:
    """Shorter RAG block for SECURE_GENERATE=1 (keeps format_rag_context unchanged)."""
    blocks: list[str] = []
    for i, s in enumerate(sources[:4], start=1):
        title = s.get("title") or s.get("doc_id") or f"doc-{i}"
        text = re.sub(r"\s+", " ", (s.get("text") or "").strip())
        if len(text) > per_chunk:
            text = text[:per_chunk].rstrip() + "…"
        blocks.append(f"[{i}] {title}\n{text}")
    out = "\n\n".join(blocks)
    if len(out) > max_total:
        return out[:max_total].rstrip() + "…"
    return out


def format_summary_user_block(message: str, prior_reply: str) -> str:
    """Prompt: summarize the previous assistant reply (not raw RAG chunks)."""
    context = (prior_reply or "").strip()
    if len(context) > 2400:
        context = context[:2400].rstrip() + "…"
    return (
        "아래는 직전 답변입니다.\n"
        "위 내용을 바탕으로 숫자·단위는 생략하고, "
        "개조식(단답형 또는 명사형 종결)으로 2~3문장 이내로 "
        "아주 짧게 핵심만 요약하세요.\n"
        "추측·외부 지식 금지. 「~한다」체 장문 금지.\n"
        "본문에 [출처: …] 문구는 넣지 마세요 (서버가 실제 출처를 붙입니다).\n\n"
        f"직전 답변:\n{context}\n\n"
        f"사용자 요청:\n{(message or '').strip()}"
    )


def history_for_generate(history_text: str, *, max_chars: int = 1000) -> str:
    """
    Trim multi-turn context for LLM generate.
    Prefer short-term window only (drop [장기기억 유사] block),
    drop extractive/notice assistant dumps, then cap length.
    """
    raw = (history_text or "").strip()
    if not raw:
        return ""
    if "[단기 윈도우]" in raw:
        raw = raw.split("[단기 윈도우]", 1)[-1].strip()
    elif raw.startswith("[장기기억 유사]"):
        raw = ""
    if not raw:
        return ""

    # Rebuild role turns (content may contain newlines).
    turns: list[tuple[str, str]] = []
    role: str | None = None
    buf: list[str] = []

    def _flush() -> None:
        nonlocal role, buf
        if role and buf:
            turns.append((role, "\n".join(buf).strip()))
        role, buf = None, []

    for line in raw.splitlines():
        if line.startswith("User:"):
            _flush()
            role = "User"
            buf = [line[len("User:") :].strip()]
        elif line.startswith("Assistant:"):
            _flush()
            role = "Assistant"
            buf = [line[len("Assistant:") :].strip()]
        elif role is not None:
            buf.append(line)
    _flush()

    kept: list[str] = []
    for r, body in turns:
        if not body:
            continue
        if r == "Assistant":
            first = body.splitlines()[0].strip() if body else ""
            if _EXTRACTIVE_ASSISTANT_NOISE.search(first):
                continue
            if len(body) > 280 and (
                "발췌" in body
                or "[출처:" in body
                or body.lstrip().startswith("## ")
                or "m/min" in body
            ):
                continue
            clipped = body[:240] + ("…" if len(body) > 240 else "")
            kept.append(f"Assistant: {clipped}")
        else:
            clipped = body[:200] + ("…" if len(body) > 200 else "")
            kept.append(f"User: {clipped}")

    text = "\n".join(kept)
    if len(text) > max_chars:
        return text[-max_chars:]
    return text


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


def format_compressed_extractive_reply(
    sources: list[dict[str, Any]],
    *,
    notice: str | None = None,
    per_chunk: int = 200,
) -> str:
    """Shorter bullet excerpts for summary-intent turns. No LLM."""
    titles = sorted(
        {str(s.get("title") or "") for s in sources if s.get("title")}
    )
    lines: list[str] = []
    if notice:
        lines.append(notice)
        lines.append("")
    lines.append("핵심 발췌 (압축):")
    lines.append("")
    for i, s in enumerate(sources[:4], start=1):
        title = s.get("title") or s.get("doc_id") or f"doc-{i}"
        text = (s.get("text") or "").strip()
        text = re.sub(r"\s+", " ", text)
        if len(text) > per_chunk:
            text = text[:per_chunk].rstrip() + "…"
        lines.append(f"- **{title}**: {text}")
    lines.append("")
    if titles:
        lines.append(" ".join(f"[출처: {t}]" for t in titles if t))
    return "\n".join(lines).strip()
