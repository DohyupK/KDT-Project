"""
What-if grid search on existing O/X predict (Cold start; no reg.csv).

Explores humidity + sintering_temp deltas and picks the lowest defect probability.
"""

from __future__ import annotations

import copy
import os
from typing import Any

from agent.tools import RAW_FEATURE_KEYS, run_predict_tool

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


def run_whatif(
    features: dict[str, Any],
    baseline: dict[str, Any],
    fillThreshold: float | None = None,
) -> dict[str, Any]:
    """
    Grid-search humidity / sintering_temp around the current LOT.

    Returns structured recommendation for FE Approve + compose.
    suggestion is null when already OK or no improving candidate.
    """
    baseline_features = _clone_features(features)
    base_prob = float(baseline["probability"])
    base_status = int(baseline["defect_status"])
    thr = float(baseline.get("applied_threshold", fillThreshold or 0.5))

    payload: dict[str, Any] = {
        "method": METHOD,
        "baseline": {
            "probability": base_prob,
            "defect_status": base_status,
            "applied_threshold": thr,
            "features": baseline_features,
        },
        "suggestion": None,
        "note": None,
    }

    # Healthy LOT: no remediation proposal
    if base_status == 0 and base_prob < thr:
        payload["note"] = "현재 조건은 양품 구간입니다. 공정 유지가 권장됩니다."
        return payload

    hum_deltas = _parse_deltas("WHATIF_HUMIDITY_DELTAS", "-15,-10,-5,0,5")
    temp_deltas = _parse_deltas("WHATIF_TEMP_DELTAS", "-10,-5,0,5,10")

    hum0 = float(baseline_features["humidity"])
    temp0 = float(baseline_features["sintering_temp"])

    best: dict[str, Any] | None = None
    best_prob = base_prob

    for dh in hum_deltas:
        for dt in temp_deltas:
            if dh == 0.0 and dt == 0.0:
                continue
            cand = copy.deepcopy(baseline_features)
            cand["humidity"] = round(hum0 + dh, 4)
            cand["sintering_temp"] = round(temp0 + dt, 4)
            # Soft physical bounds (Cold start)
            cand["humidity"] = max(5.0, min(95.0, float(cand["humidity"])))
            cand["sintering_temp"] = max(700.0, min(900.0, float(cand["sintering_temp"])))

            try:
                pred = run_predict_tool(cand, fillThreshold=fillThreshold)
            except Exception:  # noqa: BLE001
                continue

            p = float(pred["probability"])
            if p < best_prob - 1e-9:
                best_prob = p
                best = {
                    "deltas": {
                        "humidity": round(float(cand["humidity"]) - hum0, 4),
                        "sintering_temp": round(float(cand["sintering_temp"]) - temp0, 4),
                    },
                    "after_features": cand,
                    "probability": p,
                    "defect_status": int(pred["defect_status"]),
                    "applied_threshold": float(pred["applied_threshold"]),
                }

    if best is None:
        payload["note"] = "탐색 범위 안에서 더 나은 조건을 찾지 못했습니다."
        return payload

    payload["suggestion"] = best
    payload["note"] = (
        "What-if(격자 탐색) 제안입니다. 장비 반영은 작업자 승인 후에만 로그됩니다."
    )
    return payload
