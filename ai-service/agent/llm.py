"""
Cost/length-based LLM compose.

CHAT_USE_LLM=1 required.
llm_mode: "auto" | credential id
llm_credentials: from Express (ai-service/DB decrypted) only — no .env API-key fallback.
"""

from __future__ import annotations

import json
import os
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from agent.prompts import SYSTEM_COMPOSE, USAGE_GUIDELINE
from agent.providers import (
    invoke_credential,
    resolve_credentials,
    select_auto_order,
    translate_llm_error,
)

AUTO_FALLBACK_NOTICE = "\n\n[안내] 이전 API 한도/오류로 다른 등록 API가 답변했습니다."
NO_CREDENTIALS_NOTICE = (
    "등록된 API 키가 없습니다. /security 탭에서 API 키를 저장한 뒤 다시 시도해 주세요."
)


def llm_enabled() -> bool:
    return os.environ.get("CHAT_USE_LLM", "0").strip() in ("1", "true", "True", "yes")


def _build_messages(
    message: str,
    predict_result: dict[str, Any] | None,
    error: str | None,
    need_guideline: bool,
    recommendation: dict[str, Any] | None = None,
    capacity_result: dict[str, Any] | None = None,
    head_results: dict[str, Any] | None = None,
) -> list[Any]:
    system = SYSTEM_COMPOSE
    if need_guideline:
        system = SYSTEM_COMPOSE + "\n\n" + USAGE_GUIDELINE

    payload = {
        "user_message": message,
        "predict": predict_result,
        "capacity": capacity_result,
        "heads": head_results,
        "recommendation": recommendation,
        "error": error,
        "need_guideline": need_guideline,
        "data_note": (
            "실측 분포상 capacity가 낮을수록(특히 <185 mAh/g) 불량 비율이 높고, "
            "높을수록(≥200) 정상 비율이 높다. 단, predict·capacity는 각각 별도 모델 "
            "결과이므로 숫자를 서로 대체하거나 임의로 만들지 말 것."
        ),
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


def compose_with_failover(
    message: str,
    predict_result: dict[str, Any] | None,
    error: str | None,
    need_guideline: bool = False,
    recommendation: dict[str, Any] | None = None,
    llm_mode: str | None = "auto",
    llm_credentials: list[dict[str, Any]] | None = None,
    capacity_result: dict[str, Any] | None = None,
    head_results: dict[str, Any] | None = None,
) -> tuple[str | None, str | None, str | None]:
    """
    Returns (reply_text, provider_label, user_facing_error).
    user_facing_error set on manual failure or missing credentials.
    """
    if not llm_enabled():
        return None, None, None

    creds = resolve_credentials(llm_credentials)
    if not creds:
        return None, None, NO_CREDENTIALS_NOTICE

    mode = (llm_mode or "auto").strip()
    messages = _build_messages(
        message,
        predict_result,
        error,
        need_guideline,
        recommendation,
        capacity_result=capacity_result,
        head_results=head_results,
    )

    if mode != "auto":
        chosen = next((c for c in creds if c.id == mode), None)
        if chosen is None:
            return None, None, "선택한 API를 찾을 수 없습니다. 보안 탭에서 다시 저장해 주세요."
        text = invoke_credential(chosen, messages)
        if text:
            return text, chosen.display_name or chosen.company, None
        return None, chosen.display_name, translate_llm_error("invoke failed")

    # Auto: cost ladder from floor(len/100), failover to next registered API
    ordered = select_auto_order(creds, message)
    last_err: str | None = None
    for i, cred in enumerate(ordered):
        text = invoke_credential(cred, messages)
        if text:
            if i > 0:
                if AUTO_FALLBACK_NOTICE.strip() not in text:
                    text = text.rstrip() + AUTO_FALLBACK_NOTICE
            return text, cred.display_name or cred.company, None
        last_err = translate_llm_error("auto candidate failed")

    return None, None, last_err
