"""
Layer-2 long-term chat memory via Qdrant (semantic pruning).

- Collection: CHAT_HISTORY_QDRANT_COLLECTION (default chat_history_collection)
- Embed: same BAAI/bge-m3 on CPU as rag_engine (no LLM summarization)
- Soft-fail on all errors — never break the main chat path
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

_EMBED = None
_QDRANT = None
_DIM: int | None = None
_READY = False


def chat_history_collection() -> str:
    return (
        os.environ.get("CHAT_HISTORY_QDRANT_COLLECTION") or "chat_history_collection"
    ).strip()


def semantic_top_k() -> int:
    try:
        return max(1, int(os.environ.get("CHAT_HISTORY_SEMANTIC_TOP_K", "3")))
    except ValueError:
        return 3


def _qdrant_url() -> str:
    from agent.rag_engine import qdrant_url

    return qdrant_url()


def _ensure_clients() -> bool:
    """Lazy-init embedder + Qdrant. Soft-fail → False."""
    global _EMBED, _QDRANT, _DIM, _READY
    if _READY and _EMBED is not None and _QDRANT is not None:
        return True
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.http import models as qm
        from sentence_transformers import SentenceTransformer

        from agent.rag_engine import DEVICE, EMBED_MODEL

        if _EMBED is None:
            _EMBED = SentenceTransformer(EMBED_MODEL, device=DEVICE)
            _DIM = len(_EMBED.encode(["dim"], normalize_embeddings=True)[0])
        if _QDRANT is None:
            _QDRANT = QdrantClient(url=_qdrant_url())

        name = chat_history_collection()
        existing = {c.name for c in _QDRANT.get_collections().collections}
        if name not in existing:
            assert _DIM is not None
            _QDRANT.create_collection(
                collection_name=name,
                vectors_config=qm.VectorParams(
                    size=_DIM, distance=qm.Distance.COSINE
                ),
            )
            for field in ("thread_id", "user_id", "channel", "role"):
                try:
                    _QDRANT.create_payload_index(
                        collection_name=name,
                        field_name=field,
                        field_schema=qm.PayloadSchemaType.KEYWORD,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("[chat_history_vec] index %s: %s", field, exc)
        _READY = True
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("[chat_history_vec] init failed: %s", exc)
        _READY = False
        return False


def _point_id(message_id: int | str | None, thread_id: str, text: str) -> int:
    if message_id is not None:
        try:
            mid = int(message_id)
            if mid > 0:
                return mid
        except (TypeError, ValueError):
            pass
    digest = hashlib.md5(
        f"{thread_id}:{text[:200]}".encode(), usedforsecurity=False
    ).hexdigest()[:15]
    return int(digest, 16) or 1


def upsert_chat_message(
    *,
    thread_id: str | None,
    user_id: str | None,
    channel: str,
    role: str,
    text: str,
    message_id: int | str | None = None,
    created_at: str | None = None,
) -> None:
    """Background-safe upsert. Soft-fail."""
    if not thread_id or not (text or "").strip():
        return
    try:
        if not _ensure_clients():
            return
        assert _EMBED is not None and _QDRANT is not None
        from qdrant_client.http import models as qm

        body = (text or "").strip()
        vec = _EMBED.encode([body], normalize_embeddings=True)[0].tolist()
        ts = created_at or datetime.now(timezone.utc).isoformat()
        payload = {
            "thread_id": str(thread_id),
            "user_id": str(user_id or ""),
            "channel": (channel or "security").strip().lower(),
            "role": str(role or ""),
            "message_id": str(message_id) if message_id is not None else "",
            "text": body,
            "created_at": ts,
        }
        pid = _point_id(message_id, str(thread_id), body)
        _QDRANT.upsert(
            collection_name=chat_history_collection(),
            points=[qm.PointStruct(id=pid, vector=vec, payload=payload)],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[chat_history_vec] upsert soft-fail: %s", exc)


def search_similar(
    *,
    thread_id: str | None,
    query: str,
    top_k: int | None = None,
) -> list[dict[str, Any]]:
    """Semantic hits for one thread. Soft-fail → []."""
    if not thread_id or not (query or "").strip():
        return []
    try:
        if not _ensure_clients():
            return []
        assert _EMBED is not None and _QDRANT is not None
        from qdrant_client.http import models as qm

        k = semantic_top_k() if top_k is None else max(1, int(top_k))
        vec = _EMBED.encode([query.strip()], normalize_embeddings=True)[0].tolist()
        qfilter = qm.Filter(
            must=[
                qm.FieldCondition(
                    key="thread_id",
                    match=qm.MatchValue(value=str(thread_id)),
                )
            ]
        )
        try:
            hits = _QDRANT.search(
                collection_name=chat_history_collection(),
                query_vector=vec,
                limit=k,
                query_filter=qfilter,
                with_payload=True,
            )
        except Exception:
            res = _QDRANT.query_points(
                collection_name=chat_history_collection(),
                query=vec,
                query_filter=qfilter,
                limit=k,
                with_payload=True,
            )
            hits = list(getattr(res, "points", None) or [])
        out: list[dict[str, Any]] = []
        for h in hits:
            pl = getattr(h, "payload", None) or {}
            out.append(
                {
                    "role": pl.get("role") or "assistant",
                    "content": pl.get("text") or "",
                    "message_id": pl.get("message_id"),
                    "score": float(h.score) if getattr(h, "score", None) is not None else None,
                }
            )
        return out
    except Exception as exc:  # noqa: BLE001
        logger.warning("[chat_history_vec] search soft-fail: %s", exc)
        return []


def merge_history_with_semantic(
    window_text: str,
    semantic_hits: list[dict[str, Any]],
    *,
    heuristic_truncate_fn: Any,
    format_compact_fn: Any,
) -> str:
    """
    Prepend compressed semantic hits above the short-term window.
    No LLM. Dedupes against window text.
    """
    window = (window_text or "").strip()
    if not semantic_hits:
        return window
    # Build pseudo-messages for compact formatter; skip if already in window
    msgs: list[dict[str, Any]] = []
    for h in semantic_hits:
        content = heuristic_truncate_fn(str(h.get("content") or ""))
        if not content:
            continue
        if window and content[:80] in window:
            continue
        msgs.append({"role": h.get("role") or "assistant", "content": content})
    if not msgs:
        return window
    long_block = format_compact_fn(msgs)
    if not long_block:
        return window
    if not window:
        return f"[장기기억 유사]\n{long_block}"
    return f"[장기기억 유사]\n{long_block}\n\n[단기 윈도우]\n{window}"
