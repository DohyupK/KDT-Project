"""
Cascade voting inference for judgment_lots fields.

CWD: ai-service/
Loads models/voting_config.json and member artifacts under models/voting/.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import polars as pl
import xgboost as xgb
from catboost import CatBoostClassifier, CatBoostRegressor, Pool

from train_pipeline import CAT_COL, CAT_FILL, OPTIMAL_SINTERING_TEMP, add_domain_features

VOTING_CONFIG_PATH = Path("models/voting_config.json")
_cache: dict[str, dict[str, Any]] = {}
_config: dict[str, Any] | None = None


def load_voting_config(path: Path = VOTING_CONFIG_PATH) -> dict[str, Any]:
    global _config
    if _config is None:
        with open(path, encoding="utf-8") as f:
            _config = json.load(f)
    return _config


def residual_to_score(r: float, caution: float = 3000.0, usl: float = 4000.0) -> float:
    if usl <= caution:
        return 0.0
    return float(np.clip((r - caution) / (usl - caution), 0.0, 1.0))


def _maybe_domain(df: pl.DataFrame) -> pl.DataFrame:
    required = {"sintering_temp", "humidity", "metal_impurity", "d50", "d90", "lithium_input"}
    if required <= set(df.columns):
        return add_domain_features(df)
    cols = set(df.columns)
    exprs: list[pl.Expr] = []
    if "sintering_temp" in cols:
        exprs.append(
            (pl.col("sintering_temp") - OPTIMAL_SINTERING_TEMP).abs().alias("temp_dev_from_800")
        )
        exprs.append(
            ((pl.col("sintering_temp") - OPTIMAL_SINTERING_TEMP) ** 2).alias(
                "temp_dev_from_800_sq"
            )
        )
    if {"d50", "d90"} <= cols:
        exprs.append((pl.col("d90") - pl.col("d50")).alias("particle_span"))
    if {"sintering_temp", "humidity"} <= cols:
        exprs.append((pl.col("sintering_temp") * pl.col("humidity")).alias("temp_x_humidity"))
    return df.with_columns(exprs) if exprs else df


def _load_member(dir_path: Path) -> dict[str, Any]:
    key = str(dir_path.resolve())
    if key in _cache:
        return _cache[key]
    with open(dir_path / "metadata.json", encoding="utf-8") as f:
        meta = json.load(f)
    task = meta["task"]
    if task == "classification":
        xgb_m = xgb.XGBClassifier()
        xgb_m.load_model(dir_path / "xgb_model.json")
        cat_m = CatBoostClassifier()
        cat_m.load_model(str(dir_path / "cat_model.cbm"))
    else:
        xgb_m = xgb.XGBRegressor()
        xgb_m.load_model(dir_path / "xgb_model.json")
        cat_m = CatBoostRegressor()
        cat_m.load_model(str(dir_path / "cat_model.cbm"))
    enc = None
    enc_path = dir_path / "encoder.pkl"
    if enc_path.exists():
        enc = joblib.load(enc_path)
    with open(dir_path / "imputer_values.json", encoding="utf-8") as f:
        imputer = json.load(f)
    bundle = {
        "meta": meta,
        "xgb": xgb_m,
        "cat": cat_m,
        "encoder": enc,
        "imputer": imputer,
        "task": task,
    }
    _cache[key] = bundle
    return bundle


def _row_from_features(features: dict[str, Any], feature_columns: list[str]) -> pl.DataFrame:
    row: dict[str, Any] = {}
    for c in feature_columns:
        if c in features and features[c] is not None:
            row[c] = features[c]
        elif c == CAT_COL:
            row[c] = CAT_FILL
        else:
            row[c] = None
    # include raw keys that domain engineering may need
    for k, v in features.items():
        if k not in row:
            row[k] = v
    return pl.DataFrame([row])


def _apply_imputer(df: pl.DataFrame, imputer: dict[str, Any]) -> pl.DataFrame:
    means: dict[str, float] = imputer["numeric_means"]
    exprs: list[pl.Expr] = []
    for col, mean_val in means.items():
        if col in df.columns:
            exprs.append(pl.col(col).fill_null(mean_val).alias(col))
        else:
            df = df.with_columns(pl.lit(mean_val).alias(col))
    if CAT_COL in df.columns:
        exprs.append(
            pl.col(CAT_COL)
            .fill_null(imputer.get("categorical_fill", CAT_FILL))
            .alias(CAT_COL)
        )
    return df.with_columns(exprs) if exprs else df


def _predict_member(dir_rel: str, features: dict[str, Any]) -> float:
    bundle = _load_member(Path(dir_rel))
    meta = bundle["meta"]
    feature_columns: list[str] = meta["feature_columns"]
    numeric_cols: list[str] = meta.get("numeric_cols") or [
        c for c in feature_columns if c != CAT_COL
    ]
    cat_cols: list[str] = meta.get("cat_features") or []
    df = _row_from_features(features, feature_columns)
    df = _maybe_domain(df)
    # ensure all feature columns exist
    for c in feature_columns:
        if c not in df.columns:
            df = df.with_columns(pl.lit(None).alias(c))
    df = _apply_imputer(df, bundle["imputer"])
    df = df.select([c for c in feature_columns if c in df.columns])

    # XGB matrix
    parts: list[np.ndarray] = []
    nums = [c for c in numeric_cols if c in df.columns]
    if nums:
        parts.append(df.select(nums).to_numpy().astype(np.float64))
    if cat_cols and bundle["encoder"] is not None:
        parts.append(
            bundle["encoder"]
            .transform(df.select(cat_cols).to_numpy())
            .astype(np.float64)
        )
    X = np.hstack(parts) if len(parts) > 1 else parts[0]

    cat_idx = [feature_columns.index(c) for c in cat_cols if c in feature_columns]
    if cat_idx:
        col_data = [df[c].to_list() for c in feature_columns]
        rows = list(map(list, zip(*col_data)))
        pool = Pool(data=rows, cat_features=cat_idx, feature_names=feature_columns)
    else:
        pool = Pool(data=df.select(feature_columns).to_numpy(), feature_names=feature_columns)

    if bundle["task"] == "classification":
        p_xgb = float(bundle["xgb"].predict_proba(X)[0, 1])
        p_cat = float(bundle["cat"].predict_proba(pool)[0, 1])
        return 0.5 * p_xgb + 0.5 * p_cat
    p_xgb = float(bundle["xgb"].predict(X)[0])
    p_cat = float(np.asarray(bundle["cat"].predict(pool), dtype=np.float64)[0])
    return 0.5 * p_xgb + 0.5 * p_cat


def _weighted_avg(members: list[dict[str, Any]], features: dict[str, Any]) -> float:
    num = 0.0
    den = 0.0
    for m in members:
        w = float(m["weight"])
        val = _predict_member(m["dir"], features)
        num += w * val
        den += w
    return num / den if den else 0.0


def predict_voting(
    features: dict[str, Any],
    fill_threshold: float | None = None,
) -> dict[str, Any]:
    """
    Returns judgment-oriented fields:
      capacity, residual_li, probability, quality_defect (if threshold set), details
    """
    cfg = load_voting_config()
    capacity = _weighted_avg(cfg["capacity"]["members"], features)
    residual_li = _weighted_avg(cfg["residual_li"]["members"], features)

    std = cfg.get("standard_residual", {})
    caution = float(std.get("caution", 3000))
    usl = float(std.get("usl_spare", 4000))

    cascade = {**features, "capacity": capacity, "residual_li": residual_li}
    num = 0.0
    den = 0.0
    detail: dict[str, float] = {}
    for m in cfg["probability"]["members"]:
        w = float(m["weight"])
        kind = m["kind"]
        if kind == "clf_proba":
            val = _predict_member(m["dir"], features)
        elif kind == "clf_proba_cascade":
            val = _predict_member(m["dir"], cascade)
        elif kind == "residual_score":
            r = _predict_member(m["dir"], features)
            val = residual_to_score(r, caution=caution, usl=usl)
        else:
            raise ValueError(f"Unknown probability kind: {kind}")
        detail[m["id"]] = val
        num += w * val
        den += w
    probability = num / den if den else 0.0

    thr_cfg = cfg.get("threshold") or {}
    thr = fill_threshold
    if thr is None:
        thr = thr_cfg.get("default_threshold")
    quality_defect = None
    if thr is not None:
        quality_defect = 1 if probability >= float(thr) else 0

    return {
        "capacity": float(capacity),
        "residual_li": float(residual_li),
        "probability": float(probability),
        "quality_defect": quality_defect,
        "applied_threshold": thr,
        "unit_capacity": "mAh/g",
        "unit_residual": "ppm",
        "probability_denominator": den,
        "member_scores": detail,
    }
