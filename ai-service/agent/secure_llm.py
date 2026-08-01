"""
Security-tab LLM: local vLLM OpenAI-compatible only + secure RAG graph.

Wiring:
  SecurityChatbot → Express /api/security-chat → FastAPI /security-chat
  → agent.secure_graph.run_secure_chat → rag_engine + ChatOpenAI(vLLM)

NEVER import or call Groq / Gemini / compose_with_failover here.
Do NOT load HuggingFace chat LLMs in-process — chat via external vLLM.
Embed/rerank models run on CPU only (see rag_engine).
See docs/references/vllm-setup.md · docs/references/secure-rag.md
"""

from __future__ import annotations

import os
from typing import Any, Callable

from langchain_openai import ChatOpenAI

ScheduleUpsert = Callable[..., None]


def vllm_base_url() -> str:
    raw = (
        os.environ.get("CHAT_VLLM_BASE_URL")
        or os.environ.get("VLLM_BASE_URL")
        or "http://127.0.0.1:8001/v1"
    ).strip()
    return raw.rstrip("/")


def vllm_model() -> str:
    return (
        os.environ.get("CHAT_VLLM_MODEL")
        or os.environ.get("VLLM_MODEL")
        or "local-model"
    ).strip()


def make_vllm() -> ChatOpenAI:
    # Soft-fail before FE/BE 180s budget; then extractive RAG reply is used.
    timeout_s = float(os.environ.get("SECURE_VLLM_TIMEOUT", "45"))
    return ChatOpenAI(
        base_url=vllm_base_url(),
        api_key="EMPTY",
        model=vllm_model(),
        temperature=0.2,
        timeout=timeout_s,
        max_retries=0,
        max_tokens=int(os.environ.get("SECURE_VLLM_MAX_TOKENS", "256")),
    )


def content_to_text(content: Any) -> str:
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


def usable_llm_text(content: Any) -> str:
    """
    Normalize LLM content; treat blank / punctuation-only as empty.
    Tiny quant models (e.g. gemma@q2_k) often return "" or "." with finish stop.
    """
    text = content_to_text(content)
    if not text:
        return ""
    # Strip common junk tokens from broken chat templates
    stripped = text.strip().strip("`\"'")
    if not stripped or all(ch in ".:…·-_/\\|*" for ch in stripped):
        return ""
    return text


def compose_secure(
    message: str,
    *,
    thread_id: str | None = None,
    user_id: str | None = None,
    schedule_upsert: ScheduleUpsert | None = None,
) -> dict[str, Any]:
    """
    Secure RAG + local vLLM via LangGraph.
    No cloud fallback. Empty retrieval (and no prior sources) → fixed no-docs reply.
    Loads/saves MariaDB user_chat_* when thread_id + user_id are provided.
    Layer-2: semantic hits merged into history_text; Qdrant upsert via schedule_upsert.
    """
    from agent import chat_history_store as store
    from agent import chat_history_vector as vec
    from agent.secure_graph import run_secure_chat

    tid = store.ensure_thread(
        thread_id=thread_id,
        user_id=user_id,
        channel="security",
    )
    history = store.load_messages(tid) if tid else []
    prior = store.last_assistant_sources(history)
    window_text = store.format_history_text_compact(history)
    semantic = vec.search_similar(thread_id=tid, query=message) if tid else []
    history_text = vec.merge_history_with_semantic(
        window_text,
        semantic,
        heuristic_truncate_fn=store.heuristic_truncate,
        format_compact_fn=store.format_history_text_compact,
    )

    if tid and user_id:
        mid = store.insert_message(
            thread_id=tid,
            role="user",
            content=message,
            mode="security_user",
            provider="security",
        )
        if schedule_upsert is not None:
            schedule_upsert(
                thread_id=tid,
                user_id=user_id,
                channel="security",
                role="user",
                text=message,
                message_id=mid,
            )

    out = run_secure_chat(
        message,
        prior_sources=prior,
        history_text=history_text,
    )

    if tid and user_id:
        reply = out.get("reply") or ""
        mid_a = store.insert_message(
            thread_id=tid,
            role="assistant",
            content=reply,
            mode=out.get("mode"),
            provider=out.get("provider"),
            sources=out.get("sources") or [],
        )
        if schedule_upsert is not None:
            schedule_upsert(
                thread_id=tid,
                user_id=user_id,
                channel="security",
                role="assistant",
                text=reply,
                message_id=mid_a,
            )

    out["thread_id"] = tid
    return out
