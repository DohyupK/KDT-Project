"""
Length-based LLM compose (keys from environment / .env only — never hardcode).

CHAT_USE_LLM=1 required.

Routing by user message length (Unicode code points):
  len <= CHAT_LEN_GEMINI (default 300)              → Groq (Llama)
  CHAT_LEN_GEMINI < len <= CHAT_LEN_PRO (500)       → Gemini Flash
  len > CHAT_LEN_PRO                                → Gemini Pro

Gemini failure (quota / key / API) → retry once with Groq and append notice.
Both fail → caller uses template.

General chat never uses vLLM — CHAT_VLLM_BASE_URL is reserved for the security tab.
"""

from __future__ import annotations

import json
import os
from typing import Any, Literal

from langchain_core.messages import HumanMessage, SystemMessage

from agent.prompts import SYSTEM_COMPOSE, USAGE_GUIDELINE

ProviderName = Literal["groq", "gemini_flash", "gemini_pro"]

GEMINI_FALLBACK_NOTICE = (
    "\n\n[안내] 고성능 LLM(Gemini) 한도/오류로 Groq이 답변했습니다."
)


def llm_enabled() -> bool:
    return os.environ.get("CHAT_USE_LLM", "0").strip() in ("1", "true", "True", "yes")


def _len_thresholds() -> tuple[int, int]:
    gemini = int(os.environ.get("CHAT_LEN_GEMINI", "300"))
    pro = int(os.environ.get("CHAT_LEN_PRO", "500"))
    if gemini < 0:
        gemini = 0
    if pro < gemini:
        pro = gemini
    return gemini, pro


def select_provider(message: str) -> ProviderName:
    """Pick provider from user message character length."""
    n = len(message or "")
    gemini_thr, pro_thr = _len_thresholds()
    if n <= gemini_thr:
        return "groq"
    if n <= pro_thr:
        return "gemini_flash"
    return "gemini_pro"


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and "text" in block:
                parts.append(str(block["text"]))
        return "".join(parts).strip()
    return str(content).strip()


def _build_messages(
    message: str,
    predict_result: dict[str, Any] | None,
    error: str | None,
    need_guideline: bool,
    recommendation: dict[str, Any] | None = None,
) -> list[Any]:
    system = SYSTEM_COMPOSE
    if need_guideline:
        system = SYSTEM_COMPOSE + "\n\n" + USAGE_GUIDELINE

    payload = {
        "user_message": message,
        "predict": predict_result,
        "recommendation": recommendation,
        "error": error,
        "need_guideline": need_guideline,
    }
    return [
        SystemMessage(content=system),
        HumanMessage(
            content=(
                "다음 JSON만 근거로 한국어 답변을 작성하세요.\n"
                + json.dumps(payload, ensure_ascii=False)
            )
        ),
    ]


def _make_groq():
    from langchain_openai import ChatOpenAI

    key = os.environ.get("GROQ_API_KEY", "").strip()
    if not key:
        return None
    base_url = os.environ.get(
        "CHAT_GROQ_BASE_URL",
        "https://api.groq.com/openai/v1",
    ).strip()
    return ChatOpenAI(
        model=os.environ.get("CHAT_GROQ_MODEL", "llama-3.1-8b-instant"),
        temperature=0,
        api_key=key,
        base_url=base_url,
    )


def _make_gemini(model: str):
    key = os.environ.get("GOOGLE_API_KEY", "").strip()
    if not key:
        return None
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ImportError:
        return None
    return ChatGoogleGenerativeAI(
        model=model,
        temperature=0,
        google_api_key=key,
    )


def _make_gemini_flash():
    return _make_gemini(
        os.environ.get("CHAT_GEMINI_FLASH_MODEL", "gemini-2.0-flash"),
    )


def _make_gemini_pro():
    return _make_gemini(
        os.environ.get("CHAT_GEMINI_PRO_MODEL", "gemini-2.5-pro"),
    )


_FACTORIES = {
    "groq": _make_groq,
    "gemini_flash": _make_gemini_flash,
    "gemini_pro": _make_gemini_pro,
}


def _invoke(
    name: ProviderName,
    messages: list[Any],
) -> str | None:
    factory = _FACTORIES.get(name)
    if factory is None:
        return None
    try:
        llm = factory()
        if llm is None:
            return None
        out = llm.invoke(messages)
        text = _content_to_text(out.content)
        return text or None
    except Exception:  # noqa: BLE001
        return None


def compose_with_failover(
    message: str,
    predict_result: dict[str, Any] | None,
    error: str | None,
    need_guideline: bool = False,
    recommendation: dict[str, Any] | None = None,
) -> tuple[str | None, str | None]:
    """
    Invoke length-selected provider.
    Gemini paths fall back to Groq + notice on failure.
    Returns (reply_text, provider_name) or (None, None).
    """
    if not llm_enabled():
        return None, None

    name = select_provider(message)
    messages = _build_messages(
        message, predict_result, error, need_guideline, recommendation
    )

    text = _invoke(name, messages)
    if text:
        return text, name

    # Gemini depleted / error → Groq + short notice
    if name in ("gemini_flash", "gemini_pro"):
        groq_text = _invoke("groq", messages)
        if groq_text:
            if GEMINI_FALLBACK_NOTICE.strip() not in groq_text:
                groq_text = groq_text.rstrip() + GEMINI_FALLBACK_NOTICE
            return groq_text, "groq"

    return None, None
