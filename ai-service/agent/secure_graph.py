"""
LangGraph for security-tab: retrieve → gate → generate | no_docs.

Cloud LLM (Groq/Gemini) is never used. Generation is local vLLM only
when secure RAG returns hits.
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langchain_core.messages import HumanMessage, SystemMessage

from agent.rag_engine import NO_DOCS_REPLY, get_engine
from agent.secure_llm import content_to_text, make_vllm
from agent.secure_prompts import (
    OFFLINE_REPLY,
    SYSTEM_SECURE_RAG,
    format_rag_context,
)


class SecureState(TypedDict, total=False):
    message: str
    sources: list[dict[str, Any]]
    reply: str
    mode: str
    provider: str
    error: str | None


def _llm_text_invoke(prompt: str) -> str:
    llm = make_vllm()
    out = llm.invoke([HumanMessage(content=prompt)])
    return content_to_text(out.content)


def node_retrieve(state: SecureState) -> SecureState:
    engine = get_engine()
    try:
        engine.ensure()
        if not engine.ready:
            return {
                **state,
                "sources": [],
                "reply": OFFLINE_REPLY,
                "mode": "template",
                "provider": "offline",
                "error": engine.init_error or "rag_not_ready",
            }
        hits = engine.retrieve(
            state["message"],
            top_k=8,
            rerank_top_n=4,
            llm_invoke=_llm_text_invoke,
        )
        return {**state, "sources": hits, "error": None}
    except Exception as exc:  # noqa: BLE001
        return {
            **state,
            "sources": [],
            "reply": OFFLINE_REPLY,
            "mode": "template",
            "provider": "offline",
            "error": str(exc)[:300],
        }


def node_gate(state: SecureState) -> str:
    if state.get("mode") == "template" and state.get("provider") == "offline":
        return "done"
    sources = state.get("sources") or []
    if not sources:
        return "no_docs"
    return "generate"


def node_no_docs(state: SecureState) -> SecureState:
    return {
        **state,
        "reply": NO_DOCS_REPLY,
        "mode": "security_no_docs",
        "provider": "rag",
        "error": None,
        "sources": [],
    }


def node_generate(state: SecureState) -> SecureState:
    sources = state.get("sources") or []
    context = format_rag_context(sources)
    titles = sorted({str(s.get("title") or "") for s in sources if s.get("title")})
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
            return {
                **state,
                "reply": OFFLINE_REPLY,
                "mode": "template",
                "provider": "offline",
                "error": "empty_vllm_reply",
            }
        # Ensure at least one citation marker if model omitted it
        if titles and "[출처:" not in reply:
            reply = reply.rstrip() + "\n\n" + " ".join(f"[출처: {t}]" for t in titles)
        return {
            **state,
            "reply": reply,
            "mode": "security_rag",
            "provider": "vllm",
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            **state,
            "reply": OFFLINE_REPLY,
            "mode": "template",
            "provider": "offline",
            "error": str(exc)[:300],
        }


def node_done(state: SecureState) -> SecureState:
    return state


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
        }
    if _GRAPH is None:
        _GRAPH = build_secure_graph()
    out = _GRAPH.invoke({"message": text, "sources": []})
    sources = out.get("sources") or []
    # Strip internal fields for API
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
    return {
        "reply": out.get("reply") or "",
        "mode": out.get("mode") or "template",
        "provider": out.get("provider") or "offline",
        "error": out.get("error"),
        "sources": clean,
    }
