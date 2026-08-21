"""Cheap security-chat dependency checks; never load embedding or LLM models."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _get_json(url: str, timeout_s: float = 0.8) -> tuple[bool, str | None]:
    try:
        req = Request(url, headers={"Accept": "application/json"})
        with urlopen(req, timeout=timeout_s) as response:  # noqa: S310
            if int(getattr(response, "status", 200)) >= 400:
                return False, f"HTTP {response.status}"
            raw = response.read(4096)
            if raw:
                json.loads(raw.decode("utf-8", errors="replace"))
        return True, None
    except HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except (URLError, OSError, ValueError, json.JSONDecodeError):
        return False, "연결할 수 없음"


def security_chat_readiness() -> dict[str, Any]:
    from agent.chat_history_store import chat_history_db_status
    from agent.rag_engine import collection_name, qdrant_url
    from agent.secure_llm.llm import vllm_base_url

    db = chat_history_db_status()
    db_ok = bool(db.get("ok"))
    qdrant_ok, qdrant_error = _get_json(
        f"{qdrant_url()}/collections/{collection_name()}"
    )
    vllm_ok, vllm_error = _get_json(f"{vllm_base_url()}/models")
    checks = {
        "mariadb": {
            "ok": db_ok,
            "label": "보안 대화 큐",
            "detail": None if db_ok else "MariaDB 대화 저장소에 연결할 수 없음",
        },
        "qdrant": {
            "ok": qdrant_ok,
            "label": "보안 문서 검색",
            "detail": qdrant_error,
        },
        "vllm": {
            "ok": vllm_ok,
            "label": "로컬 생성 모델",
            "detail": vllm_error,
        },
    }
    missing = [value["label"] for value in checks.values() if not value["ok"]]
    ready = not missing
    message = (
        "보안 챗봇 준비 완료"
        if ready
        else "사용 전 확인 필요: " + ", ".join(missing)
    )
    return {
        "ready": ready,
        "status": "ready" if ready else "degraded",
        "message": message,
        "checks": checks,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "note": "현재 ai-service가 접근하는 MariaDB·Qdrant·vLLM 기준입니다.",
    }
