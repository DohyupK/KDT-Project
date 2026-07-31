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
from agent.secure_llm import content_to_text, make_vllm
from agent.secure_prompts import (
    HIT_BUT_LLM_TIMEOUT_REPLY,
    OFFLINE_REPLY,
    SYSTEM_SECURE_RAG,
    format_extractive_reply,
    format_rag_context,
)

logger = logging.getLogger(__name__)


class SecureState(TypedDict, total=False):
    message: str
    sources: list[dict[str, Any]]
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
    return content_to_text(out.content)


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
        hits = engine.retrieve(
            state["message"],
            top_k=8,
            rerank_top_n=4,
            llm_invoke=_llm_text_invoke,
        )
        doc_ids = ",".join(
            str(h.get("doc_id") or "") for h in hits[:3] if h.get("doc_id")
        )
        return {
            **state,
            "sources": hits,
            "error": None,
            "trace": _trace_append(
                state,
                "retrieve_done",
                ok=True,
                detail=f"n_sources={len(hits)} docs={doc_ids}",
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

    sources = state.get("sources") or []
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

    # Skip slow LM Studio generate — return cited excerpts (fixes related-query 500).
    gen_flag = os.environ.get("SECURE_GENERATE", "0").strip().lower()
    if gen_flag in ("0", "false", "no", "off"):
        reply = format_extractive_reply(
            sources,
            notice=(
                "로컬 LLM 생성을 건너뛰고 검색된 문서 발췌를 그대로 제공합니다 "
                "(SECURE_GENERATE=0). 요약 생성이 필요하면 .env에서 SECURE_GENERATE=1 "
                "후 LM Studio 부하를 확인하세요."
            ),
        )
        return {
            **state,
            "reply": reply,
            "mode": "security_rag",
            "provider": "rag_extractive",
            "error": None,
            "trace": _trace_append(
                state,
                "generate_skipped",
                ok=True,
                detail="SECURE_GENERATE=0 extractive",
            ),
        }

    state = {
        **state,
        "trace": _trace_append(
            state, "generate_start", ok=True, detail="vllm_invoke"
        ),
    }
    context = format_rag_context(sources)
    cite_hint = ", ".join(f"[출처: {t}]" for t in titles if t)
    user_block = (
        f"질문:\n{state['message']}\n\n"
        f"검색된 사내 문서 발췌:\n{context}\n\n"
        f"답변 끝에 사용한 문서에 대해 반드시 인용을 붙이세요. 예: {cite_hint}"
    )
    try:
        llm = make_vllm()
        out = llm.invoke(
            [
                SystemMessage(content=SYSTEM_SECURE_RAG),
                HumanMessage(content=user_block),
            ]
        )
        reply = content_to_text(out.content)
        if not reply:
            reply = format_extractive_reply(
                sources,
                notice=HIT_BUT_LLM_TIMEOUT_REPLY.split("\n\n")[0]
                + " 아래는 검색된 원문 발췌입니다.",
            )
            return {
                **state,
                "reply": reply,
                "mode": "security_rag",
                "provider": "rag_extractive",
                "error": "empty_vllm_reply",
                "trace": _trace_append(
                    state,
                    "generate_fail",
                    ok=False,
                    detail="empty_vllm_reply→extractive",
                ),
            }
        if titles and "[출처:" not in reply:
            reply = reply.rstrip() + "\n\n" + " ".join(f"[출처: {t}]" for t in titles)
        return {
            **state,
            "reply": reply,
            "mode": "security_rag",
            "provider": "vllm",
            "error": None,
            "trace": _trace_append(
                state,
                "generate_done",
                ok=True,
                detail=f"reply_len={len(reply)}",
            ),
        }
    except Exception as exc:  # noqa: BLE001
        err = str(exc)[:300]
        reply = format_extractive_reply(
            sources,
            notice=(
                "로컬 LLM 응답이 실패·시간 초과되어, 검색된 문서 발췌를 대신 제공합니다. "
                f"({err[:120]})"
            ),
        )
        return {
            **state,
            "reply": reply,
            "mode": "security_rag",
            "provider": "rag_extractive",
            "error": err,
            "trace": _trace_append(
                state, "generate_fail", ok=False, detail=f"{err}→extractive"
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


def run_secure_chat(message: str) -> dict[str, Any]:
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
        {"message": text, "sources": [], "trace": [], "_t0": t0}
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
