"""
MariaDB text_match: link Documents source (image/scan PDF) ↔ OCR Markdown sidecar.

Soft-fails when DATABASE_URL / DB_* is missing (same engine as chat_history_store).
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def _engine():
    from agent.chat_history_store import get_engine

    return get_engine()


def upsert(
    *,
    source_path: str,
    md_path: str,
    clearance: str,
    source_ext: str,
    extract_method: str = "ocr",
    source_sha1: str | None = None,
    status: str = "ready",
    error_message: str | None = None,
) -> bool:
    engine = _engine()
    if engine is None:
        logger.warning("[text_match] upsert skipped — DB unavailable")
        return False
    try:
        from sqlalchemy import text

        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO text_match (
                      source_path, md_path, clearance, source_ext,
                      extract_method, source_sha1, status, error_message
                    ) VALUES (
                      :source_path, :md_path, :clearance, :source_ext,
                      :extract_method, :source_sha1, :status, :error_message
                    )
                    ON DUPLICATE KEY UPDATE
                      md_path = VALUES(md_path),
                      clearance = VALUES(clearance),
                      source_ext = VALUES(source_ext),
                      extract_method = VALUES(extract_method),
                      source_sha1 = VALUES(source_sha1),
                      status = VALUES(status),
                      error_message = VALUES(error_message)
                    """
                ),
                {
                    "source_path": source_path[:512],
                    "md_path": md_path[:512],
                    "clearance": clearance[:32],
                    "source_ext": source_ext[:16],
                    "extract_method": (extract_method or "ocr")[:32],
                    "source_sha1": (source_sha1 or None),
                    "status": (status or "ready")[:16],
                    "error_message": (error_message or None),
                },
            )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("[text_match] upsert fail: %s", exc)
        return False


def get_by_source(source_path: str) -> dict[str, Any] | None:
    engine = _engine()
    if engine is None:
        return None
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT id, source_path, md_path, clearance, source_ext,
                           extract_method, source_sha1, status, error_message,
                           created_at, updated_at
                    FROM text_match
                    WHERE source_path = :source_path
                    LIMIT 1
                    """
                ),
                {"source_path": source_path[:512]},
            ).mappings().fetchone()
        return dict(row) if row else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("[text_match] get_by_source fail: %s", exc)
        return None


def get_by_md(md_path: str) -> dict[str, Any] | None:
    engine = _engine()
    if engine is None:
        return None
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT id, source_path, md_path, clearance, source_ext,
                           extract_method, source_sha1, status, error_message,
                           created_at, updated_at
                    FROM text_match
                    WHERE md_path = :md_path
                    LIMIT 1
                    """
                ),
                {"md_path": md_path[:512]},
            ).mappings().fetchone()
        return dict(row) if row else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("[text_match] get_by_md fail: %s", exc)
        return None


def delete_by_source(source_path: str) -> bool:
    engine = _engine()
    if engine is None:
        return False
    try:
        from sqlalchemy import text

        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM text_match WHERE source_path = :source_path"),
                {"source_path": source_path[:512]},
            )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("[text_match] delete_by_source fail: %s", exc)
        return False


def resolve_md_path(source_path: str) -> str | None:
    """Chat/RAG helper: source → paired Markdown path when OCR sidecar exists."""
    row = get_by_source(source_path)
    if not row:
        return None
    status = (row.get("status") or "ready").lower()
    if status not in ("ready", "ok"):
        return None
    md = row.get("md_path")
    return str(md) if md else None
