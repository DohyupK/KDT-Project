"""
MariaDB USER_SECURITY_THREADS / USER_SECURITY_MESSAGES.

AWS inserts user rows with status=pending. The PC worker claims them,
runs Secure RAG + vLLM locally, then writes assistant rows.
General chat stays on USER_CHAT_*. Soft-fail when DB is missing.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime
from typing import Any

from agent.chat_history_store import get_engine, heuristic_truncate, history_window

logger = logging.getLogger(__name__)


class ThreadOwnershipError(PermissionError):
    """Raised when a supplied security thread belongs to another user."""

WORKER_UNAVAILABLE_REPLY = (
    "이 PC 보안 워커가 응답하지 않았습니다.\n\n"
    "작업자 안내: vLLM(:8001)과 python ai-service/scripts/run_security_worker.py 를 "
    "이 PC에서 켠 뒤 다시 보내세요. AWS는 질문을 USER_SECURITY_MESSAGES에만 넣습니다."
)


def queue_wait_sec() -> float:
    try:
        return max(10.0, float(os.environ.get("SECURITY_QUEUE_WAIT_SEC", "180")))
    except ValueError:
        return 180.0


def queue_poll_sec() -> float:
    try:
        return max(0.2, float(os.environ.get("SECURITY_QUEUE_POLL_SEC", "0.4")))
    except ValueError:
        return 0.4


def _parse_sources(raw: Any) -> list[dict[str, Any]] | None:
    sources = raw
    if isinstance(sources, str):
        try:
            sources = json.loads(sources)
        except Exception:  # noqa: BLE001
            return None
    if isinstance(sources, list):
        return [s for s in sources if isinstance(s, dict)]
    return None


def _iso(val: Any) -> str | None:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def ensure_thread(*, thread_id: str | None, user_id: str | None) -> str | None:
    engine = get_engine()
    if engine is None or not user_id:
        return thread_id
    tid = (thread_id or "").strip() or str(uuid.uuid4())
    try:
        from sqlalchemy import text

        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT id, user_id FROM USER_SECURITY_THREADS WHERE id = :id LIMIT 1"),
                {"id": tid},
            ).fetchone()
            if row:
                if str(row[1]) != str(user_id):
                    raise ThreadOwnershipError("security thread belongs to another user")
                conn.execute(
                    text(
                        "UPDATE USER_SECURITY_THREADS SET updated_at = :now WHERE id = :id"
                    ),
                    {"id": tid, "now": datetime.utcnow()},
                )
                return tid
            conn.execute(
                text(
                    """
                    INSERT INTO USER_SECURITY_THREADS (id, user_id, title, created_at, updated_at)
                    VALUES (:id, :user_id, :title, :now, :now)
                    """
                ),
                {
                    "id": tid,
                    "user_id": user_id,
                    "title": None,
                    "now": datetime.utcnow(),
                },
            )
        return tid
    except ThreadOwnershipError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] ensure_thread failed: %s", exc)
        return None


def list_threads(*, user_id: str | None, limit: int = 50) -> list[dict[str, Any]]:
    engine = get_engine()
    if engine is None or not user_id:
        return []
    lim = max(1, min(200, int(limit)))
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT id, user_id, title, created_at, updated_at
                        FROM USER_SECURITY_THREADS
                        WHERE user_id = :uid
                        ORDER BY updated_at DESC
                        LIMIT :lim
                        """
                    ),
                    {"uid": user_id, "lim": lim},
                )
                .mappings()
                .all()
            )
        out: list[dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": r["id"],
                    "user_id": r["user_id"],
                    "channel": "security",
                    "title": r.get("title"),
                    "created_at": _iso(r.get("created_at")) or "",
                    "updated_at": _iso(r.get("updated_at")) or "",
                }
            )
        return out
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] list_threads failed: %s", exc)
        return []


def thread_owned_by(*, thread_id: str | None, user_id: str | None) -> bool:
    engine = get_engine()
    if engine is None or not thread_id or not user_id:
        return False
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT 1 FROM USER_SECURITY_THREADS
                    WHERE id = :tid AND user_id = :uid
                    LIMIT 1
                    """
                ),
                {"tid": thread_id, "uid": user_id},
            ).fetchone()
        return row is not None
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] thread_owned_by failed: %s", exc)
        return False


def load_messages(
    thread_id: str | None,
    *,
    limit: int | None = None,
    exclude_pending: bool = False,
) -> list[dict[str, Any]]:
    engine = get_engine()
    if engine is None or not thread_id:
        return []
    lim = history_window() if limit is None else max(1, int(limit))
    try:
        from sqlalchemy import text

        extra = "AND status IN ('done', 'error')" if exclude_pending else ""
        with engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        f"""
                        SELECT id, role, content, status, mode, provider, sources, created_at
                        FROM USER_SECURITY_MESSAGES
                        WHERE thread_id = :tid {extra}
                        ORDER BY created_at DESC
                        LIMIT :lim
                        """
                    ),
                    {"tid": thread_id, "lim": lim},
                )
                .mappings()
                .all()
            )
        messages: list[dict[str, Any]] = []
        for r in rows:
            messages.append(
                {
                    "id": int(r["id"]),
                    "role": r["role"],
                    "content": r["content"],
                    "status": r.get("status"),
                    "mode": r.get("mode"),
                    "provider": r.get("provider"),
                    "sources": _parse_sources(r.get("sources")),
                    "created_at": _iso(r.get("created_at")),
                }
            )
        messages.reverse()
        return messages
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] load_messages failed: %s", exc)
        return []


def load_messages_for_ui(
    thread_id: str | None,
    *,
    user_id: str | None,
    limit: int = 200,
) -> list[dict[str, Any]] | None:
    if not thread_id or not user_id:
        return None
    if not thread_owned_by(thread_id=thread_id, user_id=user_id):
        return None
    return load_messages(thread_id, limit=max(1, min(500, int(limit))))


def delete_thread(*, thread_id: str | None, user_id: str | None) -> bool:
    """Delete one owned security thread; messages and source JSON cascade."""
    engine = get_engine()
    if engine is None or not thread_id or not user_id:
        return False
    try:
        from sqlalchemy import text

        with engine.begin() as conn:
            result = conn.execute(
                text(
                    """
                    DELETE FROM USER_SECURITY_THREADS
                    WHERE id = :tid AND user_id = :uid
                    """
                ),
                {"tid": thread_id, "uid": user_id},
            )
        return int(result.rowcount or 0) > 0
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] delete_thread failed: %s", exc)
        return False


def insert_user_pending(
    *,
    thread_id: str,
    content: str,
) -> int | None:
    engine = get_engine()
    if engine is None:
        return None
    try:
        from sqlalchemy import text

        title = heuristic_truncate(content, max_chars=80) or None
        with engine.begin() as conn:
            result = conn.execute(
                text(
                    """
                    INSERT INTO USER_SECURITY_MESSAGES
                      (thread_id, role, content, status, mode, provider, created_at)
                    VALUES
                      (:thread_id, 'user', :content, 'pending', 'security_user', 'security', :now)
                    """
                ),
                {
                    "thread_id": thread_id,
                    "content": content,
                    "now": datetime.utcnow(),
                },
            )
            if title:
                conn.execute(
                    text(
                        """
                        UPDATE USER_SECURITY_THREADS
                        SET title = COALESCE(title, :title), updated_at = :now
                        WHERE id = :id
                        """
                    ),
                    {"title": title, "now": datetime.utcnow(), "id": thread_id},
                )
            return int(result.lastrowid)
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] insert_user_pending failed: %s", exc)
        return None


def peek_user_status(*, message_id: int) -> str | None:
    engine = get_engine()
    if engine is None:
        return None
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT status FROM USER_SECURITY_MESSAGES WHERE id = :id LIMIT 1"
                ),
                {"id": message_id},
            ).fetchone()
        return str(row[0]) if row else None
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] peek_user_status failed: %s", exc)
        return None


def peek_assistant_after(*, thread_id: str, user_message_id: int) -> dict[str, Any] | None:
    engine = get_engine()
    if engine is None:
        return None
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        SELECT id, role, content, status, mode, provider, sources, created_at
                        FROM USER_SECURITY_MESSAGES
                        WHERE thread_id = :tid AND role = 'assistant' AND id > :uid
                        ORDER BY id ASC
                        LIMIT 1
                        """
                    ),
                    {"tid": thread_id, "uid": user_message_id},
                )
                .mappings()
                .first()
            )
        if not row:
            return None
        return {
            "id": int(row["id"]),
            "role": row["role"],
            "content": row["content"],
            "status": row.get("status"),
            "mode": row.get("mode"),
            "provider": row.get("provider"),
            "sources": _parse_sources(row.get("sources")) or [],
            "created_at": _iso(row.get("created_at")),
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] peek_assistant_after failed: %s", exc)
        return None


def wait_for_assistant(
    *,
    thread_id: str,
    user_message_id: int,
    timeout_s: float | None = None,
    poll_s: float | None = None,
) -> dict[str, Any] | None:
    deadline = time.monotonic() + (timeout_s if timeout_s is not None else queue_wait_sec())
    interval = poll_s if poll_s is not None else queue_poll_sec()
    while time.monotonic() < deadline:
        row = peek_assistant_after(thread_id=thread_id, user_message_id=user_message_id)
        if row:
            return row
        status = peek_user_status(message_id=user_message_id)
        if status == "error":
            return None
        time.sleep(interval)
    return None


def claim_next_pending() -> dict[str, Any] | None:
    """Claim one pending user row for the PC worker. None if idle."""
    engine = get_engine()
    if engine is None:
        return None
    try:
        from sqlalchemy import text

        with engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        SELECT id, thread_id, content, created_at
                        FROM USER_SECURITY_MESSAGES
                        WHERE role = 'user' AND status = 'pending'
                        ORDER BY id ASC
                        LIMIT 1
                        """
                    )
                )
                .mappings()
                .first()
            )
            if not row:
                return None
            mid = int(row["id"])
            upd = conn.execute(
                text(
                    """
                    UPDATE USER_SECURITY_MESSAGES
                    SET status = 'processing'
                    WHERE id = :id AND status = 'pending'
                    """
                ),
                {"id": mid},
            )
            if upd.rowcount != 1:
                return None
            return {
                "id": mid,
                "thread_id": str(row["thread_id"]),
                "content": str(row["content"] or ""),
                "created_at": _iso(row.get("created_at")),
            }
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] claim_next_pending failed: %s", exc)
        return None


def insert_assistant(
    *,
    thread_id: str,
    content: str,
    status: str = "done",
    mode: str | None = None,
    provider: str | None = None,
    sources: list[dict[str, Any]] | None = None,
) -> int | None:
    engine = get_engine()
    if engine is None:
        return None
    st = status if status in ("done", "error") else "done"
    try:
        from sqlalchemy import text

        sources_json = (
            json.dumps(sources, ensure_ascii=False) if sources is not None else None
        )
        with engine.begin() as conn:
            result = conn.execute(
                text(
                    """
                    INSERT INTO USER_SECURITY_MESSAGES
                      (thread_id, role, content, status, mode, provider, sources, created_at)
                    VALUES
                      (:thread_id, 'assistant', :content, :status, :mode, :provider, :sources, :now)
                    """
                ),
                {
                    "thread_id": thread_id,
                    "content": content,
                    "status": st,
                    "mode": mode,
                    "provider": provider,
                    "sources": sources_json,
                    "now": datetime.utcnow(),
                },
            )
            conn.execute(
                text(
                    "UPDATE USER_SECURITY_THREADS SET updated_at = :now WHERE id = :id"
                ),
                {"now": datetime.utcnow(), "id": thread_id},
            )
            return int(result.lastrowid)
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] insert_assistant failed: %s", exc)
        return None


def mark_user(*, message_id: int, status: str) -> None:
    if status not in ("done", "error", "pending"):
        return
    engine = get_engine()
    if engine is None:
        return
    try:
        from sqlalchemy import text

        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE USER_SECURITY_MESSAGES SET status = :st WHERE id = :id"
                ),
                {"st": status, "id": message_id},
            )
    except Exception as exc:  # noqa: BLE001
        logger.error("[security_queue] mark_user failed: %s", exc)
