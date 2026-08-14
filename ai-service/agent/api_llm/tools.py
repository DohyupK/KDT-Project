"""Chatbot Tools. Diagnosis via cascade voting (legacy single-head disconnected)."""

from __future__ import annotations

from typing import Any

from agent.api_llm.model_registry import register_builtin, run_all_ready_heads

RAW_FEATURE_KEYS = (
    "d50",
    "d90",
    "metal_impurity",
    "lithium_input",
    "additive_ratio",
    "process_time",
    "sintering_temp",
    "humidity",
    "tank_pressure",
    "operator_id",
)


def default_threshold() -> float:
    from pathlib import Path
    import json

    cfg_path = Path("models/voting_config.json")
    if cfg_path.exists():
        with open(cfg_path, encoding="utf-8") as f:
            cfg = json.load(f)
        thr = (cfg.get("threshold") or {}).get("default_threshold")
        if thr is not None:
            return float(thr)
    return 0.8


def _row_from_features(features: dict[str, Any]) -> dict[str, Any]:
    missing = [k for k in RAW_FEATURE_KEYS if k not in features]
    if missing:
        raise ValueError(f"Missing feature keys: {missing}")
    row: dict[str, Any] = {k: features[k] for k in RAW_FEATURE_KEYS}
    if features.get("id") is not None:
        row["id"] = features["id"]
    if features.get("timestamp") is not None:
        row["timestamp"] = features["timestamp"]
    return row


def _vote(features: dict[str, Any], fillThreshold: float | None = None) -> dict[str, Any]:
    from pathlib import Path

    from voting_predict import predict_voting

    if not Path("models/voting_config.json").exists():
        raise FileNotFoundError(
            "Voting config missing. Legacy models disconnected; train voting members first.",
        )
    return predict_voting(
        _row_from_features(features),
        fill_threshold=float(fillThreshold) if fillThreshold is not None else None,
    )


def run_predict_tool(
    features: dict[str, Any],
    fillThreshold: float | None = None,
) -> dict[str, Any]:
    """O/X from voting probability."""
    voted = _vote(features, fillThreshold)
    thr = voted.get("applied_threshold")
    if thr is None:
        thr = float(fillThreshold) if fillThreshold is not None else default_threshold()
    qd = voted.get("quality_defect")
    if qd is None:
        qd = 1 if float(voted["probability"]) >= float(thr) else 0
    return {
        "defect_status": int(qd),
        "probability": float(voted["probability"]),
        "applied_threshold": float(thr),
        "top_risk_factors": [],
    }


def run_capacity_tool(features: dict[str, Any]) -> dict[str, Any]:
    """Capacity from voting."""
    voted = _vote(features)
    return {
        "capacity": float(voted["capacity"]),
        "unit": "mAh/g",
        "top_factors": [],
    }


def run_residual_tool(features: dict[str, Any]) -> dict[str, Any]:
    """residual_li from voting."""
    voted = _vote(features)
    return {
        "residual_li": float(voted["residual_li"]),
        "unit": "ppm",
        "top_factors": [],
    }


def run_voting_tool(
    features: dict[str, Any],
    fillThreshold: float | None = None,
) -> dict[str, Any]:
    """Full cascade voting payload."""
    return _vote(features, fillThreshold)


def run_registered_heads(
    features: dict[str, Any],
    fillThreshold: float | None = None,
) -> dict[str, Any]:
    """Run all ready heads from models/registry.json (voting)."""
    return run_all_ready_heads(features, fillThreshold=fillThreshold)


register_builtin("voting", run_voting_tool)
# Compatibility aliases for older prompts/call sites
register_builtin("clf", run_predict_tool)
register_builtin("reg", run_capacity_tool)
register_builtin("residual", run_residual_tool)
