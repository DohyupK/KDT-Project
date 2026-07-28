"""
What-if grid search on O/X predict + capacity regression.

Clips candidates to admin control bounds (Setting → Express → control_bounds.json).
If unconstrained ideal exceeds bounds, sets boundary_hit + limit_reason (compromise).

Selection: minimize defect probability first; on ties prefer higher predicted capacity.
"""

from __future__ import annotations

import copy
import os
from typing import Any

from agent.bounds_cache import clip_value, get_control_bounds
from agent.tools import RAW_FEATURE_KEYS, run_capacity_tool, run_predict_tool

METHOD = "whatif_grid"


def _parse_deltas(env_key: str, default: str) -> list[float]:
    raw = os.environ.get(env_key, default).strip()
    out: list[float] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        out.append(float(part))
    return out or [0.0]


def _clone_features(features: dict[str, Any]) -> dict[str, Any]:
    row = {k: features[k] for k in RAW_FEATURE_KEYS if k in features}
    if features.get("id") is not None:
        row["id"] = features["id"]
    if features.get("timestamp") is not None:
        row["timestamp"] = features["timestamp"]
    return row


def _limit_reason(
    ideal_hum: float,
    ideal_temp: float,
    clipped_hum: float,
    clipped_temp: float,
    bounds: dict[str, dict[str, float]],
) -> str | None:
    parts: list[str] = []
    if abs(ideal_hum - clipped_hum) > 1e-9:
        parts.append(
            f"계산된 최적 습도는 {ideal_hum:g}%이나, 장비 한계"
            f"({bounds['humidity']['min']:g}~{bounds['humidity']['max']:g}%)를 고려하여 "
            f"{clipped_hum:g}%로 조절할 것을 제안합니다"
        )
    if abs(ideal_temp - clipped_temp) > 1e-9:
        parts.append(
            f"계산된 최적 소성 온도는 {ideal_temp:g}℃이나, 장비 한계"
            f"({bounds['sintering_temp']['min']:g}~{bounds['sintering_temp']['max']:g}℃)를 "
            f"고려하여 {clipped_temp:g}℃로 조절할 것을 제안합니다"
        )
    return ". ".join(parts) + ("." if parts else "") if parts else None


def _try_capacity(features: dict[str, Any]) -> float | None:
    try:
        out = run_capacity_tool(features)
        return float(out["capacity"])
    except Exception:  # noqa: BLE001
        return None


def _is_better(
    prob: float,
    capacity: float | None,
    best_prob: float,
    best_capacity: float | None,
) -> bool:
    """True if (prob, capacity) beats current best: lower prob, then higher capacity."""
    if prob < best_prob - 1e-9:
        return True
    if abs(prob - best_prob) <= 1e-9:
        if capacity is None:
            return False
        if best_capacity is None:
            return True
        return capacity > best_capacity + 1e-9
    return False


def run_whatif(
    features: dict[str, Any],
    baseline: dict[str, Any],
    fillThreshold: float | None = None,
) -> dict[str, Any]:
    """
    Grid-search humidity / sintering_temp around the current LOT.

    Wiring: bounds from agent.bounds_cache (Setting UI → Express → JSON file).
    """
    baseline_features = _clone_features(features)
    base_prob = float(baseline["probability"])
    base_status = int(baseline["defect_status"])
    thr = float(baseline.get("applied_threshold", fillThreshold or 0.5))
    bounds = get_control_bounds()
    capacity_before = _try_capacity(baseline_features)

    payload: dict[str, Any] = {
        "method": METHOD,
        "baseline": {
            "probability": base_prob,
            "defect_status": base_status,
            "applied_threshold": thr,
            "features": baseline_features,
            "capacity": capacity_before,
        },
        "suggestion": None,
        "note": None,
    }

    if base_status == 0 and base_prob < thr:
        payload["note"] = "현재 조건은 양품 구간입니다. 공정 유지가 권장됩니다."
        return payload

    hum_deltas = _parse_deltas("WHATIF_HUMIDITY_DELTAS", "-15,-10,-5,0,5")
    temp_deltas = _parse_deltas("WHATIF_TEMP_DELTAS", "-10,-5,0,5,10")

    hum0 = float(baseline_features["humidity"])
    temp0 = float(baseline_features["sintering_temp"])

    # Best within admin bounds (clipped candidates)
    best_clipped: dict[str, Any] | None = None
    best_clipped_prob = base_prob
    best_clipped_cap: float | None = capacity_before
    # Unconstrained ideal (no admin clip) — for boundary_hit messaging
    best_ideal: dict[str, Any] | None = None
    best_ideal_prob = base_prob
    best_ideal_cap: float | None = capacity_before

    for dh in hum_deltas:
        for dt in temp_deltas:
            if dh == 0.0 and dt == 0.0:
                continue

            ideal_hum = round(hum0 + dh, 4)
            ideal_temp = round(temp0 + dt, 4)

            # Unconstrained soft floor/ceiling only to keep predict numeric-safe
            ideal_row = copy.deepcopy(baseline_features)
            ideal_row["humidity"] = max(0.0, min(100.0, ideal_hum))
            ideal_row["sintering_temp"] = max(600.0, min(1000.0, ideal_temp))

            try:
                ideal_pred = run_predict_tool(ideal_row, fillThreshold=fillThreshold)
            except Exception:  # noqa: BLE001
                ideal_pred = None

            if ideal_pred is not None:
                ip = float(ideal_pred["probability"])
                icap = _try_capacity(ideal_row)
                if _is_better(ip, icap, best_ideal_prob, best_ideal_cap):
                    best_ideal_prob = ip
                    best_ideal_cap = icap
                    best_ideal = {
                        "humidity": float(ideal_row["humidity"]),
                        "sintering_temp": float(ideal_row["sintering_temp"]),
                        "probability": ip,
                        "capacity": icap,
                    }

            clipped_hum = clip_value("humidity", ideal_hum, bounds)
            clipped_temp = clip_value("sintering_temp", ideal_temp, bounds)
            cand = copy.deepcopy(baseline_features)
            cand["humidity"] = round(clipped_hum, 4)
            cand["sintering_temp"] = round(clipped_temp, 4)

            try:
                pred = run_predict_tool(cand, fillThreshold=fillThreshold)
            except Exception:  # noqa: BLE001
                continue

            p = float(pred["probability"])
            cap = _try_capacity(cand)
            if _is_better(p, cap, best_clipped_prob, best_clipped_cap):
                best_clipped_prob = p
                best_clipped_cap = cap
                best_clipped = {
                    "cand": cand,
                    "pred": pred,
                    "capacity": cap,
                    "ideal_hum": float(ideal_row["humidity"]),
                    "ideal_temp": float(ideal_row["sintering_temp"]),
                }

    if best_clipped is None:
        payload["note"] = "탐색 범위 안에서 더 나은 조건을 찾지 못했습니다."
        return payload

    cand = best_clipped["cand"]
    pred = best_clipped["pred"]
    capacity_after = best_clipped.get("capacity")

    # Prefer ideal point's values for boundary messaging when ideal beat clipped path
    if best_ideal is not None:
        ideal_hum = float(best_ideal["humidity"])
        ideal_temp = float(best_ideal["sintering_temp"])
    else:
        ideal_hum = float(best_clipped["ideal_hum"])
        ideal_temp = float(best_clipped["ideal_temp"])

    clipped_hum = float(cand["humidity"])
    clipped_temp = float(cand["sintering_temp"])

    # If unconstrained ideal is outside admin bounds, clip that ideal and re-predict
    clipped_from_ideal_hum = clip_value("humidity", ideal_hum, bounds)
    clipped_from_ideal_temp = clip_value("sintering_temp", ideal_temp, bounds)
    boundary_hit = (
        abs(ideal_hum - clipped_from_ideal_hum) > 1e-9
        or abs(ideal_temp - clipped_from_ideal_temp) > 1e-9
    )

    if boundary_hit:
        cand = copy.deepcopy(baseline_features)
        cand["humidity"] = round(clipped_from_ideal_hum, 4)
        cand["sintering_temp"] = round(clipped_from_ideal_temp, 4)
        try:
            pred = run_predict_tool(cand, fillThreshold=fillThreshold)
            capacity_after = _try_capacity(cand)
        except Exception:  # noqa: BLE001
            pred = best_clipped["pred"]
            cand = best_clipped["cand"]
            capacity_after = best_clipped.get("capacity")
            clipped_from_ideal_hum = float(cand["humidity"])
            clipped_from_ideal_temp = float(cand["sintering_temp"])
        clipped_hum = float(cand["humidity"])
        clipped_temp = float(cand["sintering_temp"])

    reason = _limit_reason(
        ideal_hum, ideal_temp, clipped_hum, clipped_temp, bounds
    )
    boundary_hit = reason is not None

    payload["suggestion"] = {
        "deltas": {
            "humidity": round(clipped_hum - hum0, 4),
            "sintering_temp": round(clipped_temp - temp0, 4),
        },
        "after_features": cand,
        "probability": float(pred["probability"]),
        "defect_status": int(pred["defect_status"]),
        "applied_threshold": float(pred["applied_threshold"]),
        "boundary_hit": boundary_hit,
        "limit_reason": reason,
        "ideal_values": {
            "humidity": ideal_hum,
            "sintering_temp": ideal_temp,
        },
        "clipped_values": {
            "humidity": clipped_hum,
            "sintering_temp": clipped_temp,
        },
        "capacity_before": capacity_before,
        "capacity_after": capacity_after,
        "unit": "mAh/g",
    }
    payload["note"] = (
        "What-if(격자 탐색) 제안입니다. 장비 반영은 작업자 승인 후에만 로그됩니다."
        + (f" [한계치 타협] {reason}" if reason else "")
    )
    return payload
