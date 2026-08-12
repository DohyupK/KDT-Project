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

from agent.api_llm.prompts import SYSTEM_COMPOSE, USAGE_GUIDELINE
from agent.api_llm.providers import (
    invoke_credential,
    resolve_credentials,
    select_auto_order,
    translate_llm_error,
)

AUTO_FALLBACK_NOTICE = "\n\n[안내] 이전 API 한도/오류로 다른 등록 API가 답변했습니다."
NO_CREDENTIALS_NOTICE = (
    "등록된 API 키가 없습니다. 설정 페이지에서 API 키를 저장한 뒤 다시 시도해 주세요."
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
    residual_result: dict[str, Any] | None = None,
    head_results: dict[str, Any] | None = None,
    rag_sources: list[dict[str, Any]] | None = None,
) -> list[Any]:
    system = SYSTEM_COMPOSE
    if need_guideline:
        system = SYSTEM_COMPOSE + "\n\n" + USAGE_GUIDELINE

    payload = {
        "user_message": message,
        "predict": predict_result,
        "capacity": capacity_result,
        "residual": residual_result,
        "heads": head_results,
        "recommendation": recommendation,
        "rag_sources": rag_sources or [],
        "error": error,
        "need_guideline": need_guideline,
        "data_note": (
            "실측 분포상 (1) capacity가 낮을수록(특히 <185 mAh/g) 불량 비율이 높고 "
            "≥200이면 정상 비율이 높다. (2) residual_li가 3500–4500에서 불량 폭증, "
            "≥5000에서 불량>정상, ≥6500 정상 0. (3) residual↑ ↔ capacity↓ (r≈-0.66). "
            "단, predict·capacity·residual은 각각 별도 모델 결과이므로 "
            "숫자를 서로 대체하거나 임의로 만들지 말 것."
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
    residual_result: dict[str, Any] | None = None,
    head_results: dict[str, Any] | None = None,
    rag_sources: list[dict[str, Any]] | None = None,
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
        residual_result=residual_result,
        head_results=head_results,
        rag_sources=rag_sources,
    )

    if mode != "auto":
        chosen = next((c for c in creds if c.id == mode), None)
        if chosen is None:
            return None, None, "선택한 API를 찾을 수 없습니다. 설정 페이지에서 다시 저장해 주세요."
        invoke_errors: list[str] = []
        text = invoke_credential(chosen, messages, invoke_errors)
        if text:
            return text, chosen.display_name or chosen.company, None
        err_detail = invoke_errors[-1] if invoke_errors else "invoke failed"
        return None, chosen.display_name, translate_llm_error(err_detail)

    # Auto: cost ladder from floor(len/100), failover to next registered API
    ordered = select_auto_order(creds, message)
    last_err: str | None = None
    for i, cred in enumerate(ordered):
        invoke_errors = []
        text = invoke_credential(cred, messages, invoke_errors)
        if text:
            if i > 0:
                if AUTO_FALLBACK_NOTICE.strip() not in text:
                    text = text.rstrip() + AUTO_FALLBACK_NOTICE
            return text, cred.display_name or cred.company, None
        last_err = translate_llm_error(
            invoke_errors[-1] if invoke_errors else "auto candidate failed",
        )

    return None, None, last_err
