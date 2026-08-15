"""
PC security-chat worker: poll USER_SECURITY_MESSAGES (pending user rows),
run Secure RAG + local vLLM, write assistant.

This process is NOT started by AWS `npm run dev`. Run on the GPU PC:

  python ai-service/scripts/run_security_worker.py

Needs: root .env DB_*, QDRANT_URL (AWS Qdrant via ssh -L 6333 if needed),
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1, vLLM already up.
"""
from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
AI = REPO / "ai-service"
sys.path.insert(0, str(AI))

from dotenv import load_dotenv

load_dotenv(REPO / ".env", override=False)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [security-worker] %(levelname)s %(message)s",
)
logger = logging.getLogger("security-worker")


def _poll_sec() -> float:
    try:
        return max(0.2, float(os.environ.get("SECURITY_WORKER_POLL_SEC", "0.5")))
    except ValueError:
        return 0.5


def main() -> int:
    from agent import chat_history_store as hist
    from agent import security_queue_store as qstore
    from agent.secure_llm.graph import run_secure_chat

    db = hist.chat_history_db_status()
    if not db.get("ok"):
        logger.error("MariaDB unavailable: %s", db.get("error"))
        return 1

    logger.info(
        "watching USER_SECURITY_MESSAGES pending rows poll=%.2fs vllm=%s qdrant=%s",
        _poll_sec(),
        os.environ.get("CHAT_VLLM_BASE_URL") or "http://127.0.0.1:8001/v1",
        os.environ.get("QDRANT_URL") or "http://127.0.0.1:6333",
    )

    while True:
        job = qstore.claim_next_pending()
        if not job:
            time.sleep(_poll_sec())
            continue
        mid = int(job["id"])
        tid = str(job["thread_id"])
        text = str(job.get("content") or "").strip()
        logger.info("claimed id=%s thread=%s chars=%s", mid, tid, len(text))
        try:
            history = qstore.load_messages(tid, limit=50, exclude_pending=True)
            prior = hist.last_assistant_sources(history)
            history_text = hist.format_history_text_compact(history)
            out = run_secure_chat(
                text,
                prior_sources=prior,
                history_text=history_text,
            )
            reply = str(out.get("reply") or "")
            err = out.get("error")
            st = "error" if err else "done"
            qstore.insert_assistant(
                thread_id=tid,
                content=reply,
                status=st,
                mode=out.get("mode"),
                provider=out.get("provider"),
                sources=out.get("sources") or [],
            )
            qstore.mark_user(message_id=mid, status=st)
            logger.info(
                "done id=%s status=%s mode=%s provider=%s",
                mid,
                st,
                out.get("mode"),
                out.get("provider"),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("job id=%s failed: %s", mid, exc)
            qstore.insert_assistant(
                thread_id=tid,
                content=f"보안 워커 오류: {exc}"[:2000],
                status="error",
                mode="template",
                provider="offline",
                sources=[],
            )
            qstore.mark_user(message_id=mid, status="error")


if __name__ == "__main__":
    raise SystemExit(main())
