"""Chatbot Tools. Diagnosis via registered model heads (clf + reg + future)."""

from __future__ import annotations

import json
from typing import Any

import polars as pl

from agent.model_registry import register_builtin, run_all_ready_heads
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
            "Model artifacts missing. Train first (ai-service/models/).",
        )

    thr = float(fillThreshold) if fillThreshold is not None else default_threshold()
    df = pl.DataFrame([_row_from_features(features)])
    return predict(df, fillThreshold=thr)


def run_capacity_tool(features: dict[str, Any]) -> dict[str, Any]:
    """Single-row capacity (mAh/g) Tool via train_reg_pipeline.predict_capacity."""
    from train_reg_pipeline import MODELS_DIR as REG_DIR
    from train_reg_pipeline import predict_capacity

    required = REG_DIR / "xgb_model.json"
    if not required.exists():
        raise FileNotFoundError(
            "Reg model artifacts missing. Train first (ai-service/models/reg/).",
        )
    df = pl.DataFrame([_row_from_features(features)])
    return predict_capacity(df)


def run_residual_tool(features: dict[str, Any]) -> dict[str, Any]:
    """Single-row residual_li Tool via train_residual_pipeline.predict_residual_li."""
    from train_residual_pipeline import MODELS_DIR as RES_DIR
    from train_residual_pipeline import predict_residual_li

    required = RES_DIR / "xgb_model.json"
    if not required.exists():
        raise FileNotFoundError(
            "Residual model artifacts missing. Train first (ai-service/models/residual/).",
        )
    df = pl.DataFrame([_row_from_features(features)])
    return predict_residual_li(df)


def run_registered_heads(
    features: dict[str, Any],
    fillThreshold: float | None = None,
) -> dict[str, Any]:
    """Run all ready heads from models/registry.json (extensible)."""
    return run_all_ready_heads(features, fillThreshold=fillThreshold)


# Register built-ins so registry entrypoints stay stable even if import paths change.
register_builtin("clf", run_predict_tool)
register_builtin("reg", run_capacity_tool)
register_builtin("residual", run_residual_tool)
