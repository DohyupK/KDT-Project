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

from agent.api_llm.prompts import (
    RAG_EMPTY_HINT,
    SYSTEM_COMPOSE,
    SYSTEM_POLISH,
    USAGE_GUIDELINE,
)
from agent.api_llm.grounding import (
    analysis_mode,
    build_grounding,
    is_lot_why_intent,
    is_page_summary_intent,
    menu_answer_contract,
    message_lot_issue_ids,
    normalize_korean_reply,
    route_label,
)
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
    history_text: str | None = None,
    need_rag: bool = False,
) -> list[Any]:
    system = SYSTEM_COMPOSE
    if need_guideline:
        system = SYSTEM_COMPOSE + "\n\n" + USAGE_GUIDELINE

    route = ""
    if isinstance(page_context, dict):
        route = str(page_context.get("route") or page_context.get("Route") or "")
    grounding = build_grounding(message, page_context, predict_result)
    sources = list(rag_sources or [])
    pc_out = page_context
    supplement = (
        pc_out.get("supplement")
        if isinstance(pc_out, dict) and isinstance(pc_out.get("supplement"), dict)
        else None
    )
    tool_contract = supplement.get("responseContract") if supplement else None
    answer_contract = (
        [str(value) for value in tool_contract if str(value).strip()]
        if isinstance(tool_contract, list)
        else menu_answer_contract(route)
    )
    if sources:
        if not is_lot_why_intent(message):
            grounding.pop("analysis_hint", None)
    elif need_rag and not supplement:
        grounding["empty_answer_hint"] = RAG_EMPTY_HINT

    page_sum = is_page_summary_intent(message)
    ents = message_lot_issue_ids(message)
    payload = {
        "user_message": message,
        "recent_turns": None if page_sum else ((history_text or "").strip() or None),
        "route": route,
        "route_label": route_label(route),
        "answer_contract": answer_contract,
        "analysis_mode": False if sources else (
            analysis_mode(message) or grounding.get("analysis_mode")
        ),
        "page_context": pc_out,
        "grounding": grounding,
        "predict": predict_result,
        "capacity": capacity_result,
        "residual": residual_result,
        "heads": head_results,
        "recommendation": recommendation,
        "rag_sources": sources,
        "error": error,
    }
    if page_sum:
        follow = "이전 대화는 무시하고 지금 page_payload만 요약하세요. "
    elif ents:
        follow = (
            "질문에 있는 LOT/이슈/문의만 답하세요. "
            "page_payload의 설정/문의 필드는 인용하지 마세요. "
        )
    else:
        follow = "recent_turns가 있으면 이어서 대화하세요. "
    return [
        SystemMessage(content=system),
        HumanMessage(
            content=(
                "아래 JSON을 보고 한국어로 답해 주세요. "
                f"지금 화면 route={route or '/'} ({route_label(route)}). "
                + follow
                + "answer_contract 순서에 맞춰 데이터의 의미, 우선순위, 다음 행동을 답하세요. "
                + "primary_table, items 같은 내부 JSON 키와 원본 JSON은 사용자에게 출력하지 마세요. "
                + "last_event가 있으면 그 동작과 지금 화면을 함께 보세요.\n"
                + json.dumps(payload, ensure_ascii=False, default=str)
            )
        ),
    ]


def _invoke_text(
    creds: list[Any],
    messages: list[Any],
    *,
    llm_mode: str,
    ladder_text: str,
) -> tuple[str | None, str | None, str | None]:
    """Returns (text, provider_label, user_facing_error)."""
    mode = (llm_mode or "auto").strip()
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

    ordered = select_auto_order(creds, ladder_text)
    last_err: str | None = None
    for i, cred in enumerate(ordered):
        invoke_errors = []
        text = invoke_credential(cred, messages, invoke_errors)
        if text:
            if i > 0 and AUTO_FALLBACK_NOTICE.strip() not in text:
                text = text.rstrip() + AUTO_FALLBACK_NOTICE
            return text, cred.display_name or cred.company, None
        last_err = translate_llm_error(
            invoke_errors[-1] if invoke_errors else "auto candidate failed",
        )
    return None, None, last_err


def polish_reply(
    draft: str,
    *,
    current_question: str,
    llm_mode: str | None = "auto",
    llm_credentials: list[dict[str, Any]] | None = None,
) -> str:
    """Second LLM pass: spacing + drop repeated numbered lists. Facts unchanged."""
    draft = (draft or "").strip()
    if not draft:
        return draft
    creds = resolve_credentials(llm_credentials)
    if not creds:
        return normalize_korean_reply(draft)
    messages = [
        SystemMessage(content=SYSTEM_POLISH),
        HumanMessage(
            content=(
                f"사용자 질문:\n{(current_question or '').strip()}\n\n"
                f"초안:\n{draft}"
            )
        ),
    ]
    text, _provider, _err = _invoke_text(
        creds,
        messages,
        llm_mode=llm_mode or "auto",
        ladder_text=draft,
    )
    if text and text.strip():
        return normalize_korean_reply(text)
    return normalize_korean_reply(draft)


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
    history_text: str | None = None,
    need_rag: bool = False,
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
        history_text=history_text,
        need_rag=need_rag,
    )
    text, provider, llm_err = _invoke_text(
        creds,
        messages,
        llm_mode=llm_mode or "auto",
        ladder_text=message,
    )
    if text:
        polished = polish_reply(
            text,
            current_question=message,
            llm_mode=llm_mode,
            llm_credentials=llm_credentials,
        )
        return polished, provider, None
    return None, provider, llm_err


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
    history_text: str | None = None,
    need_rag: bool = False,
):
    """
    Buffer 1st compose, polish, then yield ("delta", polished chunks)
    and ("done", {reply, provider, error}). Draft is not streamed.
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
        history_text=history_text,
        need_rag=need_rag,
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
                text = "".join(buf).strip()
            else:
                errs: list[str] = []
                text = invoke_credential(cred, messages, errs) or ""
                if not text and errs:
                    last_err = translate_llm_error(errs[-1])
                    continue
            if text:
                if i > 0 and AUTO_FALLBACK_NOTICE.strip() not in text:
                    text = text.rstrip() + AUTO_FALLBACK_NOTICE
                polished = polish_reply(
                    text,
                    current_question=message,
                    llm_mode=llm_mode,
                    llm_credentials=llm_credentials,
                )
                step = 48
                for j in range(0, len(polished), step):
                    yield ("delta", polished[j : j + step])
                yield ("done", {"reply": polished, "provider": label, "error": None})
                return
        except Exception as exc:  # noqa: BLE001
            last_err = translate_llm_error(exc)
            continue
    yield ("done", {"reply": None, "provider": None, "error": last_err})
