"""
LangGraph for security-tab: retrieve → gate → generate | no_docs.

Cloud LLM (Groq/Gemini) is never used. Generation is local vLLM only
when secure RAG returns hits.

Each run accumulates `trace` stages for FE/BE diagnostics.
"""

from __future__ import annotations

import logging
import time
from typing import Any, AsyncIterator, Awaitable, Callable, TypedDict

from langgraph.graph import END, START, StateGraph
from langchain_core.messages import HumanMessage, SystemMessage

from agent.rag_engine import NO_DOCS_REPLY, get_engine
from agent.secure_llm import make_vllm, usable_llm_text
from agent.secure_prompts import (
    ANALYTICS_GROUNDING_SUFFIX,
    ANALYTICS_RESULT_HEADER,
    EMPTY_RAG_REPLY,
    EMPTY_VLLM_REPLY,
    EXPLAIN_INSTRUCTION_SUFFIX,
    HIT_BUT_LLM_TIMEOUT_REPLY,
    NO_DOC_TOKEN,
    OFFLINE_REPLY,
    SUMMARY_INSTRUCTION_SUFFIX,
    SYSTEM_SECURE_RAG,
    expand_retrieve_query,
    finalize_reply_sources,
    format_compressed_extractive_reply,
    format_extractive_reply,
    format_rag_context_for_generate,
    history_for_generate,
    is_analytics_intent,
    is_short_followup,
    is_summary_intent,
    wants_explain_suffix,
)

logger = logging.getLogger(__name__)


class SecureState(TypedDict, total=False):
    message: str
    sources: list[dict[str, Any]]
    prior_sources: list[dict[str, Any]]
    history_text: str
    reply: str
    mode: str
    provider: str
    error: str | None
    trace: list[dict[str, Any]]
    _t0: float
    analytics_text: str
    use_analytics: bool
    fallback_to_rag: bool


def _trace_append(
    state: SecureState,
    stage: str,
    *,
    ok: bool,
    detail: str = "",
) -> list[dict[str, Any]]:
    t0 = float(state.get("_t0") or time.perf_counter())
    ms = int((time.perf_counter() - t0) * 1000)
    entry = {"stage": stage, "ms": ms, "ok": ok, "detail": detail[:400]}
    logger.info(
        "[secure-chat] stage=%s ok=%s ms=%s detail=%s",
        stage,
        ok,
        ms,
        detail[:200],
    )
    prev = list(state.get("trace") or [])
    prev.append(entry)
    return prev


def _llm_text_invoke(prompt: str) -> str:
    llm = make_vllm()
    out = llm.invoke([HumanMessage(content=prompt)])
    return usable_llm_text(out.content)


def _log_empty_llm(out: Any, *, stage: str) -> None:
    """Diagnose empty/junk completions without dumping full prompts."""
    meta = getattr(out, "response_metadata", None) or {}
    extra = getattr(out, "additional_kwargs", None) or {}
    raw = getattr(out, "content", None)
    logger.info(
        "[secure-chat] %s empty_or_junk content=%r meta_keys=%s finish=%s extra_keys=%s",
        stage,
        (str(raw)[:80] if raw is not None else None),
        list(meta.keys())[:12] if isinstance(meta, dict) else type(meta).__name__,
        meta.get("finish_reason") if isinstance(meta, dict) else None,
        list(extra.keys())[:12] if isinstance(extra, dict) else type(extra).__name__,
    )


def node_retrieve(state: SecureState) -> SecureState:
    trace = _trace_append(state, "retrieve_start", ok=True, detail="begin")
    state = {**state, "trace": trace}
    engine = get_engine()
    try:
        engine.ensure()
        if not engine.ready:
            err = engine.init_error or "rag_not_ready"
            return {
                **state,
                "sources": [],
                "reply": OFFLINE_REPLY,
                "mode": "template",
                "provider": "offline",
                "error": err,
                "trace": _trace_append(
                    state, "retrieve_done", ok=False, detail=f"rag_not_ready:{err}"
                ),
            }
        # Natural flow: always retrieve (query expand). Summary does not skip search.
        # A: short follow-up → expand with previous user utterance for retrieve.
        query, expanded = expand_retrieve_query(
            state.get("message") or "",
            state.get("history_text") or "",
        )
        if expanded:
            logger.info(
                "[secure-chat] retrieve query_expanded=True expand_query=%r",
                query[:500],
            )
        hits = engine.retrieve(
            query,
            top_k=12,
            rerank_top_n=6,
            llm_invoke=_llm_text_invoke,
        )
        # B: prior only for short follow-up; topic switch + 0 hits → no_docs.
        used_prior = False
        if not hits:
            msg = state.get("message") or ""
            # Short follow-up OR short summary-only ("요약해줘") → reuse prior.
            if is_short_followup(msg) or (
                is_summary_intent(msg) and len(msg.strip()) <= 40
            ):
                prior = list(state.get("prior_sources") or [])
                if prior:
                    hits = prior
                    used_prior = True
        doc_ids = ",".join(
            str(h.get("doc_id") or "") for h in hits[:3] if h.get("doc_id")
        )
        detail = (
            f"n_sources={len(hits)} docs={doc_ids} "
            f"query_expanded={expanded}"
        )
        if expanded:
            detail = f"{detail} expand_query={query[:220]}"
        if used_prior:
            detail = f"prior_sources {detail}"
        return {
            **state,
            "sources": hits,
            "error": None,
            "trace": _trace_append(
                state,
                "retrieve_done",
                ok=True,
                detail=detail,
            ),
        }
    except Exception as exc:  # noqa: BLE001
        err = str(exc)[:300]
        return {
            **state,
            "sources": [],
            "reply": OFFLINE_REPLY,
            "mode": "template",
            "provider": "offline",
            "error": err,
            "trace": _trace_append(
                state, "retrieve_done", ok=False, detail=err
            ),
        }


def node_gate(state: SecureState) -> str:
    if state.get("mode") == "template" and state.get("provider") == "offline":
        route = "done"
    elif not (state.get("sources") or []):
        route = "no_docs"
    else:
        route = "generate"
    # Gate is a routing function — mutate via side channel is awkward;
    # append trace in the next node. Log here for server console.
    t0 = float(state.get("_t0") or time.perf_counter())
    ms = int((time.perf_counter() - t0) * 1000)
    logger.info("[secure-chat] stage=gate ok=True ms=%s detail=route=%s", ms, route)
    return route


def node_no_docs(state: SecureState) -> SecureState:
    return {
        **state,
        "reply": NO_DOCS_REPLY,
        "mode": "security_no_docs",
        "provider": "rag",
        "error": None,
        "sources": [],
        "trace": _trace_append(
            state, "gate", ok=True, detail="route=no_docs"
        ),
    }


def node_route_start(state: SecureState) -> str:
    if is_analytics_intent(state.get("message") or ""):
        return "analytics"
    return "retrieve"


def node_analytics(state: SecureState) -> SecureState:
    from agent.analytics_engine import run_analytics

    state = {
        **state,
        "trace": _trace_append(
            state, "analytics_start", ok=True, detail="polars_csv_lake"
        ),
    }
    try:
        result = run_analytics(state.get("message") or "")
    except Exception as exc:  # noqa: BLE001
        err = str(exc)[:300]
        return {
            **state,
            "fallback_to_rag": True,
            "use_analytics": False,
            "analytics_text": "",
            "sources": [],
            "trace": _trace_append(
                state, "analytics_done", ok=False, detail=f"exc→rag {err}"
            ),
        }

    if result.get("fallback_to_rag"):
        return {
            **state,
            "fallback_to_rag": True,
            "use_analytics": False,
            "analytics_text": "",
            "sources": [],
            "trace": _trace_append(
                state,
                "analytics_done",
                ok=True,
                detail=f"fallback_to_rag reason={result.get('error')}",
            ),
        }

    text = result.get("analytics_text") or ""
    sources = list(result.get("sources") or [])
    return {
        **state,
        "fallback_to_rag": False,
        "use_analytics": True,
        "analytics_text": text,
        "sources": sources,
        "mode": "security_analytics",
        "provider": "polars",
        "error": None,
        "trace": _trace_append(
            state,
            "analytics_done",
            ok=True,
            detail=f"ok chars={len(text)} n_sources={len(sources)}",
        ),
    }


def node_after_analytics(state: SecureState) -> str:
    if state.get("fallback_to_rag"):
        return "retrieve"
    return "generate"


def node_generate(state: SecureState) -> SecureState:
    import os

    sources = list(state.get("sources") or [])
    state = {
        **state,
        "trace": _trace_append(
            state,
            "gate",
            ok=True,
            detail=f"route=generate n_sources={len(sources)}",
        ),
    }
    titles = sorted({str(s.get("title") or "") for s in sources if s.get("title")})
    summary_intent = is_summary_intent(state.get("message") or "")
    use_analytics = bool(
        state.get("use_analytics") and (state.get("analytics_text") or "").strip()
    )

    # Skip slow LM Studio generate — return cited excerpts (fixes related-query 500).
    gen_flag = os.environ.get("SECURE_GENERATE", "0").strip().lower()
    if gen_flag in ("0", "false", "no", "off"):
        if use_analytics:
            reply = (state.get("analytics_text") or "").strip()
            sources = list(state.get("sources") or [])
            reply, sources = finalize_reply_sources(reply, sources)
            return {
                **state,
                "reply": reply,
                "sources": sources,
                "mode": "security_analytics",
                "provider": "polars",
                "error": None,
                "trace": _trace_append(
                    state,
                    "generate_skipped",
                    ok=True,
                    detail="SECURE_GENERATE=0 analytics",
                ),
            }
        if summary_intent:
            reply = format_compressed_extractive_reply(
                sources,
                notice=(
                    "요약 요청으로 검색된 문서 발췌를 휴리스틱 압축했습니다 (LLM 미사용)."
                ),
            )
            detail = "SECURE_GENERATE=0 compressed_extractive summary_intent"
        else:
            reply = format_extractive_reply(
                sources,
                notice=(
                    "로컬 LLM 생성을 건너뛰고 검색된 문서 발췌를 그대로 제공합니다 "
                    "(SECURE_GENERATE=0). 요약 생성이 필요하면 .env에서 SECURE_GENERATE=1 "
                    "후 LM Studio 부하를 확인하세요."
                ),
            )
            detail = "SECURE_GENERATE=0 extractive"
        reply, sources = finalize_reply_sources(reply, sources)
        return {
            **state,
            "reply": reply,
            "sources": sources,
            "mode": "security_rag",
            "provider": "rag_extractive",
            "error": None,
            "trace": _trace_append(
                state,
                "generate_skipped",
                ok=True,
                detail=detail,
            ),
        }

    state = {
        **state,
        "trace": _trace_append(
            state,
            "generate_start",
            ok=True,
            detail="vllm_invoke_summary" if summary_intent else "vllm_invoke",
        ),
    }
    gen_t0 = time.perf_counter()
    timeout_s = float(os.environ.get("SECURE_VLLM_TIMEOUT", "45"))
    max_tokens = int(os.environ.get("SECURE_VLLM_MAX_TOKENS", "256"))
    # Short briefing paths: ignore large global max_tokens (e.g. 1024).
    brief_path = summary_intent or wants_explain_suffix(
        state.get("message") or "", sources
    )
    if brief_path:
        max_tokens = 256
    context = format_rag_context_for_generate(sources)
    cite_hint = ", ".join(f"[출처: {t}]" for t in titles if t)
    history = history_for_generate(state.get("history_text") or "")
    history_block = f"이전 대화:\n{history}\n\n" if history else ""
    if use_analytics:
        user_block = (
            f"{history_block}"
            f"질문:\n{state['message']}\n\n"
            f"{ANALYTICS_RESULT_HEADER}\n{state.get('analytics_text')}\n\n"
            f"답변 끝에 사용한 출처를 붙여라. 예: {cite_hint}\n\n"
            f"{ANALYTICS_GROUNDING_SUFFIX}"
        )
    else:
        user_block = (
            f"{history_block}"
            f"질문:\n{state['message']}\n\n"
            f"검색된 사내 문서 발췌:\n{context}\n\n"
            f"답변 끝에 사용한 문서에 대해 반드시 인용을 붙이세요. 예: {cite_hint}"
        )
        if summary_intent:
            user_block = f"{user_block}\n\n{SUMMARY_INSTRUCTION_SUFFIX}"
        elif wants_explain_suffix(state.get("message") or "", sources):
            user_block = f"{user_block}\n\n{EXPLAIN_INSTRUCTION_SUFFIX}"
    prompt_chars = len(SYSTEM_SECURE_RAG) + len(user_block)
    state = {
        **state,
        "trace": _trace_append(
            state,
            "generate_prompt",
            ok=True,
            detail=(
                f"prompt_chars={prompt_chars} history_chars={len(history)} "
                f"ctx_chars={len(context)} timeout_s={timeout_s} "
                f"max_tokens={max_tokens} summary={summary_intent} "
                f"brief_cap={brief_path}"
            ),
        ),
    }
    try:
        llm = make_vllm(max_tokens=max_tokens)
        out = llm.invoke(
            [
                SystemMessage(content=SYSTEM_SECURE_RAG),
                HumanMessage(content=user_block),
            ]
        )
        reply = usable_llm_text(out.content)
        gen_ms = int((time.perf_counter() - gen_t0) * 1000)
        logger.info(
            "[secure-chat] generate elapsed_ms=%s prompt_chars=%s reply_len=%s",
            gen_ms,
            prompt_chars,
            len(reply or ""),
        )
        if not reply:
            _log_empty_llm(out, stage="generate_first")
            # One retry: no history, shorter instruction (empty content ≠ timeout).
            retry_block = (
                f"질문:\n{state['message']}\n\n"
                f"검색된 사내 문서 발췌:\n{context}\n\n"
                "위 발췌만 근거로 한국어 2~5문장으로 바로 답하라. "
                "빈 문자열·도구호출 금지. "
                f"답 끝에 인용을 붙여라. 예: {cite_hint}"
            )
            if use_analytics:
                retry_block = (
                    f"질문:\n{state['message']}\n\n"
                    f"{ANALYTICS_RESULT_HEADER}\n{state.get('analytics_text')}\n\n"
                    "위 집계 결과만 근거로 한국어 2~5문장으로 바로 답하라. "
                    "빈 문자열·도구호출 금지. "
                    f"답 끝에 인용을 붙여라. 예: {cite_hint}\n\n"
                    f"{ANALYTICS_GROUNDING_SUFFIX}"
                )
            elif summary_intent:
                retry_block = f"{retry_block}\n\n{SUMMARY_INSTRUCTION_SUFFIX}"
            elif wants_explain_suffix(state.get("message") or "", sources):
                retry_block = f"{retry_block}\n\n{EXPLAIN_INSTRUCTION_SUFFIX}"
            state = {
                **state,
                "trace": _trace_append(
                    state,
                    "generate_retry",
                    ok=True,
                    detail=f"empty_first_reply gen_ms={gen_ms} retry_no_history",
                ),
            }
            try:
                out2 = llm.invoke(
                    [
                        SystemMessage(content=SYSTEM_SECURE_RAG),
                        HumanMessage(content=retry_block),
                    ]
                )
                reply = usable_llm_text(out2.content)
                if not reply:
                    _log_empty_llm(out2, stage="generate_retry")
            except Exception as retry_exc:  # noqa: BLE001
                logger.warning(
                    "[secure-chat] generate retry fail: %s", str(retry_exc)[:200]
                )
                reply = ""
            gen_ms = int((time.perf_counter() - gen_t0) * 1000)
            logger.info(
                "[secure-chat] generate retry elapsed_ms=%s reply_len=%s",
                gen_ms,
                len(reply or ""),
            )
            if not reply:
                reply = format_extractive_reply(
                    sources,
                    notice=EMPTY_VLLM_REPLY + " 아래는 검색된 원문 발췌입니다.",
                )
                reply, sources = finalize_reply_sources(reply, sources)
                return {
                    **state,
                    "reply": reply,
                    "sources": sources,
                    "mode": "security_rag",
                    "provider": "rag_extractive",
                    "error": "empty_vllm_reply",
                    "trace": _trace_append(
                        state,
                        "generate_fail",
                        ok=False,
                        detail=f"empty_vllm_reply→extractive gen_ms={gen_ms}",
                    ),
                }
        reply, sources = finalize_reply_sources(reply, sources)
        return {
            **state,
            "reply": reply,
            "sources": sources,
            "mode": "security_analytics" if use_analytics else "security_rag",
            "provider": "polars" if use_analytics else "vllm",
            "error": None,
            "trace": _trace_append(
                state,
                "generate_done",
                ok=True,
                detail=f"reply_len={len(reply)} gen_ms={gen_ms} prompt_chars={prompt_chars}",
            ),
        }
    except Exception as exc:  # noqa: BLE001
        err = str(exc)[:300]
        gen_ms = int((time.perf_counter() - gen_t0) * 1000)
        logger.warning(
            "[secure-chat] generate fail elapsed_ms=%s prompt_chars=%s err=%s",
            gen_ms,
            prompt_chars,
            err[:200],
        )
        reply = format_extractive_reply(
            sources,
            notice=(
                HIT_BUT_LLM_TIMEOUT_REPLY.split("\n\n")[0]
                + f" 아래는 검색된 원문 발췌입니다. (gen_ms={gen_ms}, {err[:120]})"
            ),
        )
        reply, sources = finalize_reply_sources(reply, sources)
        return {
            **state,
            "reply": reply,
            "sources": sources,
            "mode": "security_rag",
            "provider": "rag_extractive",
            "error": err,
            "trace": _trace_append(
                state,
                "generate_fail",
                ok=False,
                detail=f"gen_ms={gen_ms} prompt_chars={prompt_chars} {err}→extractive",
            ),
        }


def node_done(state: SecureState) -> SecureState:
    return {
        **state,
        "trace": _trace_append(
            state,
            "gate",
            ok=True,
            detail="route=done (offline after retrieve)",
        ),
    }


def build_secure_graph():
    g: StateGraph = StateGraph(SecureState)
    g.add_node("analytics", node_analytics)
    g.add_node("retrieve", node_retrieve)
    g.add_node("no_docs", node_no_docs)
    g.add_node("generate", node_generate)
    g.add_node("done", node_done)
    g.add_conditional_edges(
        START,
        node_route_start,
        {"analytics": "analytics", "retrieve": "retrieve"},
    )
    g.add_conditional_edges(
        "analytics",
        node_after_analytics,
        {"retrieve": "retrieve", "generate": "generate"},
    )
    g.add_conditional_edges(
        "retrieve",
        node_gate,
        {
            "no_docs": "no_docs",
            "generate": "generate",
            "done": "done",
        },
    )
    g.add_edge("no_docs", END)
    g.add_edge("generate", END)
    g.add_edge("done", END)
    return g.compile()


_GRAPH = None  # rebuilt on first run_secure_chat after topology changes


def run_secure_chat(
    message: str,
    *,
    prior_sources: list[dict[str, Any]] | None = None,
    history_text: str | None = None,
) -> dict[str, Any]:
    global _GRAPH
    text = (message or "").strip()
    if not text:
        return {
            "reply": "메시지가 비어 있습니다.",
            "mode": "template",
            "provider": "offline",
            "error": "empty_message",
            "sources": [],
            "trace": [
                {
                    "stage": "empty_message",
                    "ms": 0,
                    "ok": False,
                    "detail": "empty_message",
                }
            ],
        }
    if _GRAPH is None:
        _GRAPH = build_secure_graph()
    t0 = time.perf_counter()
    out = _GRAPH.invoke(
        {
            "message": text,
            "sources": [],
            "prior_sources": list(prior_sources or []),
            "history_text": (history_text or "").strip(),
            "trace": [],
            "_t0": t0,
        }
    )
    sources = out.get("sources") or []
    clean = []
    for s in sources:
        clean.append(
            {
                "doc_id": s.get("doc_id"),
                "title": s.get("title"),
                "category": s.get("category"),
                "process": s.get("process"),
                "source_path": s.get("source_path"),
                "chunk_index": s.get("chunk_index"),
                "text": s.get("text"),
            }
        )
    trace = list(out.get("trace") or [])
    total_ms = int((time.perf_counter() - t0) * 1000)
    trace.append(
        {
            "stage": "run_complete",
            "ms": total_ms,
            "ok": True,
            "detail": f"mode={out.get('mode')} n_sources={len(clean)}",
        }
    )
    logger.info(
        "[secure-chat] stage=run_complete ok=True ms=%s mode=%s n_sources=%s",
        total_ms,
        out.get("mode"),
        len(clean),
    )
    return {
        "reply": out.get("reply") or "",
        "mode": out.get("mode") or "template",
        "provider": out.get("provider") or "offline",
        "error": out.get("error"),
        "sources": clean,
        "trace": trace,
    }


def _token_hold_suffix_len(raw: str, token: str) -> int:
    """
    Longest k where raw's suffix of length k is a prefix of token.
    Reverse scan — holds partial control tokens (e.g. '[SYS_').
    """
    if not raw or not token:
        return 0
    max_k = min(len(raw), len(token) - 1)
    for k in range(max_k, 0, -1):
        if token.startswith(raw[-k:]):
            return k
    return 0


def _clean_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    clean: list[dict[str, Any]] = []
    for s in sources or []:
        clean.append(
            {
                "doc_id": s.get("doc_id"),
                "title": s.get("title"),
                "category": s.get("category"),
                "process": s.get("process"),
                "source_path": s.get("source_path"),
                "chunk_index": s.get("chunk_index"),
                "text": s.get("text"),
            }
        )
    return clean


def _sse_event(event: str, data: dict[str, Any]) -> dict[str, Any]:
    return {"event": event, "data": data}


def _chunk_text(content: Any) -> str:
    """Raw incremental text from an astream chunk (do not strip mid-stream)."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and "text" in block:
                parts.append(str(block["text"]))
        return "".join(parts)
    return str(content)


DisconnectCheck = Callable[[], Awaitable[bool]]


async def stream_secure_chat(
    message: str,
    *,
    prior_sources: list[dict[str, Any]] | None = None,
    history_text: str | None = None,
    is_disconnected: DisconnectCheck | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """
    SSE-oriented async generator.
    Yields dicts: {"event": meta|delta|replace|done|error, "data": {...}}.
    Preserves retrieve diversify/prior via node_retrieve; SECURE_GENERATE gate unchanged.
    """
    import os

    text = (message or "").strip()
    t0 = time.perf_counter()

    def elapsed_ms() -> int:
        return int((time.perf_counter() - t0) * 1000)

    async def disconnected() -> bool:
        if is_disconnected is None:
            return False
        try:
            return bool(await is_disconnected())
        except Exception:  # noqa: BLE001
            return False

    if not text:
        yield _sse_event(
            "done",
            {
                "reply": "메시지가 비어 있습니다.",
                "mode": "template",
                "provider": "offline",
                "error": "empty_message",
                "sources": [],
                "trace": [],
                "elapsed_ms": elapsed_ms(),
            },
        )
        return

    state: SecureState = {
        "message": text,
        "sources": [],
        "prior_sources": list(prior_sources or []),
        "history_text": (history_text or "").strip(),
        "trace": [],
        "_t0": t0,
    }

    try:
        used_analytics = False

        if is_analytics_intent(text):
            yield _sse_event(
                "meta",
                {
                    "stage": "analytics",
                    "mode": "security_analytics",
                    "provider": "polars",
                },
            )
            state = node_analytics(state)
            if await disconnected():
                return
            if state.get("use_analytics") and not state.get("fallback_to_rag"):
                used_analytics = True

        if not used_analytics:
            # Early meta before heavy retrieve/rerank (TTFB feel).
            yield _sse_event(
                "meta",
                {
                    "stage": "retrieve",
                    "mode": "security_rag",
                    "provider": "vllm",
                },
            )

            state = node_retrieve(state)
            if await disconnected():
                return

            route = node_gate(state)
            if route == "done":
                state = node_done(state)
                yield _sse_event(
                    "done",
                    {
                        "reply": state.get("reply") or OFFLINE_REPLY,
                        "mode": state.get("mode") or "template",
                        "provider": state.get("provider") or "offline",
                        "error": state.get("error"),
                        "sources": _clean_sources(list(state.get("sources") or [])),
                        "trace": list(state.get("trace") or []),
                        "elapsed_ms": elapsed_ms(),
                    },
                )
                return

            if route == "no_docs":
                state = node_no_docs(state)
                yield _sse_event(
                    "done",
                    {
                        "reply": state.get("reply") or NO_DOCS_REPLY,
                        "mode": state.get("mode") or "security_no_docs",
                        "provider": state.get("provider") or "rag",
                        "error": None,
                        "sources": [],
                        "trace": list(state.get("trace") or []),
                        "elapsed_ms": elapsed_ms(),
                    },
                )
                return

        sources = list(state.get("sources") or [])
        summary_intent = is_summary_intent(text)
        explain = wants_explain_suffix(text, sources)
        gen_flag = os.environ.get("SECURE_GENERATE", "0").strip().lower()

        yield _sse_event(
            "meta",
            {
                "stage": "generate",
                "mode": "security_analytics" if used_analytics else "security_rag",
                "provider": "polars" if used_analytics else "vllm",
                "n_sources": len(sources),
            },
        )

        if gen_flag in ("0", "false", "no", "off"):
            gen_state = node_generate(state)
            yield _sse_event(
                "done",
                {
                    "reply": gen_state.get("reply") or "",
                    "mode": gen_state.get("mode")
                    or ("security_analytics" if used_analytics else "security_rag"),
                    "provider": gen_state.get("provider")
                    or ("polars" if used_analytics else "rag_extractive"),
                    "error": gen_state.get("error"),
                    "sources": _clean_sources(list(gen_state.get("sources") or [])),
                    "trace": list(gen_state.get("trace") or []),
                    "elapsed_ms": elapsed_ms(),
                },
            )
            return

        titles = sorted({str(s.get("title") or "") for s in sources if s.get("title")})
        context = format_rag_context_for_generate(sources)
        cite_hint = ", ".join(f"[출처: {t}]" for t in titles if t)
        history = history_for_generate(state.get("history_text") or "")
        history_block = f"이전 대화:\n{history}\n\n" if history else ""
        if used_analytics:
            user_block = (
                f"{history_block}"
                f"질문:\n{text}\n\n"
                f"{ANALYTICS_RESULT_HEADER}\n{state.get('analytics_text')}\n\n"
                f"답변 끝에 사용한 출처를 붙여라. 예: {cite_hint}\n\n"
                f"{ANALYTICS_GROUNDING_SUFFIX}"
            )
        else:
            user_block = (
                f"{history_block}"
                f"질문:\n{text}\n\n"
                f"검색된 사내 문서 발췌:\n{context}\n\n"
                f"답변 끝에 사용한 문서에 대해 반드시 인용을 붙이세요. 예: {cite_hint}"
            )
            if summary_intent:
                user_block = f"{user_block}\n\n{SUMMARY_INSTRUCTION_SUFFIX}"
            elif explain:
                user_block = f"{user_block}\n\n{EXPLAIN_INSTRUCTION_SUFFIX}"

        max_tokens = int(os.environ.get("SECURE_VLLM_MAX_TOKENS", "256"))
        if (not used_analytics) and (summary_intent or explain):
            max_tokens = 256
        llm = make_vllm(max_tokens=max_tokens)
        raw = ""
        emitted = ""
        messages = [
            SystemMessage(content=SYSTEM_SECURE_RAG),
            HumanMessage(content=user_block),
        ]

        async for chunk in llm.astream(messages):
            if await disconnected():
                return
            piece = _chunk_text(getattr(chunk, "content", None))
            if not piece:
                continue

            raw += piece

            if NO_DOC_TOKEN in raw:
                yield _sse_event(
                    "replace",
                    {
                        "reply": EMPTY_RAG_REPLY,
                        "sources": [],
                        "mode": "security_rag",
                        "provider": "vllm",
                        "error": None,
                    },
                )
                yield _sse_event(
                    "done",
                    {
                        "reply": EMPTY_RAG_REPLY,
                        "mode": "security_rag",
                        "provider": "vllm",
                        "error": None,
                        "sources": [],
                        "trace": list(state.get("trace") or []),
                        "elapsed_ms": elapsed_ms(),
                    },
                )
                return

            hold_k = _token_hold_suffix_len(raw, NO_DOC_TOKEN)
            safe = raw[:-hold_k] if hold_k else raw
            if len(safe) > len(emitted):
                delta = safe[len(emitted) :]
                emitted = safe
                if delta:
                    yield _sse_event("delta", {"text": delta})

        if await disconnected():
            return

        if len(raw) > len(emitted):
            tail = raw[len(emitted) :]
            if tail and not NO_DOC_TOKEN.startswith(tail):
                yield _sse_event("delta", {"text": tail})
                emitted = raw

        final_raw = emitted if emitted else raw
        if not (final_raw or "").strip():
            reply = format_extractive_reply(
                sources,
                notice=EMPTY_VLLM_REPLY + " 아래는 검색된 원문 발췌입니다.",
            )
            reply, sources_out = finalize_reply_sources(reply, sources)
            yield _sse_event(
                "done",
                {
                    "reply": reply,
                    "mode": "security_rag",
                    "provider": "rag_extractive",
                    "error": "empty_vllm_reply",
                    "sources": _clean_sources(sources_out),
                    "trace": list(state.get("trace") or []),
                    "elapsed_ms": elapsed_ms(),
                },
            )
            return

        reply, sources_out = finalize_reply_sources(final_raw, sources)
        yield _sse_event(
            "done",
            {
                "reply": reply,
                "mode": "security_analytics" if used_analytics else "security_rag",
                "provider": "polars" if used_analytics else "vllm",
                "error": None,
                "sources": _clean_sources(sources_out),
                "trace": list(state.get("trace") or []),
                "elapsed_ms": elapsed_ms(),
            },
        )
    except Exception as exc:  # noqa: BLE001
        err = str(exc)[:400]
        logger.warning("[secure-chat] stream fail err=%s", err[:200])
        yield _sse_event(
            "error",
            {"error": err, "stage": "stream_secure_chat", "elapsed_ms": elapsed_ms()},
        )
