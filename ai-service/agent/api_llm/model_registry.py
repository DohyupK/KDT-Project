"""
Extensible model head registry (models/registry.json).

Add a new head later by appending to registry.json with:
  ready, dir, entrypoint (module.function), optional task.
Ready heads that expose LOT-feature tools are run together in chat.
"""

from __future__ import annotations

import importlib
import json
import logging
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = ROOT / "models" / "registry.json"

# Built-in runners for known heads (stable). Unknown heads use entrypoint import.
_BUILTIN: dict[str, Callable[..., dict[str, Any]]] = {}


def _load_registry() -> dict[str, Any]:
    if not REGISTRY_PATH.exists():
        return {"version": 1, "heads": {}}
    with open(REGISTRY_PATH, encoding="utf-8") as f:
        return json.load(f)


def list_ready_heads() -> list[dict[str, Any]]:
    """Return ready heads with id attached, sorted by id for stable order."""
    raw = _load_registry()
    heads = raw.get("heads") or {}
    out: list[dict[str, Any]] = []
    for hid, meta in heads.items():
        if not isinstance(meta, dict):
            continue
        if not meta.get("ready"):
            continue
        item = dict(meta)
        item["id"] = hid
        out.append(item)
    out.sort(key=lambda h: str(h["id"]))
    return out


def resolve_entrypoint(dotted: str) -> Callable[..., Any]:
    module_name, _, attr = dotted.rpartition(".")
    if not module_name or not attr:
        raise ValueError(f"Invalid entrypoint: {dotted}")
    mod = importlib.import_module(module_name)
    fn = getattr(mod, attr, None)
    if fn is None or not callable(fn):
        raise ValueError(f"Entrypoint not callable: {dotted}")
    return fn


def register_builtin(head_id: str, fn: Callable[..., dict[str, Any]]) -> None:
    _BUILTIN[head_id] = fn


def run_head(
    head: dict[str, Any],
    features: dict[str, Any],
    fillThreshold: float | None = None,
) -> dict[str, Any]:
    """
    Invoke one head. Returns {ok, head_id, task, result?} or {ok:False, error}.
    """
    hid = str(head["id"])
    task = str(head.get("task") or "")
    try:
        if hid in _BUILTIN:
            if hid == "clf":
                result = _BUILTIN[hid](features, fillThreshold=fillThreshold)
            else:
                result = _BUILTIN[hid](features)
        else:
            fn = resolve_entrypoint(str(head["entrypoint"]))
            # Prefer kwargs that known tools accept; fall back to features-only.
            try:
                result = fn(features, fillThreshold=fillThreshold)
            except TypeError:
                result = fn(features)
        return {
            "ok": True,
            "head_id": hid,
            "task": task,
            "result": result,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("head %s failed: %s", hid, exc)
        return {
            "ok": False,
            "head_id": hid,
            "task": task,
            "error": str(exc),
        }


def run_all_ready_heads(
    features: dict[str, Any],
    fillThreshold: float | None = None,
) -> dict[str, Any]:
    """
    Run every ready registry head.

    Returns:
      heads: {head_id: {ok, task, result|error}}
      predict: clf result if present (compat)
      capacity: reg result if present (compat)
      residual: residual head result if present (compat)
      error: clf error string if clf failed (compat for chat)
    """
    heads_out: dict[str, Any] = {}
    predict: dict[str, Any] | None = None
    capacity: dict[str, Any] | None = None
    residual: dict[str, Any] | None = None
    error: str | None = None

    for head in list_ready_heads():
        hid = str(head["id"])
        packed = run_head(head, features, fillThreshold=fillThreshold)
        heads_out[hid] = packed
        if hid == "clf":
            if packed.get("ok"):
                predict = packed.get("result")
            else:
                error = packed.get("error")
        elif hid == "reg":
            if packed.get("ok"):
                capacity = packed.get("result")
        elif hid == "residual":
            if packed.get("ok"):
                residual = packed.get("result")

    return {
        "heads": heads_out,
        "predict": predict,
        "capacity": capacity,
        "residual": residual,
        "error": error,
    }
