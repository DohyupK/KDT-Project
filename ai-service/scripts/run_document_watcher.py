"""
Standalone Documents watcher daemon (OCR / text_match / ingest trigger).

Owned by Express backend via documentWatcherSupervisor — not by FastAPI lifespan.

Usage (cwd=ai-service/):
  python scripts/run_document_watcher.py
"""

from __future__ import annotations

import logging
import signal
import sys
import threading
import time
from pathlib import Path

from dotenv import load_dotenv

AI_ROOT = Path(__file__).resolve().parents[1]
REPO = AI_ROOT.parent
sys.path.insert(0, str(AI_ROOT))
load_dotenv(REPO / ".env", override=False)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("document_watcher_daemon")


def main() -> int:
    # Force-enable for this process even if SECURE_DOCS_WATCH=0 in env for ai-service.
    import os

    os.environ.setdefault("SECURE_DOCS_WATCH", "1")

    from agent.document_watcher import start_document_watcher

    stop = start_document_watcher()
    if stop is None:
        logger.error("watcher did not start (SECURE_DOCS_WATCH off or watchdog missing)")
        return 1

    logger.info("document watcher running (controlled by backend supervisor)")
    stop_event = threading.Event()

    def _handle(_sig: int, _frame: object) -> None:
        stop_event.set()

    signal.signal(signal.SIGINT, _handle)
    signal.signal(signal.SIGTERM, _handle)

    try:
        while not stop_event.is_set():
            time.sleep(1.0)
    finally:
        try:
            stop()
        except Exception as exc:  # noqa: BLE001
            logger.warning("stop: %s", exc)
        logger.info("document watcher stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
