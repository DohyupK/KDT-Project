"""
Knowledge library analyze compose — NOT the general LOT diagnosis chat.

Uses a short SYSTEM_KNOWLEDGE only. No SYSTEM_COMPOSE, predict, RAG, or history.
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from agent.api_llm.llm import (
    AUTO_FALLBACK_NOTICE,
    NO_CREDENTIALS_NOTICE,
    llm_enabled,
)
from agent.api_llm.providers import (
    invoke_credential,
    resolve_credentials,
    select_auto_order,
    translate_llm_error,
)

SYSTEM_KNOWLEDGE = """당신은 선택한 자료(완료 이슈·사내 문서·로컬 지식)를 같이 읽는 동료입니다.
제공된 항목만 근거로, 존댓말 자연어로 답합니다.
요약과 참고 사항을 넣고, 넘겨받은 항목은 빠짐없이 다룹니다.
초점은 그 자료의 정리입니다.
"""

LLM_DISABLED_NOTICE = (
    "CHAT_USE_LLM이 꺼져 있어 지식 분석을 실행할 수 없습니다. "
    "환경 설정을 확인한 뒤 다시 시도해 주세요."
)


def compose_knowledge(
    message: str,
    *,
    llm_mode: str | None = "auto",
    llm_credentials: list[dict[str, Any]] | None = None,
) -> tuple[str | None, str | None, str | None]:
    """
    Returns (reply_text, provider_label, user_facing_error).
    Never returns LOT diagnosis template fallbacks.
    """
    if not llm_enabled():
        return None, None, LLM_DISABLED_NOTICE

    creds = resolve_credentials(llm_credentials)
    if not creds:
        return None, None, NO_CREDENTIALS_NOTICE

    messages = [
        SystemMessage(content=SYSTEM_KNOWLEDGE),
        HumanMessage(content=message),
    ]

    mode = (llm_mode or "auto").strip()
    if mode != "auto":
        chosen = next((c for c in creds if c.id == mode), None)
        if chosen is None:
            return None, None, "선택한 API를 찾을 수 없습니다. 보안 탭에서 다시 저장해 주세요."
        text = invoke_credential(chosen, messages)
        if text:
            return text, chosen.display_name or chosen.company, None
        return None, chosen.display_name, translate_llm_error("invoke failed")

    ordered = select_auto_order(creds, message)
    last_err: str | None = None
    for i, cred in enumerate(ordered):
        text = invoke_credential(cred, messages)
        if text:
            if i > 0 and AUTO_FALLBACK_NOTICE.strip() not in text:
                text = text.rstrip() + AUTO_FALLBACK_NOTICE
            return text, cred.display_name or cred.company, None
        last_err = translate_llm_error("auto candidate failed")

    return None, None, last_err
