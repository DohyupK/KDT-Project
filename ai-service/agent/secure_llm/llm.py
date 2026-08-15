"""
Security-tab LLM: local vLLM OpenAI-compatible only + secure RAG graph.

Wiring:
  SecurityChatbot → Express /api/security-chat → FastAPI /security-chat
  → USER_SECURITY_MESSAGES (user pending) → PC worker (RAG + vLLM)
  → assistant row → SSE/JSON to UI

AWS does not call vLLM or Secure RAG for this channel.
NEVER import or call Groq / Gemini / compose_with_failover here.
Do NOT load HuggingFace chat LLMs in-process — chat via external vLLM.
Embed/rerank models run on CPU only (see rag_engine).
See docs/references/vllm-setup.md · docs/references/secure-rag.md
"""

from __future__ import annotations

import os
from typing import Any, AsyncIterator, Awaitable, Callable

from langchain_openai import ChatOpenAI

ScheduleUpsert = Callable[..., None]
DisconnectCheck = Callable[[], Awaitable[bool]]


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


def make_vllm(*, max_tokens: int | None = None) -> ChatOpenAI:
    # Soft-fail before FE/BE 180s budget; then extractive RAG reply is used.
    timeout_s = float(os.environ.get("SECURE_VLLM_TIMEOUT", "45"))
    tokens = (
        int(max_tokens)
        if max_tokens is not None
        else int(os.environ.get("SECURE_VLLM_MAX_TOKENS", "256"))
    )
    return ChatOpenAI(
        base_url=vllm_base_url(),
        api_key="EMPTY",
        model=vllm_model(),
        temperature=0.2,
        timeout=timeout_s,
        max_retries=0,
        max_tokens=tokens,
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
    Enqueue a security user message and wait for the PC worker assistant row.
    Does not run retrieve/generate on this process.
    """
    from agent import security_queue_store as qstore

    text = (message or "").strip()
    if not text:
        return {
            "reply": "메시지가 비어 있습니다.",
            "mode": "template",
            "provider": "offline",
            "error": "empty_message",
            "sources": [],
            "trace": [],
            "thread_id": thread_id,
        }
    if not user_id:
        return {
            "reply": "로그인한 사용자만 보안 상담을 사용할 수 있습니다.",
            "mode": "template",
            "provider": "offline",
            "error": "user_id_required",
            "sources": [],
            "trace": [],
            "thread_id": thread_id,
        }

    tid = qstore.ensure_thread(thread_id=thread_id, user_id=user_id)
    if not tid:
        return {
            "reply": "보안 채팅 테이블에 쓰지 못했습니다. USER_SECURITY_* DDL을 적용하세요.",
            "mode": "template",
            "provider": "offline",
            "error": "security_queue_unavailable",
            "sources": [],
            "trace": [],
            "thread_id": thread_id,
        }

    mid = qstore.insert_user_pending(thread_id=tid, content=text)
    if mid is None:
        return {
            "reply": "보안 질문을 큐에 넣지 못했습니다.",
            "mode": "template",
            "provider": "offline",
            "error": "enqueue_failed",
            "sources": [],
            "trace": [],
            "thread_id": tid,
        }
    if schedule_upsert is not None:
        schedule_upsert(
            thread_id=tid,
            user_id=user_id,
            channel="security",
            role="user",
            text=text,
            message_id=mid,
        )

    row = qstore.wait_for_assistant(thread_id=tid, user_message_id=mid)
    if not row:
        return {
            "reply": qstore.WORKER_UNAVAILABLE_REPLY,
            "mode": "template",
            "provider": "offline",
            "error": "worker_timeout",
            "sources": [],
            "trace": [{"stage": "queue_wait", "ok": False, "detail": "timeout"}],
            "thread_id": tid,
        }

    reply = str(row.get("content") or "")
    if schedule_upsert is not None:
        schedule_upsert(
            thread_id=tid,
            user_id=user_id,
            channel="security",
            role="assistant",
            text=reply,
            message_id=row.get("id"),
        )
    return {
        "reply": reply,
        "mode": row.get("mode") or "security_rag",
        "provider": row.get("provider") or "vllm",
        "error": None if row.get("status") != "error" else "worker_error",
        "sources": row.get("sources") or [],
        "trace": [{"stage": "queue_wait", "ok": True, "detail": "pc_worker"}],
        "thread_id": tid,
    }


async def compose_secure_stream(
    message: str,
    *,
    thread_id: str | None = None,
    user_id: str | None = None,
    schedule_upsert: ScheduleUpsert | None = None,
    is_disconnected: DisconnectCheck | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Enqueue + SSE heartbeat until the PC worker writes the assistant row."""
    import asyncio

    from agent import security_queue_store as qstore

    text = (message or "").strip()

    async def _gone() -> bool:
        if is_disconnected is None:
            return False
        try:
            return bool(await is_disconnected())
        except Exception:  # noqa: BLE001
            return False

    if not text:
        yield {
            "event": "done",
            "data": {
                "reply": "메시지가 비어 있습니다.",
                "mode": "template",
                "provider": "offline",
                "error": "empty_message",
                "sources": [],
                "thread_id": thread_id,
            },
        }
        return

    if not user_id:
        yield {
            "event": "done",
            "data": {
                "reply": "로그인한 사용자만 보안 상담을 사용할 수 있습니다.",
                "mode": "template",
                "provider": "offline",
                "error": "user_id_required",
                "sources": [],
                "thread_id": thread_id,
            },
        }
        return

    tid = qstore.ensure_thread(thread_id=thread_id, user_id=user_id)
    if not tid:
        yield {
            "event": "done",
            "data": {
                "reply": "보안 채팅 테이블에 쓰지 못했습니다. USER_SECURITY_* DDL을 적용하세요.",
                "mode": "template",
                "provider": "offline",
                "error": "security_queue_unavailable",
                "sources": [],
                "thread_id": thread_id,
            },
        }
        return

    mid = qstore.insert_user_pending(thread_id=tid, content=text)
    if mid is None:
        yield {
            "event": "done",
            "data": {
                "reply": "보안 질문을 큐에 넣지 못했습니다.",
                "mode": "template",
                "provider": "offline",
                "error": "enqueue_failed",
                "sources": [],
                "thread_id": tid,
            },
        }
        return

    if schedule_upsert is not None:
        schedule_upsert(
            thread_id=tid,
            user_id=user_id,
            channel="security",
            role="user",
            text=text,
            message_id=mid,
        )

    yield {
        "event": "meta",
        "data": {
            "stage": "queued",
            "mode": "security_rag",
            "provider": "pc_worker",
            "thread_id": tid,
        },
    }

    timeout_s = qstore.queue_wait_sec()
    poll_s = qstore.queue_poll_sec()
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        if await _gone():
            return
        row = qstore.peek_assistant_after(thread_id=tid, user_message_id=mid)
        if row:
            reply = str(row.get("content") or "")
            sources = list(row.get("sources") or [])
            mode = row.get("mode") or "security_rag"
            provider = row.get("provider") or "vllm"
            if schedule_upsert is not None:
                schedule_upsert(
                    thread_id=tid,
                    user_id=user_id,
                    channel="security",
                    role="assistant",
                    text=reply,
                    message_id=row.get("id"),
                )
            payload = {
                "reply": reply,
                "mode": mode,
                "provider": provider,
                "error": None if row.get("status") != "error" else "worker_error",
                "sources": sources,
                "thread_id": tid,
            }
            yield {"event": "replace", "data": payload}
            yield {"event": "done", "data": payload}
            return
        yield {
            "event": "meta",
            "data": {
                "stage": "queued",
                "mode": "security_rag",
                "provider": "pc_worker",
                "thread_id": tid,
            },
        }
        await asyncio.sleep(poll_s)

    payload = {
        "reply": qstore.WORKER_UNAVAILABLE_REPLY,
        "mode": "template",
        "provider": "offline",
        "error": "worker_timeout",
        "sources": [],
        "thread_id": tid,
    }
    yield {"event": "replace", "data": payload}
    yield {"event": "done", "data": payload}
