"""Build general-chat history context and report its real latency."""

from __future__ import annotations

import time
from typing import Any


def build_history_context(
    *,
    message: str,
    thread_id: str | None,
    page_context: dict[str, Any] | None,
    fallback_history_text: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """MariaDB first, backend-provided fallback second, optional semantic recall last."""
    from agent import chat_history_store as store
    from agent import chat_history_vector as vec
    from agent.api_llm.grounding import (
        detect_topic_shift,
        filter_history_for_entities,
        is_page_summary_intent,
        message_lot_issue_ids,
        route_without_lot_table,
    )

    started = time.perf_counter()
    db_started = time.perf_counter()
    history = store.load_messages(thread_id) if thread_id else []
    window_text = store.format_history_text_compact(history)
    db_ms = (time.perf_counter() - db_started) * 1000

    source = "ai_mariadb" if window_text else "none"
    if not window_text and (fallback_history_text or "").strip():
        window_text = (fallback_history_text or "").strip()[:4000]
        source = "backend_chat_store"

    topic_shift = detect_topic_shift(message, window_text, page_context)
    route_now = str((page_context or {}).get("route") or "")
    vector_ms = 0.0
    semantic_hits: list[dict[str, Any]] = []

    if is_page_summary_intent(message):
        history_text = ""
    elif message_lot_issue_ids(message) and route_without_lot_table(route_now):
        history_text = filter_history_for_entities(window_text, message)
    elif topic_shift:
        history_text = (
            store.heuristic_truncate(window_text, max_chars=200)
            if window_text
            else ""
        )
    else:
        if thread_id and window_text and vec.semantic_memory_enabled():
            vector_started = time.perf_counter()
            semantic_hits = vec.search_similar(thread_id=thread_id, query=message)
            vector_ms = (time.perf_counter() - vector_started) * 1000
        history_text = vec.merge_history_with_semantic(
            window_text,
            semantic_hits,
            heuristic_truncate_fn=store.heuristic_truncate,
            format_compact_fn=store.format_history_text_compact,
        )

    return history_text, {
        "history_db_ms": round(db_ms, 1),
        "history_vector_ms": round(vector_ms, 1),
        "history_ms": round((time.perf_counter() - started) * 1000, 1),
        "history_source": source,
        "semantic_memory_enabled": int(vec.semantic_memory_enabled()),
        "semantic_hits": len(semantic_hits),
    }
