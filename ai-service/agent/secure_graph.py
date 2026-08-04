"""
LangGraph for security-tab: retrieve → gate → generate | no_docs.

Cloud LLM (Groq/Gemini) is never used. Generation is local vLLM only
when secure RAG returns hits.

Each run accumulates `trace` stages for FE/BE diagnostics.
"""

from __future__ import annotations

import logging
import time
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langchain_core.messages import HumanMessage, SystemMessage

from agent.rag_engine import NO_DOCS_REPLY, get_engine
from agent.secure_llm import make_vllm, usable_llm_text
from agent.secure_prompts import (
    EMPTY_VLLM_REPLY,
    HIT_BUT_LLM_TIMEOUT_REPLY,
    OFFLINE_REPLY,
    SUMMARY_INSTRUCTION_SUFFIX,
    SYSTEM_SECURE_RAG,
    expand_retrieve_query,
    finalize_reply_sources,
    format_compressed_extractive_reply,
    format_extractive_reply,
    format_rag_context_for_generate,
    history_for_generate,
    is_short_followup,
    is_summary_intent,
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
        hits = engine.retrieve(
            query,
            top_k=8,
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

    # Skip slow LM Studio generate — return cited excerpts (fixes related-query 500).
    gen_flag = os.environ.get("SECURE_GENERATE", "0").strip().lower()
    if gen_flag in ("0", "false", "no", "off"):
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
    context = format_rag_context_for_generate(sources)
    cite_hint = ", ".join(f"[출처: {t}]" for t in titles if t)
    history = history_for_generate(state.get("history_text") or "")
    history_block = f"이전 대화:\n{history}\n\n" if history else ""
    user_block = (
        f"{history_block}"
        f"질문:\n{state['message']}\n\n"
        f"검색된 사내 문서 발췌:\n{context}\n\n"
        f"답변 끝에 사용한 문서에 대해 반드시 인용을 붙이세요. 예: {cite_hint}"
    )
    if summary_intent:
        user_block = f"{user_block}\n\n{SUMMARY_INSTRUCTION_SUFFIX}"
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
                f"max_tokens={max_tokens} summary={summary_intent}"
            ),
        ),
    }
    try:
        llm = make_vllm()
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
            if summary_intent:
                retry_block = f"{retry_block}\n\n{SUMMARY_INSTRUCTION_SUFFIX}"
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
            "mode": "security_rag",
            "provider": "vllm",
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
    g.add_node("retrieve", node_retrieve)
    g.add_node("no_docs", node_no_docs)
    g.add_node("generate", node_generate)
    g.add_node("done", node_done)
    g.add_edge(START, "retrieve")
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


_GRAPH = None


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
