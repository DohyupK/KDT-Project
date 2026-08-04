"""
Control bounds cache (SSOT file → memory).

Wiring (see docs/references/control-bounds-wiring.md):
  Setting UI → Express PUT /api/settings/control-bounds
    → writes ai-service/config/control_bounds.json
    → this module reloads on mtime change (no DB hit)
    → agent/whatif.py clips grid search to these limits
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# ai-service/config/control_bounds.json (package-relative)
_BOUNDS_PATH = Path(__file__).resolve().parent.parent / "config" / "control_bounds.json"

_DEFAULT: dict[str, dict[str, float]] = {
    "sintering_temp": {"min": 700.0, "max": 850.0},
    "humidity": {"min": 5.0, "max": 95.0},
}

_cache: dict[str, dict[str, float]] | None = None
_cache_mtime: float | None = None


def bounds_path() -> Path:
    return _BOUNDS_PATH


def _normalize(raw: dict[str, Any]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for key, default in _DEFAULT.items():
        block = raw.get(key) if isinstance(raw, dict) else None
        if not isinstance(block, dict):
            out[key] = dict(default)
            continue
        lo = float(block.get("min", default["min"]))
        hi = float(block.get("max", default["max"]))
        if lo > hi:
            lo, hi = hi, lo
        out[key] = {"min": lo, "max": hi}
    return out


def ensure_bounds_file() -> Path:
    """Create default JSON if missing."""
    path = _BOUNDS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(
            json.dumps(_DEFAULT, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return path


def get_control_bounds() -> dict[str, dict[str, float]]:
    """
    Return humidity / sintering_temp min·max from file, cached by mtime.
    Setting page saves via Express; next whatif call picks up new values.
    """
    global _cache, _cache_mtime
    path = ensure_bounds_file()
    mtime = path.stat().st_mtime
    if _cache is not None and _cache_mtime == mtime:
        return _cache
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    _cache = _normalize(raw if isinstance(raw, dict) else {})
    _cache_mtime = mtime
    return _cache


def clip_value(key: str, value: float, bounds: dict[str, dict[str, float]] | None = None) -> float:
    b = (bounds or get_control_bounds()).get(key) or _DEFAULT.get(key, {"min": value, "max": value})
    return max(float(b["min"]), min(float(b["max"]), float(value)))
