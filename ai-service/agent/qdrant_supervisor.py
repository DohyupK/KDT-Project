"""
Ensure Qdrant is reachable when ai-service starts.

Default: QDRANT_AUTOSTART=1 → if /readyz fails, start Docker container `kdt-qdrant`.
Does not stop Qdrant on ai-service shutdown (shared vector DB; other tools may use it).
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

CONTAINER_NAME = "kdt-qdrant"
DEFAULT_IMAGE = "qdrant/qdrant"


def qdrant_url() -> str:
    return (os.environ.get("QDRANT_URL") or "http://127.0.0.1:6333").rstrip("/")


def autostart_enabled() -> bool:
    return (os.environ.get("QDRANT_AUTOSTART", "1") or "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _ready(timeout_s: float = 2.0) -> bool:
    url = f"{qdrant_url()}/readyz"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout_s) as res:
            return 200 <= getattr(res, "status", 200) < 300
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def _docker() -> str | None:
    return shutil.which("docker")


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _storage_dir() -> Path:
    override = (os.environ.get("QDRANT_STORAGE_DIR") or "").strip()
    if override:
        return Path(override)
    # Prefer monorepo DB/data/ per db-location rule
    return _repo_root() / "DB" / "data" / "qdrant_storage"


def _docker_inspect_running() -> bool | None:
    """True/False if container exists; None if docker inspect failed."""
    docker = _docker()
    if not docker:
        return None
    try:
        r = subprocess.run(
            [docker, "inspect", "-f", "{{.State.Running}}", CONTAINER_NAME],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if r.returncode != 0:
            return None
        return (r.stdout or "").strip().lower() == "true"
    except (OSError, subprocess.TimeoutExpired):
        return None


def _start_container() -> bool:
    docker = _docker()
    if not docker:
        logger.error(
            "[qdrant] Docker not on PATH — start Qdrant manually "
            "(docker run -p 6333:6333 qdrant/qdrant) or set QDRANT_AUTOSTART=0"
        )
        return False

    running = _docker_inspect_running()
    if running is True:
        logger.info("[qdrant] container %s already running", CONTAINER_NAME)
        return True
    if running is False:
        logger.info("[qdrant] starting existing container %s", CONTAINER_NAME)
        try:
            subprocess.run(
                [docker, "start", CONTAINER_NAME],
                check=False,
                timeout=60,
                capture_output=True,
                text=True,
            )
            return True
        except (OSError, subprocess.TimeoutExpired) as exc:
            logger.error("[qdrant] docker start failed: %s", exc)
            return False

    storage = _storage_dir()
    storage.mkdir(parents=True, exist_ok=True)
    image = (os.environ.get("QDRANT_IMAGE") or DEFAULT_IMAGE).strip() or DEFAULT_IMAGE
    http_port = (os.environ.get("QDRANT_HTTP_PORT") or "6333").strip()
    grpc_port = (os.environ.get("QDRANT_GRPC_PORT") or "6334").strip()
    # Map host storage → /qdrant/storage
    args = [
        docker,
        "run",
        "-d",
        "--name",
        CONTAINER_NAME,
        "-p",
        f"{http_port}:6333",
        "-p",
        f"{grpc_port}:6334",
        "-v",
        f"{storage}:/qdrant/storage",
        image,
    ]
    logger.info("[qdrant] spawning: %s", " ".join(args))
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=180, check=False)
        if r.returncode != 0:
            logger.error(
                "[qdrant] docker run failed code=%s stderr=%s",
                r.returncode,
                (r.stderr or r.stdout or "")[:500],
            )
            return False
        return True
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.error("[qdrant] docker run error: %s", exc)
        return False


def ensure_qdrant() -> bool:
    """
    Return True if Qdrant /readyz is OK (already up or started by us).
    Soft-fails with logs when Docker unavailable.
    """
    if _ready():
        logger.info("[qdrant] already ready %s", qdrant_url())
        return True

    if not autostart_enabled():
        logger.warning(
            "[qdrant] not ready at %s and QDRANT_AUTOSTART=0 — RAG ingest will fail",
            qdrant_url(),
        )
        return False

    logger.info("[qdrant] not ready at %s — attempting Docker autostart", qdrant_url())
    if not _start_container():
        return False

    max_ms = int(os.environ.get("QDRANT_READY_MS") or "60000")
    deadline = time.time() + max_ms / 1000.0
    while time.time() < deadline:
        if _ready(timeout_s=2.0):
            logger.info("[qdrant] ready %s", qdrant_url())
            return True
        time.sleep(1.0)

    logger.error("[qdrant] health timeout after %sms at %s", max_ms, qdrant_url())
    return False
