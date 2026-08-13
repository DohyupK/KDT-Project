"""Per-LOT SHAP drivers for defect probability and residual Li voting models."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
import shap

from voting_predict import _apply_imputer, _load_member, _maybe_domain, _row_from_features, load_voting_config

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


def _direction_ko(value: float, ref: float | None, feature: str) -> str:
    if ref is None:
        return "변동"
    delta = value - ref
    if feature == "temp_dev_from_800":
        return "이탈" if abs(delta) > 1e-6 else "변동"
    if abs(delta) < 1e-6:
        return "변동"
    if delta > 0:
        if feature == "humidity":
            return "상승"
        if feature in ("lithium_input", "metal_impurity"):
            return "과다"
        if feature == "process_time":
            return "연장"
        return "상승"
    if feature == "process_time":
        return "단축"
    return "하락"


def _ref_for_feature(
    feature: str,
    _value: float,
    spc_refs: dict[str, float] | None,
) -> tuple[float | None, str | None]:
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


def _select_causes(causes: list[dict[str, Any]], *, top_k: int = 3, min_share_pct: float = 5.0) -> list[dict[str, Any]]:
    """Top 3 meaningful drivers; 4th+ only when share >= min_share_pct."""
    meaningful = [c for c in causes if float(c.get("sharePct") or 0) >= 1.0]
    if not meaningful:
        meaningful = causes[:1]
    out: list[dict[str, Any]] = []
    for c in meaningful:
        share = float(c.get("sharePct") or 0)
        if len(out) < top_k:
            out.append(c)
        elif share >= min_share_pct:
            out.append(c)
        if len(out) >= top_k + 2:
            break
    return out[: top_k + 2]


def _causes_from_shap(
    bundle: dict[str, Any],
    features: dict[str, Any],
    spc_refs: dict[str, float] | None,
    *,
    top_k: int = 3,
    min_share_pct: float = 5.0,
) -> list[dict[str, Any]]:
    meta = bundle["meta"]
    feature_columns: list[str] = meta["feature_columns"]
    numeric_cols: list[str] = meta.get("numeric_cols") or [
        c for c in feature_columns if c != "operator_id"
    ]
    df = _row_from_features(features, feature_columns)
    df = _maybe_domain(df)
    for c in feature_columns:
        if c not in df.columns:
            df = df.with_columns(pl.lit(None).alias(c))
    df = _apply_imputer(df, bundle["imputer"])
    nums = [c for c in numeric_cols if c in df.columns]
    X = df.select(nums).to_numpy().astype(np.float64)

    shap_vals = shap.TreeExplainer(bundle["xgb"]).shap_values(X)
    if isinstance(shap_vals, list):
        shap_vals = shap_vals[1] if len(shap_vals) > 1 else shap_vals[0]
    row = np.asarray(shap_vals)[0]
    abs_row = np.abs(row)
    total = float(abs_row.sum()) or 1.0

    ranked: list[tuple[str, float, float]] = []
    for i, col in enumerate(nums):
        if col not in DISPLAY_FEATURES:
            continue
        ranked.append((col, float(row[i]), float(abs_row[i])))
    ranked.sort(key=lambda x: x[2], reverse=True)

    causes: list[dict[str, Any]] = []
    for idx, (feat, _raw, ab) in enumerate(ranked):
        share = (ab / total) * 100.0
        if idx >= top_k and share < min_share_pct:
            continue
        raw_val = features.get(feat)
        if raw_val is None and feat == "temp_dev_from_800" and features.get("sintering_temp") is not None:
            raw_val = abs(float(features["sintering_temp"]) - 800.0)
        if raw_val is None:
            continue
        val = float(raw_val)
        ref_val, ref_label = _ref_for_feature(feat, val, spc_refs)
        causes.append(
            {
                "feature": feat,
                "labelKo": FEATURE_LABELS.get(feat, feat),
                "directionKo": _direction_ko(val, ref_val, feat),
                "valueText": _format_value(feat, val),
                "refLabel": ref_label,
                "sharePct": round(share, 1),
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

    prob_members = [
        m
        for m in cfg["probability"]["members"]
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
