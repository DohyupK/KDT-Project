"""Per-LOT SHAP drivers for defect probability and residual Li voting models."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
import xgboost as xgb

from voting_predict import (
    CAT_COL,
    _apply_imputer,
    _load_member,
    _maybe_domain,
    _row_from_features,
    load_voting_config,
)
import xgboost as xgb

FEATURE_LABELS: dict[str, str] = {
    "metal_impurity": "금속 불순물",
    "temp_dev_from_800": "소성온도 이탈",
    "humidity": "습도",
    "temp_x_humidity": "소성온도×습도",
    "process_time": "공정 시간",
    "sintering_temp": "소성 온도",
    "lithium_input": "리튬 투입량",
    "additive_ratio": "첨가제 비율",
    "d50": "입도 d50",
    "d90": "입도 d90",
    "tank_pressure": "탱크 압력",
    "particle_span": "입도 span",
}

FEATURE_UNITS: dict[str, str] = {
    "humidity": "%RH",
    "d50": "µm",
    "d90": "µm",
    "sintering_temp": "°C",
    "metal_impurity": "ppm",
    "lithium_input": "",
    "additive_ratio": "",
    "process_time": "분",
    "tank_pressure": "bar",
    "temp_dev_from_800": "°C",
}

REF_DEFAULTS: dict[str, tuple[float, str]] = {
    "humidity": (45.0, "권장 45%RH"),
    "sintering_temp": (800.0, "목표 800°C"),
}

# U-shape / process targets: 증가·감소의 기준점 (SHAP 부호와 별개).
PROCESS_TARGETS: dict[str, tuple[float, str]] = {
    "sintering_temp": (800.0, "목표 800°C"),
    "temp_dev_from_800": (0.0, "목표 0°C"),
}

# temp_dev SHAP는 소성온도 표시로 합산 (증가/감소를 온도 원값으로 씀).
DISPLAY_MERGE: dict[str, str] = {
    "temp_dev_from_800": "sintering_temp",
}

DISPLAY_FEATURES = frozenset(
    {
        "humidity",
        "d50",
        "d90",
        "sintering_temp",
        "metal_impurity",
        "lithium_input",
        "additive_ratio",
        "process_time",
        "tank_pressure",
        "temp_dev_from_800",
    }
)


def _top_weight_member(members: list[dict[str, Any]]) -> dict[str, Any]:
    return max(members, key=lambda m: float(m.get("weight", 0)))


def _direction_ko(value: float, ref: float | None, _feature: str) -> str:
    """측정값이 기준보다 큰지/작은지. 예측을 올렸는지는 SHAP 부호로 따로 가린다."""
    if ref is None:
        return "변동"
    delta = value - ref
    if abs(delta) < 1e-9:
        return "변동"
    return "증가" if delta > 0 else "감소"


def _imputer_means(imputer: dict[str, Any] | None) -> dict[str, float]:
    if not imputer:
        return {}
    raw = imputer.get("numeric_means") or imputer.get("numeric") or {}
    out: dict[str, float] = {}
    for k, v in raw.items():
        try:
            out[str(k)] = float(v)
        except (TypeError, ValueError):
            continue
    return out


def _ref_for_feature(
    feature: str,
    _value: float,
    spc_refs: dict[str, float] | None,
    imputer_means: dict[str, float] | None = None,
) -> tuple[float | None, str | None]:
    if feature in PROCESS_TARGETS:
        return PROCESS_TARGETS[feature]
    means = imputer_means or {}
    if feature in means:
        return float(means[feature]), None
    if spc_refs and feature in spc_refs:
        center = float(spc_refs[feature])
        unit = FEATURE_UNITS.get(feature, "")
        suffix = unit if unit else ""
        return center, f"SPC 중심 {center:g}{suffix}"
    if feature in REF_DEFAULTS:
        ref, label = REF_DEFAULTS[feature]
        return ref, label
    return None, None


def _format_value(feature: str, value: float) -> str:
    unit = FEATURE_UNITS.get(feature, "")
    if feature == "humidity":
        text = f"{value:.2f}"
    elif feature in ("d50", "d90", "sintering_temp", "temp_dev_from_800"):
        text = f"{value:.2f}"
    elif feature == "metal_impurity":
        text = f"{value:.2f}".rstrip("0").rstrip(".")
    elif feature == "lithium_input":
        text = f"{value:.2f}".rstrip("0").rstrip(".")
    elif feature == "process_time":
        text = f"{value:.0f}"
    elif feature == "tank_pressure":
        text = f"{value:.2f}".rstrip("0").rstrip(".")
    else:
        text = f"{value:g}"
    return f"{text}{unit}" if unit else text


def _select_causes(causes: list[dict[str, Any]], *, top_k: int = 3, min_share_pct: float = 1.0) -> list[dict[str, Any]]:
    """Positive SHAP drivers: up to top_k with share >= min_share_pct."""
    meaningful = [c for c in causes if float(c.get("sharePct") or 0) >= min_share_pct]
    if not meaningful:
        meaningful = causes[:1]
    return meaningful[:top_k]


def _shap_row_for_xgb(model: Any, X: np.ndarray) -> np.ndarray:
    """Per-row SHAP via booster pred_contribs (sklearn TreeExplainer is brittle on loaded JSON)."""
    booster = model.get_booster() if hasattr(model, "get_booster") else model
    dmat = xgb.DMatrix(np.ascontiguousarray(X, dtype=np.float64))
    contrib = booster.predict(dmat, pred_contribs=True)
    arr = np.asarray(contrib, dtype=np.float64)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    return arr[0, :-1]


def _model_matrix(
    bundle: dict[str, Any],
    df: pl.DataFrame,
    numeric_cols: list[str],
    cat_cols: list[str],
) -> tuple[np.ndarray, list[str]]:
    """Same numeric+encoded-cat layout as voting_predict._predict_member."""
    nums = [c for c in numeric_cols if c in df.columns]
    parts: list[np.ndarray] = []
    if nums:
        parts.append(df.select(nums).to_numpy().astype(np.float64))
    encoder = bundle.get("encoder")
    if cat_cols and encoder is not None:
        present = [c for c in cat_cols if c in df.columns]
        if present:
            parts.append(encoder.transform(df.select(present).to_numpy()).astype(np.float64))
    if not parts:
        return np.zeros((1, 0), dtype=np.float64), nums
    X = np.hstack(parts) if len(parts) > 1 else parts[0]
    return np.ascontiguousarray(X, dtype=np.float64), nums


def _causes_from_shap(
    bundle: dict[str, Any],
    features: dict[str, Any],
    spc_refs: dict[str, float] | None,
    *,
    top_k: int = 3,
    min_share_pct: float = 1.0,
) -> list[dict[str, Any]]:
    meta = bundle["meta"]
    feature_columns: list[str] = meta["feature_columns"]
    numeric_cols: list[str] = meta.get("numeric_cols") or [
        c for c in feature_columns if c != CAT_COL
    ]
    cat_cols: list[str] = meta.get("cat_features") or []
    df = _row_from_features(features, feature_columns)
    df = _maybe_domain(df)
    for c in feature_columns:
        if c not in df.columns:
            df = df.with_columns(pl.lit(None).alias(c))
    df = _apply_imputer(df, bundle["imputer"])
    X, nums = _model_matrix(bundle, df, numeric_cols, cat_cols)
    row = _shap_row_for_xgb(bundle["xgb"], X)
    row = row[: len(nums)]

    pos: dict[str, float] = {}
    for i, col in enumerate(nums):
        shap_i = float(row[i])
        if shap_i <= 0:
            continue
        display = DISPLAY_MERGE.get(col, col)
        if display not in DISPLAY_FEATURES:
            continue
        pos[display] = pos.get(display, 0.0) + shap_i

    pos_total = float(sum(pos.values())) or 1.0
    ranked = sorted(pos.items(), key=lambda x: x[1], reverse=True)
    means = _imputer_means(bundle.get("imputer"))

    causes: list[dict[str, Any]] = []
    for feat, shap_i in ranked:
        share = (shap_i / pos_total) * 100.0
        raw_val = features.get(feat)
        if raw_val is None:
            continue
        val = float(raw_val)
        ref_val, ref_label = _ref_for_feature(feat, val, spc_refs, means)
        causes.append(
            {
                "feature": feat,
                "labelKo": FEATURE_LABELS.get(feat, feat),
                "directionKo": _direction_ko(val, ref_val, feat),
                "valueText": _format_value(feat, val),
                "refLabel": ref_label,
                "sharePct": round(share, 1),
                "shapValue": round(shap_i, 6),
            }
        )
    return _select_causes(causes, top_k=top_k, min_share_pct=min_share_pct)


def explain_lot_drivers(
    features: dict[str, Any],
    *,
    spc_refs: dict[str, float] | None = None,
) -> dict[str, Any]:
    cfg = load_voting_config()
    out: dict[str, Any] = {"defect_causes": [], "residual_causes": []}

    prob_cfg = cfg.get("probability") or {}
    raw_members = (
        prob_cfg.get("members")
        or (prob_cfg.get("blend") or {}).get("members")
        or []
    )
    prob_members = [
        m
        for m in raw_members
        if str(m.get("kind") or "clf_proba") in ("clf_proba", "clf_proba_cascade")
    ]
    if prob_members:
        top = _top_weight_member(prob_members)
        try:
            bundle = _load_member(Path(top["dir"]))
            out["defect_causes"] = _causes_from_shap(bundle, features, spc_refs)
            out["defect_model"] = top.get("id")
        except Exception as exc:  # noqa: BLE001
            out["defect_error"] = str(exc)[:200]

    res_members = cfg["residual_li"]["members"]
    if res_members:
        top_r = _top_weight_member(res_members)
        try:
            bundle_r = _load_member(Path(top_r["dir"]))
            out["residual_causes"] = _causes_from_shap(bundle_r, features, spc_refs)
            out["residual_model"] = top_r.get("id")
        except Exception as exc:  # noqa: BLE001
            out["residual_error"] = str(exc)[:200]

    return out


def explain_lot_from_request(body: dict[str, Any]) -> dict[str, Any]:
    features = body.get("features") or {}
    spc_refs = body.get("spc_refs") or body.get("spcRefs")
    if spc_refs and not isinstance(spc_refs, dict):
        spc_refs = None
    return explain_lot_drivers(features, spc_refs=spc_refs)
