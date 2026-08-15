"""
MariaDB persistence for unified user_chat_threads / user_chat_messages.

Used by ai-service to load/save multi-turn context (history + sources JSON).
Does not alter the `users` table. Soft-fails when DB env is missing or unreachable.

Layer-1 short-term memory: sliding window (CHAT_HISTORY_WINDOW) + heuristic_truncate
(no LLM summarization).
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

_ENGINE = None

_HEADER_NOISE = re.compile(
    r"(?im)^(?:검색된\s*사내\s*보안\s*문서\s*발췌\s*:?\s*|핵심\s*발췌\s*\(압축\)\s*:?\s*|"
    r"로컬\s*LLM\s*생성을\s*건너뛰고[^\n]*\n?|"
    r".*SECURE_GENERATE\s*=\s*0[^\n]*\n?|"
    r"요약\s*생성이\s*필요하면[^\n]*\n?|"
    r"요약\s*요청으로\s*문서\s*발췌를[^\n]*\n?|"
    r"안녕하세요[!.]?|반갑습니다[!.]?)\s*"
)
_MULTI_NL = re.compile(r"\n{3,}")
_MULTI_SPACE = re.compile(r"[ \t]{2,}")


def history_window() -> int:
    try:
        return max(1, int(os.environ.get("CHAT_HISTORY_WINDOW", "6")))
    except ValueError:
        return 6


def history_msg_max_chars() -> int:
    try:
        return max(50, int(os.environ.get("CHAT_HISTORY_MSG_MAX_CHARS", "400")))
    except ValueError:
        return 400


def history_max_chars() -> int:
    try:
        return max(200, int(os.environ.get("CHAT_HISTORY_MAX_CHARS", "2000")))
    except ValueError:
        return 2000


_ENGINE_ERROR: str | None = None
_ENGINE_ERROR_LOGGED = False


def _normalize_db_url(url: str) -> str:
    """Force PyMySQL dialect — bare mysql:// defaults to MySQLdb (often missing)."""
    u = url.strip()
    if u.startswith("mysql://"):
        return "mysql+pymysql://" + u[len("mysql://") :]
    if u.startswith("mariadb://"):
        return "mariadb+pymysql://" + u[len("mariadb://") :]
    return u


def _db_url() -> str | None:
    explicit = (os.environ.get("DATABASE_URL") or "").strip()
    if explicit:
        return _normalize_db_url(explicit)
    host = (os.environ.get("DB_HOST") or "").strip()
    if not host:
        return None
    port = (os.environ.get("DB_PORT") or "3306").strip()
    user = (os.environ.get("DB_USER") or "").strip()
    password = os.environ.get("DB_PASSWORD") or ""
    name = (os.environ.get("DB_NAME") or "").strip()
    if not user or not name:
        return None
    # mysql+pymysql://user:pass@host:port/db
    from urllib.parse import quote_plus

    return (
        f"mysql+pymysql://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{name}?charset=utf8mb4"
    )


def chat_history_db_status() -> dict[str, Any]:
    """For /health — whether MariaDB multi-turn store is usable."""
    eng = get_engine()
    if eng is None:
        return {
            "ok": False,
            "error": _ENGINE_ERROR or "engine unavailable (check DATABASE_URL / DB_*)",
        }
    try:
        from sqlalchemy import text

        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True, "error": None}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def get_engine():
    global _ENGINE, _ENGINE_ERROR, _ENGINE_ERROR_LOGGED
    if _ENGINE is not None:
        return _ENGINE
    url = _db_url()
    if not url:
        _ENGINE_ERROR = "DATABASE_URL / DB_* not set"
        if not _ENGINE_ERROR_LOGGED:
            logger.error("[chat_history] %s — multi-turn MariaDB persistence OFF", _ENGINE_ERROR)
            _ENGINE_ERROR_LOGGED = True
        return None
    try:
        from sqlalchemy import create_engine, text

        eng = create_engine(
            url,
            pool_pre_ping=True,
            pool_recycle=3600,
            future=True,
        )
        # Fail fast on bad dialect/driver (create_engine alone is lazy).
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        _ENGINE = eng
        _ENGINE_ERROR = None
        logger.info("[chat_history] MariaDB engine ready (dialect=%s)", url.split("://", 1)[0])
        return _ENGINE
    except Exception as exc:  # noqa: BLE001
        _ENGINE_ERROR = str(exc)
        if not _ENGINE_ERROR_LOGGED:
            logger.error(
                "[chat_history] engine init failed: %s — multi-turn MariaDB persistence OFF "
                "(use mysql+pymysql:// in DATABASE_URL; PyMySQL must be installed)",
                exc,
            )
            _ENGINE_ERROR_LOGGED = True
        return None


def ensure_thread(
    *,
    thread_id: str | None,
    user_id: str | None,
    channel: str,
) -> str | None:
    """
    Ensure a user_chat_threads row exists. Returns thread_id or None on soft-fail.
    Creates a new UUID when thread_id is missing and user_id is present.
    """
    engine = get_engine()
    if engine is None or not user_id:
        return thread_id
    channel = (channel or "general").strip().lower()
    if channel != "general":
        logger.error("[chat_history] ensure_thread refused channel=%s (use USER_SECURITY_*)", channel)
        return None
    tid = (thread_id or "").strip() or str(uuid.uuid4())
    try:
        from sqlalchemy import text

        with engine.begin() as conn:
            row = conn.execute(
                text(
                    "SELECT id FROM USER_CHAT_THREADS WHERE id = :id LIMIT 1"
                ),
                {"id": tid},
            ).fetchone()
            if row:
                conn.execute(
                    text(
                        "UPDATE USER_CHAT_THREADS SET updated_at = :now WHERE id = :id"
                    ),
                    {"id": tid, "now": datetime.utcnow()},
                )
                return tid
            conn.execute(
                text(
                    """
                    INSERT INTO USER_CHAT_THREADS (id, user_id, channel, title, created_at, updated_at)
                    VALUES (:id, :user_id, :channel, :title, :now, :now)
                    """
                ),
                {
                    "id": tid,
                    "user_id": user_id,
                    "channel": channel,
                    "title": None,
                    "now": datetime.utcnow(),
                },
            )
        return tid
    except Exception as exc:  # noqa: BLE001
        logger.error("[chat_history] ensure_thread failed: %s", exc)
        return None


def list_threads(
    *,
    user_id: str | None,
    channel: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List threads for a user + channel (newest updated first). Soft-fail → []."""
    engine = get_engine()
    if engine is None or not user_id:
        return []
    channel = (channel or "general").strip().lower()
    if channel != "general":
        return []
    lim = max(1, min(200, int(limit)))
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT id, user_id, channel, title, created_at, updated_at
                    FROM USER_CHAT_THREADS
                    WHERE user_id = :uid AND channel = :channel
                    ORDER BY updated_at DESC
                    LIMIT :lim
                    """
                ),
                {"uid": user_id, "channel": channel, "lim": lim},
            ).mappings().all()
        out: list[dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": r["id"],
                    "user_id": r["user_id"],
                    "channel": r["channel"],
                    "title": r.get("title"),
                    "created_at": (
                        r["created_at"].isoformat()
                        if hasattr(r.get("created_at"), "isoformat")
                        else str(r.get("created_at") or "")
                    ),
                    "updated_at": (
                        r["updated_at"].isoformat()
                        if hasattr(r.get("updated_at"), "isoformat")
                        else str(r.get("updated_at") or "")
                    ),
                }
            )
        return out
    except Exception as exc:  # noqa: BLE001
        logger.error("[chat_history] list_threads failed: %s", exc)
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
                    SELECT 1 FROM USER_CHAT_THREADS
                    WHERE id = :tid AND user_id = :uid
                    LIMIT 1
                    """
                ),
                {"tid": thread_id, "uid": user_id},
            ).fetchone()
        return row is not None
    except Exception as exc:  # noqa: BLE001
        logger.error("[chat_history] thread_owned_by failed: %s", exc)
        return False


def load_messages(
    thread_id: str | None,
    *,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """
    Load recent messages for a thread.
    SQL: ORDER BY created_at DESC LIMIT N, then reverse() → chronological.
    Default N = CHAT_HISTORY_WINDOW (6).
    Pass limit=0 or a large int for UI full restore (see load_messages_for_ui).
    """
    engine = get_engine()
    if engine is None or not thread_id:
        return []
    lim = history_window() if limit is None else max(1, int(limit))
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT role, content, mode, provider, sources, created_at
                    FROM USER_CHAT_MESSAGES
                    WHERE thread_id = :tid
                    ORDER BY created_at DESC
                    LIMIT :lim
                    """
                ),
                {"tid": thread_id, "lim": lim},
            ).mappings().all()
        messages: list[dict[str, Any]] = []
        for r in rows:
            sources = r.get("sources")
            if isinstance(sources, str):
                try:
                    sources = json.loads(sources)
                except Exception:  # noqa: BLE001
                    sources = None
            messages.append(
                {
                    "role": r["role"],
                    "content": r["content"],
                    "mode": r.get("mode"),
                    "provider": r.get("provider"),
                    "sources": sources if isinstance(sources, list) else sources,
                    "created_at": (
                        r["created_at"].isoformat()
                        if hasattr(r.get("created_at"), "isoformat")
                        else None
                    ),
                }
            )
        # Newest-first from SQL → past → present for context
        messages.reverse()
        return messages
    except Exception as exc:  # noqa: BLE001
        logger.error("[chat_history] load_messages failed: %s", exc)
        return []


def load_messages_for_ui(
    thread_id: str | None,
    *,
    user_id: str | None,
    limit: int = 200,
) -> list[dict[str, Any]] | None:
    """
    Full-ish message list for chat restore UI.
    Returns None if not owned / missing; [] if owned but empty.
    """
    if not thread_id or not user_id:
        return None
    if not thread_owned_by(thread_id=thread_id, user_id=user_id):
        return None
    return load_messages(thread_id, limit=max(1, min(500, int(limit))))


def last_assistant_sources(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for m in reversed(messages):
        if m.get("role") != "assistant":
            continue
        src = m.get("sources")
        if isinstance(src, list) and src:
            return [s for s in src if isinstance(s, dict)]
    return []


def heuristic_truncate(text: str, *, max_chars: int | None = None) -> str:
    """Strip repeated RAG headers / greetings / SECURE_GENERATE notices; cap length."""
    if not text:
        return ""
    t = str(text)
    t = _HEADER_NOISE.sub("", t)
    t = _MULTI_NL.sub("\n\n", t)
    t = _MULTI_SPACE.sub(" ", t)
    t = t.strip()
    lim = history_msg_max_chars() if max_chars is None else max_chars
    if len(t) > lim:
        t = t[:lim].rstrip() + "…"
    return t


def format_history_text(messages: list[dict[str, Any]], *, max_chars: int = 4000) -> str:
    """Original full history formatter (kept for compatibility). Prefer compact for LangGraph."""
    lines: list[str] = []
    for m in messages:
        role = str(m.get("role") or "")
        content = str(m.get("content") or "").strip()
        if not content:
            continue
        label = "User" if role == "user" else "Assistant"
        lines.append(f"{label}: {content}")
    text = "\n".join(lines)
    if len(text) > max_chars:
        return text[-max_chars:]
    return text


def format_history_text_compact(
    messages: list[dict[str, Any]],
    *,
    max_chars: int | None = None,
) -> str:
    """Heuristic-compressed User:/Assistant: history for LangGraph state."""
    cap = history_max_chars() if max_chars is None else max_chars
    lines: list[str] = []
    for m in messages:
        role = str(m.get("role") or "")
        content = heuristic_truncate(str(m.get("content") or ""))
        if not content:
            continue
        label = "User" if role == "user" else "Assistant"
        lines.append(f"{label}: {content}")
    text = "\n".join(lines)
    if len(text) > cap:
        return text[-cap:]
    return text


def insert_message(
    *,
    thread_id: str | None,
    role: str,
    content: str,
    mode: str | None = None,
    provider: str | None = None,
    sources: list[dict[str, Any]] | None = None,
) -> int | None:
    """Insert a row; return new message id (or None on soft-fail)."""
    engine = get_engine()
    if engine is None or not thread_id:
        return None
    try:
        from sqlalchemy import text

        sources_json = (
            json.dumps(sources, ensure_ascii=False) if sources is not None else None
        )
        with engine.begin() as conn:
            result = conn.execute(
                text(
                    """
                    INSERT INTO USER_CHAT_MESSAGES
                      (thread_id, role, content, mode, provider, sources, created_at)
                    VALUES
                      (:thread_id, :role, :content, :mode, :provider, :sources, :now)
                    """
                ),
                {
                    "thread_id": thread_id,
                    "role": role,
                    "content": content,
                    "mode": mode,
                    "provider": provider,
                    "sources": sources_json,
                    "now": datetime.utcnow(),
                },
            )
            conn.execute(
                text(
                    "UPDATE USER_CHAT_THREADS SET updated_at = :now WHERE id = :id"
                ),
                {"id": thread_id, "now": datetime.utcnow()},
            )
            mid = getattr(result, "lastrowid", None)
            if mid is None:
                row = conn.execute(text("SELECT LAST_INSERT_ID()")).fetchone()
                mid = int(row[0]) if row and row[0] is not None else None
            return int(mid) if mid is not None else None
    except Exception as exc:  # noqa: BLE001
        logger.error("[chat_history] insert_message failed: %s", exc)
        return None
