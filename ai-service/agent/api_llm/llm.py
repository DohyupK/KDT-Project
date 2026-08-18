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
from agent.api_llm.grounding import analysis_mode, build_grounding, normalize_korean_reply, route_label
from agent.api_llm.providers import (
    invoke_credential,
    resolve_credentials,
    select_auto_order,
    stream_openai_compatible,
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
    page_context: dict[str, Any] | None = None,
) -> list[Any]:
    system = SYSTEM_COMPOSE
    if need_guideline:
        system = SYSTEM_COMPOSE + "\n\n" + USAGE_GUIDELINE

    route = ""
    if isinstance(page_context, dict):
        route = str(page_context.get("route") or page_context.get("Route") or "")
    grounding = build_grounding(message, page_context, predict_result)
    payload = {
        "user_message": message,
        "route": route,
        "route_label": route_label(route),
        "analysis_mode": analysis_mode(message) or grounding.get("analysis_mode"),
        "page_context": page_context,
        "grounding": grounding,
        "predict": predict_result,
        "capacity": capacity_result,
        "residual": residual_result,
        "heads": head_results,
        "recommendation": recommendation,
        "rag_sources": rag_sources or [],
        "error": error,
        "need_guideline": need_guideline,
        "data_note": (
            "사실 근거는 page_context·grounding만. history의 LOT/% 재인용 금지. "
            "visible_ui에 없는 탭/메뉴를 만들지 말 것. "
            "「현재 화면은 ○○만 보입니다」를 사용자 답에 쓰지 말 것. empty_answer_hint 최우선. "
            "focusId/lotId가 있으면 그 LOT만 답하고 목록을 나열하지 말 것. "
            "must_match_route와 다른 페이지명을 말하지 말 것. "
            "시스템 규칙 문장을 답에 그대로 쓰지 말 것. "
            "analysis_mode면 나열이 아니라 해석. 띄어쓰기·줄바꿈 필수. 반복 금지."
        ),
    }
    return [
        SystemMessage(content=system),
        HumanMessage(
            content=(
                "다음 JSON만 근거로 한국어 답변을 작성하세요. "
                f"현재 화면 route={route or '/'} ({route_label(route)}). "
                "띄어쓰기와 줄바꿈을 지키세요.\n"
                + json.dumps(payload, ensure_ascii=False, default=str)
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
    page_context: dict[str, Any] | None = None,
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
        page_context=page_context,
    )

    if mode != "auto":
        chosen = next((c for c in creds if c.id == mode), None)
        if chosen is None:
            return None, None, "선택한 API를 찾을 수 없습니다. 설정 페이지에서 다시 저장해 주세요."
        invoke_errors: list[str] = []
        text = invoke_credential(chosen, messages, invoke_errors)
        if text:
            return normalize_korean_reply(text), chosen.display_name or chosen.company, None
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
            return normalize_korean_reply(text), cred.display_name or cred.company, None
        last_err = translate_llm_error(
            invoke_errors[-1] if invoke_errors else "auto candidate failed",
        )

    return None, None, last_err


def iter_compose_stream(
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
    page_context: dict[str, Any] | None = None,
):
    """
    Yield ("delta", text) chunks then ("done", {reply, provider, error}).
    Prefer OpenAI-compatible streaming; otherwise one-shot then chunk.
    """
    if not llm_enabled():
        yield ("done", {"reply": None, "provider": None, "error": None})
        return

    creds = resolve_credentials(llm_credentials)
    if not creds:
        yield ("done", {"reply": None, "provider": None, "error": NO_CREDENTIALS_NOTICE})
        return

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
        page_context=page_context,
    )
    mode = (llm_mode or "auto").strip()
    ordered = (
        [next((c for c in creds if c.id == mode), None)]
        if mode != "auto"
        else select_auto_order(creds, message)
    )
    ordered = [c for c in ordered if c is not None]
    if mode != "auto" and not ordered:
        yield (
            "done",
            {
                "reply": None,
                "provider": None,
                "error": "선택한 API를 찾을 수 없습니다. 설정 페이지에서 다시 저장해 주세요.",
            },
        )
        return

    last_err: str | None = None
    for i, cred in enumerate(ordered):
        label = cred.display_name or cred.company
        buf: list[str] = []
        try:
            if cred.provider_kind == "openai_compatible":
                for piece in stream_openai_compatible(cred, messages):
                    buf.append(piece)
                    yield ("delta", piece)
                text = "".join(buf).strip()
            else:
                errs: list[str] = []
                text = invoke_credential(cred, messages, errs) or ""
                if not text and errs:
                    last_err = translate_llm_error(errs[-1])
                    continue
                # Perceived streaming for non-stream providers
                step = 48
                for j in range(0, len(text), step):
                    chunk = text[j : j + step]
                    yield ("delta", chunk)
            if text:
                if i > 0 and AUTO_FALLBACK_NOTICE.strip() not in text:
                    notice = AUTO_FALLBACK_NOTICE
                    yield ("delta", notice)
                    text = text.rstrip() + notice
                text = normalize_korean_reply(text)
                yield ("done", {"reply": text, "provider": label, "error": None})
                return
        except Exception as exc:  # noqa: BLE001
            last_err = translate_llm_error(exc)
            continue
    yield ("done", {"reply": None, "provider": None, "error": last_err})
