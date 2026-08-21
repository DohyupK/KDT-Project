"""Chatbot Tools. Diagnosis via cascade voting (legacy single-head disconnected)."""

from __future__ import annotations

import json
from pathlib import Path
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

_RISK_FACTORS_CACHE: list[str] | None = None


def _load_voting_config() -> dict[str, Any]:
    path = Path("models/voting_config.json")
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as file:
            raw = json.load(file)
        return raw if isinstance(raw, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def global_risk_factors(limit: int = 4) -> list[str]:
    """Weighted global SHAP factors for the voting classifiers (not row-level SHAP)."""
    global _RISK_FACTORS_CACHE
    if _RISK_FACTORS_CACHE is not None:
        return _RISK_FACTORS_CACHE[:limit]

    cfg = _load_voting_config()
    members = (((cfg.get("probability") or {}).get("blend") or {}).get("members") or [])
    scores: dict[str, float] = {}
    for member in members:
        if not isinstance(member, dict):
            continue
        weight = float(member.get("weight") or 1.0)
        member_dir = Path(str(member.get("dir") or ""))
        docs: list[list[dict[str, Any]]] = []
        for name in ("shap_xgb_importance.json", "shap_cat_importance.json"):
            path = member_dir / name
            if not path.exists():
                continue
            try:
                with open(path, encoding="utf-8") as file:
                    raw = json.load(file)
                if isinstance(raw, list):
                    docs.append([row for row in raw if isinstance(row, dict)])
            except (OSError, ValueError, TypeError):
                continue
        for rows in docs:
            total = sum(max(0.0, float(row.get("importance") or 0.0)) for row in rows)
            if total <= 0:
                continue
            file_weight = weight / max(1, len(docs))
            for row in rows:
                feature = str(row.get("feature") or "").strip()
                importance = max(0.0, float(row.get("importance") or 0.0))
                if feature and importance > 0:
                    scores[feature] = scores.get(feature, 0.0) + file_weight * importance / total

    _RISK_FACTORS_CACHE = [
        feature for feature, _score in sorted(scores.items(), key=lambda item: -item[1])
    ][:10]
    return _RISK_FACTORS_CACHE[:limit]


def _explain_voting(voted: dict[str, Any]) -> dict[str, Any]:
    cfg = _load_voting_config()
    probability_cfg = cfg.get("probability") or {}
    rule = probability_cfg.get("defect_rule") or {}
    scores = voted.get("member_scores") or {}
    blend = float(voted.get("p_blend", voted.get("probability", 0.0)))
    symbolic = scores.get("p_symbolic")
    blend_threshold = float(rule.get("blend_threshold", voted.get("applied_threshold") or 0.55))
    symbolic_threshold = float(rule.get("symbolic_threshold", 0.08094146666984328))
    triggered_by: list[str] = []
    if blend >= blend_threshold:
        triggered_by.append("blend")
    if symbolic is not None and float(symbolic) >= symbolic_threshold:
        triggered_by.append("symbolic")

    holdout = cfg.get("holdout")
    folds = cfg.get("n_folds")
    validation_notice = None
    if str(holdout or "").strip().lower() in {"", "none", "null"}:
        validation_notice = (
            f"최종 독립 holdout 없이 {folds or '교차'}-fold 교차검증 중심으로 구성된 모델입니다."
        )

    enriched = dict(voted)
    enriched["top_risk_factors"] = global_risk_factors()
    enriched["risk_factor_scope"] = "global_shap_importance"
    enriched["decision_basis"] = {
        "rule": str(rule.get("type") or "OR"),
        "displayed_probability": "blend",
        "blend_probability": blend,
        "blend_threshold": blend_threshold,
        "symbolic_score": float(symbolic) if symbolic is not None else None,
        "symbolic_threshold": symbolic_threshold,
        "triggered_by": triggered_by,
    }
    enriched["validation_notice"] = validation_notice
    return enriched


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
    return _explain_voting(
        predict_voting(
            _row_from_features(features),
            fill_threshold=float(fillThreshold) if fillThreshold is not None else None,
        )
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
        "top_risk_factors": voted.get("top_risk_factors") or [],
        "risk_factor_scope": voted.get("risk_factor_scope"),
        "decision_basis": voted.get("decision_basis"),
        "validation_notice": voted.get("validation_notice"),
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
