"""Chatbot Tools. Diagnosis must go through train_pipeline.predict only."""

from __future__ import annotations

import json
from typing import Any

import polars as pl

from train_pipeline import MODELS_DIR, predict

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
    cfg_path = MODELS_DIR / "ensemble_config.json"
    if cfg_path.exists():
        with open(cfg_path, encoding="utf-8") as f:
            cfg = json.load(f)
        return float(cfg.get("default_threshold", 0.5))
    return 0.5


def run_predict_tool(
    features: dict[str, Any],
    fillThreshold: float | None = None,
) -> dict[str, Any]:
    """
    Single-row O/X diagnosis Tool.

    Returns predict() JSON only — no remediation / control advice.
    """
    required = MODELS_DIR / "xgb_model.json"
    if not required.exists():
        raise FileNotFoundError(
            "Model artifacts missing. Train first (ai-service/models/)."
        )

    missing = [k for k in RAW_FEATURE_KEYS if k not in features]
    if missing:
        raise ValueError(f"Missing feature keys: {missing}")

    row: dict[str, Any] = {k: features[k] for k in RAW_FEATURE_KEYS}
    if features.get("id") is not None:
        row["id"] = features["id"]
    if features.get("timestamp") is not None:
        row["timestamp"] = features["timestamp"]

    thr = float(fillThreshold) if fillThreshold is not None else default_threshold()
    df = pl.DataFrame([row])
    return predict(df, fillThreshold=thr)
