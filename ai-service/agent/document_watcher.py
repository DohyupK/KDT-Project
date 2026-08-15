"""
Dual-engine Documents watcher (FastAPI lifespan background thread).

- TXT / text PDF → native ingest (no matching .md)
- Scan PDF / images → OCR Markdown + TEXT_MATCH → ingest
- CSV/XLSX → ai-service/data/csv_lake/ → profile MD under Confidential/Markdown
- Watches all four clearance roots + csv_lake
- Debounce + ingest lock/coalesce so burst drops do not stack full rebuilds

Does not modify SECURE_GENERATE / fillThreshold / LangGraph.
"""

from __future__ import annotations

import logging
import os
import shutil
import threading
import time
from pathlib import Path
from typing import Callable

from agent.doc_clearance import (
    CLEARANCES,
    ensure_clearance_tree,
    is_under_any_markdown,
)
from agent.document_convert import CONVERT_SUFFIXES, ConvertResult

logger = logging.getLogger(__name__)

UNSTRUCTURED_SUFFIXES = set(CONVERT_SUFFIXES)
TABLE_SUFFIXES = {".csv", ".xlsx"}
DEBOUNCE_S = float(os.environ.get("SECURE_DOCS_WATCH_DEBOUNCE", "4.0"))
STABLE_CHECKS = 3
STABLE_INTERVAL_S = 0.4

_observer = None
_pending_lock = threading.Lock()
_pending: dict[str, float] = {}
_timer: threading.Timer | None = None

_ingest_lock = threading.Lock()
_ingest_running = False
_ingest_rerun = False


def _env_enabled() -> bool:
    return (os.environ.get("SECURE_DOCS_WATCH", "1") or "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _file_stable(path: Path) -> bool:
    try:
        if not path.is_file():
            return False
        sizes: list[int] = []
        for _ in range(STABLE_CHECKS):
            sizes.append(path.stat().st_size)
            time.sleep(STABLE_INTERVAL_S)
        return len(set(sizes)) == 1
    except OSError:
        return False


def _under(path: Path, folder: Path) -> bool:
    try:
        path.resolve().relative_to(folder.resolve())
        return True
    except ValueError:
        return False


def _should_ignore(path: Path, docs_dir: Path, lake_dir: Path) -> bool:
    name = path.name
    if name.startswith(".") or name.upper().startswith("README"):
        return True
    # Profile / converted MD must never re-enter the pipeline (loop guard)
    if path.suffix.lower() == ".md":
        return True
    if is_under_any_markdown(path, docs_dir):
        return True
    if _under(path, docs_dir / "csv_profiles"):
        return True
    return False


def _request_ingest() -> None:
    """
    Coalesce full rebuilds: if ingest is running, set rerun flag; else start worker.
    Never call run_ingest on the FastAPI main thread.
    """
    global _ingest_running, _ingest_rerun

    with _ingest_lock:
        if _ingest_running:
            _ingest_rerun = True
            logger.info("[document_watcher] ingest busy → coalesce rerun")
            return
        _ingest_running = True
        _ingest_rerun = False

    def _worker() -> None:
        global _ingest_running, _ingest_rerun
        while True:
            try:
                from ingest_secure import run_ingest

                code = run_ingest()
                logger.info("[document_watcher] ingest exit=%s", code)
                if code in (0, None):
                    try:
                        from agent.rag_engine import get_engine

                        get_engine().reload_bm25()
                    except Exception as reload_exc:  # noqa: BLE001
                        logger.warning(
                            "[document_watcher] bm25 reload: %s", reload_exc
                        )
            except Exception as exc:  # noqa: BLE001
                logger.warning("[document_watcher] ingest: %s", exc)
            with _ingest_lock:
                if _ingest_rerun:
                    _ingest_rerun = False
                    logger.info("[document_watcher] running coalesced ingest")
                    continue
                _ingest_running = False
                return

    threading.Thread(target=_worker, name="secure-docs-ingest", daemon=True).start()


def _handle_path(path: Path, docs_dir: Path, ai_root: Path, lake_dir: Path) -> bool:
    """Return True if something changed that warrants ingest."""
    from agent.csv_profile import write_csv_profile
    from agent.document_convert import convert_file_to_md

    suffix = path.suffix.lower()
    if suffix in TABLE_SUFFIXES:
        lake_dir.mkdir(parents=True, exist_ok=True)
        if _under(path, lake_dir):
            return (
                write_csv_profile(path, secure_docs_dir=docs_dir, ai_root=ai_root)
                is not None
            )
        dest = lake_dir / path.name
        if dest.resolve() != path.resolve():
            if dest.exists():
                dest = lake_dir / f"{path.stem}_{int(time.time())}{path.suffix}"
            shutil.move(str(path), str(dest))
            path = dest
            logger.info("[document_watcher] moved table → %s", path)
        return (
            write_csv_profile(path, secure_docs_dir=docs_dir, ai_root=ai_root)
            is not None
        )

    if suffix in UNSTRUCTURED_SUFFIXES:
        if _under(path, lake_dir):
            return False
        out = convert_file_to_md(
            path, secure_docs_dir=docs_dir, repo_root=ai_root.parent
        )
        if isinstance(out, ConvertResult):
            return bool(out.needs_ingest)
        return out is not None

    return False


def _handle_deleted(path: Path, docs_dir: Path, ai_root: Path) -> bool:
    """Drop OCR sidecar + TEXT_MATCH when source removed."""
    suffix = path.suffix.lower()
    if suffix not in UNSTRUCTURED_SUFFIXES:
        return False
    if is_under_any_markdown(path, docs_dir):
        return False
    from agent.document_convert import remove_pair_for_deleted_source

    return remove_pair_for_deleted_source(
        path, secure_docs_dir=docs_dir, repo_root=ai_root.parent
    )


def _schedule_flush(docs_dir: Path, ai_root: Path, lake_dir: Path) -> None:
    global _timer

    def _flush() -> None:
        global _timer
        with _pending_lock:
            _timer = None
            items = list(_pending.keys())
            _pending.clear()

        changed = False
        requeue: list[str] = []
        for key in items:
            path = Path(key)
            if not path.exists():
                continue
            if not _file_stable(path):
                requeue.append(key)
                continue
            if _should_ignore(path, docs_dir, lake_dir):
                continue
            try:
                if _handle_path(path, docs_dir, ai_root, lake_dir):
                    changed = True
            except Exception as exc:  # noqa: BLE001
                logger.warning("[document_watcher] handle %s: %s", path, exc)

        if requeue:
            with _pending_lock:
                for key in requeue:
                    _pending[key] = time.time()
            _schedule_flush(docs_dir, ai_root, lake_dir)

        if changed:
            _request_ingest()

    with _pending_lock:
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(DEBOUNCE_S, _flush)
        _timer.daemon = True
        _timer.start()


def _enqueue(path: Path, docs_dir: Path, ai_root: Path, lake_dir: Path) -> None:
    if _should_ignore(path, docs_dir, lake_dir):
        return
    suffix = path.suffix.lower()
    if suffix not in UNSTRUCTURED_SUFFIXES | TABLE_SUFFIXES:
        return
    with _pending_lock:
        _pending[str(path.resolve())] = time.time()
    _schedule_flush(docs_dir, ai_root, lake_dir)


def start_document_watcher(
    *,
    docs_dir: Path | None = None,
    ai_root: Path | None = None,
) -> Callable[[], None] | None:
    global _observer
    if not _env_enabled():
        logger.info("[document_watcher] disabled")
        return None
    try:
        from watchdog.events import FileSystemEventHandler
        from watchdog.observers import Observer
    except ImportError:
        logger.warning("[document_watcher] watchdog not installed")
        return None

    from agent.csv_profile import csv_lake_dir
    from agent.rag_engine import SECURE_DOCS_DIR

    root_docs = docs_dir or SECURE_DOCS_DIR
    root_ai = ai_root or Path(__file__).resolve().parents[1]
    lake = csv_lake_dir(root_ai)
    ensure_clearance_tree(root_docs)
    lake.mkdir(parents=True, exist_ok=True)

    class Handler(FileSystemEventHandler):
        def on_created(self, event):  # noqa: ANN001
            if not event.is_directory:
                _enqueue(Path(event.src_path), root_docs, root_ai, lake)

        def on_modified(self, event):  # noqa: ANN001
            if not event.is_directory:
                _enqueue(Path(event.src_path), root_docs, root_ai, lake)

        def on_moved(self, event):  # noqa: ANN001
            if not event.is_directory:
                _enqueue(Path(event.dest_path), root_docs, root_ai, lake)

        def on_deleted(self, event):  # noqa: ANN001
            if event.is_directory:
                return
            path = Path(event.src_path)
            try:
                if _handle_deleted(path, root_docs, root_ai):
                    _request_ingest()
            except Exception as exc:  # noqa: BLE001
                logger.warning("[document_watcher] delete %s: %s", path, exc)

    observer = Observer()
    # One recursive watch on Documents covers Public/Confidential/Secret/TopSecret
    observer.schedule(Handler(), str(root_docs), recursive=True)
    observer.schedule(Handler(), str(lake), recursive=True)
    observer.daemon = True
    observer.start()
    _observer = observer
    logger.info(
        "[document_watcher] clearance_roots=%s docs=%s lake=%s debounce=%.1fs",
        ",".join(CLEARANCES),
        root_docs,
        lake,
        DEBOUNCE_S,
    )

    def stop() -> None:
        global _observer, _timer
        with _pending_lock:
            if _timer is not None:
                _timer.cancel()
                _timer = None
        try:
            observer.stop()
            observer.join(timeout=5)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[document_watcher] stop: %s", exc)
        _observer = None

    return stop
