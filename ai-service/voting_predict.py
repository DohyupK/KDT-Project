"""
Cascade voting inference for judgment_lots-like fields.

CWD: ai-service/
Schedule within each stage: *_d50 || *_d90 (parallel), then *_feature, then remaining.
Stages: capacity → residual_li → probability → quality_defect (threshold last).
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
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
_DEFAULT_THRESHOLD = 0.4


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


def _resolve_task(meta: dict[str, Any]) -> str:
    task = meta.get("task")
    if task == "classification":
        return "classification"
    if isinstance(task, str) and "regress" in task.lower():
        return "regression"
    # legacy single-head clf (models/legacy) may omit task
    if meta.get("target") in ("quality_defect", "defect"):
        return "classification"
    return "regression"


def _load_member(dir_path: Path) -> dict[str, Any]:
    key = str(dir_path.resolve())
    if key in _cache:
        return _cache[key]
    with open(dir_path / "metadata.json", encoding="utf-8") as f:
        meta = json.load(f)
    task = _resolve_task(meta)
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
    for k, v in features.items():
        if k not in row:
            row[k] = v
    return pl.DataFrame([row])


def _apply_imputer(df: pl.DataFrame, imputer: dict[str, Any]) -> pl.DataFrame:
    means: dict[str, float] = imputer.get("numeric_means") or imputer.get("numeric") or {}
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
    for c in feature_columns:
        if c not in df.columns:
            df = df.with_columns(pl.lit(None).alias(c))
    df = _apply_imputer(df, bundle["imputer"])
    df = df.select([c for c in feature_columns if c in df.columns])

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


def _split_d50_d90_rest(
    members: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    d50: list[dict[str, Any]] = []
    d90: list[dict[str, Any]] = []
    rest: list[dict[str, Any]] = []
    for m in members:
        mid = str(m.get("id", ""))
        if mid.endswith("_d50") or mid == "d50":
            d50.append(m)
        elif mid.endswith("_d90") or mid == "d90":
            d90.append(m)
        else:
            rest.append(m)
    return d50, d90, rest


def _score_member(
    m: dict[str, Any],
    features: dict[str, Any],
    *,
    kind: str | None = None,
    caution: float = 3000.0,
    usl: float = 4000.0,
) -> tuple[str, float, float]:
    """Returns (id, weight, value)."""
    mid = str(m["id"])
    w = float(m["weight"])
    k = kind or m.get("kind") or "raw"
    if k == "clf_proba" or k == "clf_proba_cascade" or k == "raw":
        val = _predict_member(m["dir"], features)
    elif k == "residual_score":
        r = _predict_member(m["dir"], features)
        val = residual_to_score(r, caution=caution, usl=usl)
    else:
        raise ValueError(f"Unknown kind: {k}")
    return mid, w, float(val)


def _weighted_avg_scheduled(
    members: list[dict[str, Any]],
    features: dict[str, Any],
    *,
    kind_default: str = "raw",
    caution: float = 3000.0,
    usl: float = 4000.0,
    detail: dict[str, float] | None = None,
) -> float:
    """
    Parallel: all *_d50 with all *_d90.
    Then sequential: remaining in config order (feature first typically).
    """
    d50, d90, rest = _split_d50_d90_rest(members)
    scores: dict[str, tuple[float, float]] = {}

    parallel = d50 + d90
    if len(parallel) >= 2:
        with ThreadPoolExecutor(max_workers=min(4, len(parallel))) as ex:
            futs = {
                ex.submit(
                    _score_member,
                    m,
                    features,
                    kind=m.get("kind") or kind_default,
                    caution=caution,
                    usl=usl,
                ): m
                for m in parallel
            }
            for fut in as_completed(futs):
                mid, w, val = fut.result()
                scores[mid] = (w, val)
                if detail is not None:
                    detail[mid] = val
    else:
        for m in parallel:
            mid, w, val = _score_member(
                m,
                features,
                kind=m.get("kind") or kind_default,
                caution=caution,
                usl=usl,
            )
            scores[mid] = (w, val)
            if detail is not None:
                detail[mid] = val

    # feature and later members: keep config order among rest
    for m in rest:
        mid, w, val = _score_member(
            m,
            features,
            kind=m.get("kind") or kind_default,
            caution=caution,
            usl=usl,
        )
        scores[mid] = (w, val)
        if detail is not None:
            detail[mid] = val

    num = 0.0
    den = 0.0
    for mid, (w, val) in scores.items():
        num += w * val
        den += w
    return num / den if den else 0.0


def eval_symbolic_equation(equation: str, values: dict[str, float]) -> float:
    env: dict[str, Any] = {
        "abs": np.abs,
        "sqrt": np.sqrt,
        "log": np.log,
        "log10": np.log10,
        "exp": np.exp,
        "sin": np.sin,
        "cos": np.cos,
        "tanh": np.tanh,
        "square": lambda x: np.square(x),
        "cube": lambda x: np.power(x, 3),
        "sign": np.sign,
        "maximum": np.maximum,
        "minimum": np.minimum,
        "clip": np.clip,
        "where": np.where,
        "np": np,
    }
    for k, v in values.items():
        env[k] = float(v)
    out = eval(equation, {"__builtins__": {}}, env)  # noqa: S307
    val = float(np.asarray(out, dtype=np.float64).reshape(-1)[0])
    return 0.0 if not np.isfinite(val) else val


def _predict_blend_or_symbolic(
    features: dict[str, Any],
    capacity: float,
    residual_li: float,
    cfg_prob: dict[str, Any],
    detail: dict[str, float],
) -> tuple[float, int, float]:
    """
    Returns (probability_store, quality_defect, blend_score).
    Defect: (blend ≥ thr) OR (symbolic ≥ thr).
    """
    blend_cfg = cfg_prob.get("blend") or {}
    members = list(blend_cfg.get("members") or [])
    scores: dict[str, float] = {}
    num = 0.0
    den = 0.0
    for m in members:
        mid, w, val = _score_member(m, features, kind=m.get("kind") or "clf_proba")
        scores[mid] = val
        detail[mid] = val
        num += w * val
        den += w
    blend = num / den if den else 0.0
    detail["p_blend"] = float(blend)

    p_clf_d90 = float(scores.get("clf_d90", 0.0))
    p_legacy_clf = float(scores.get("legacy_clf", 0.0))
    # avoid div-by-zero in symbolic
    if p_legacy_clf <= 0.0:
        p_legacy_clf = 1e-12

    sym_cfg = cfg_prob.get("symbolic") or {}
    eq_path = Path(str(sym_cfg.get("equation_path") or "models/symbolic_model/equation.json"))
    with open(eq_path, encoding="utf-8") as f:
        eq_doc = json.load(f)
    equation = str(eq_doc.get("equation") or "")
    rule = cfg_prob.get("defect_rule") or {}
    blend_thr = float(rule.get("blend_threshold", 0.55))
    sym_thr = float(
        rule.get("symbolic_threshold", eq_doc.get("default_threshold", 0.08094146666984328))
    )
    p_sym = eval_symbolic_equation(
        equation,
        {
            "p_clf_d90": p_clf_d90,
            "p_legacy_clf": p_legacy_clf,
            "capacity": float(capacity),
            "residual_li": float(residual_li),
        },
    )
    detail["p_symbolic"] = float(p_sym)

    quality_defect = 1 if (blend >= blend_thr or p_sym >= sym_thr) else 0
    store = cfg_prob.get("store_probability") or {}
    if str(store.get("mode") or "blend") == "hard_ox":
        pos = float(store.get("pos", 0.9))
        neg = float(store.get("neg", 0.1))
        probability = pos if quality_defect else neg
    else:
        probability = float(blend)
    return probability, quality_defect, blend


def predict_voting(
    features: dict[str, Any],
    fill_threshold: float | None = None,
) -> dict[str, Any]:
    """
    capacity → residual_li → probability → quality_defect (last).
    """
    cfg = load_voting_config()
    detail: dict[str, float] = {}

    capacity = _weighted_avg_scheduled(
        cfg["capacity"]["members"],
        features,
        kind_default="raw",
        detail=detail,
    )
    residual_li = _weighted_avg_scheduled(
        cfg["residual_li"]["members"],
        features,
        kind_default="raw",
        detail=detail,
    )

    std = cfg.get("standard_residual", {})
    caution = float(std.get("caution", 3000))
    usl = float(std.get("usl_spare", 4000))
    cascade = {**features, "capacity": capacity, "residual_li": residual_li}

    cfg_prob = cfg.get("probability") or {}
    mode = str(cfg_prob.get("mode") or "weighted")

    if mode == "blend_or_symbolic":
        probability, quality_defect, blend = _predict_blend_or_symbolic(
            features, capacity, residual_li, cfg_prob, detail
        )
        thr_f = float((cfg_prob.get("defect_rule") or {}).get("blend_threshold", 0.55))
        den = float((cfg_prob.get("blend") or {}).get("denominator") or 10.0)
        return {
            "capacity": float(capacity),
            "residual_li": float(residual_li),
            "probability": float(probability),
            "quality_defect": int(quality_defect),
            "applied_threshold": thr_f,
            "p_blend": float(blend),
            "unit_capacity": "mAh/g",
            "unit_residual": "ppm",
            "probability_denominator": den,
            "member_scores": detail,
        }

    # classic weighted probability members
    prob_members = cfg_prob["members"]
    d50, d90, rest = _split_d50_d90_rest(prob_members)
    scores: dict[str, tuple[float, float]] = {}

    def _run_prob(m: dict[str, Any]) -> tuple[str, float, float]:
        kind = str(m.get("kind") or "clf_proba")
        feats = cascade if kind == "clf_proba_cascade" else features
        return _score_member(m, feats, kind=kind, caution=caution, usl=usl)

    parallel = d50 + d90
    if len(parallel) >= 2:
        with ThreadPoolExecutor(max_workers=min(4, len(parallel))) as ex:
            futs = [ex.submit(_run_prob, m) for m in parallel]
            for fut in as_completed(futs):
                mid, w, val = fut.result()
                scores[mid] = (w, val)
                detail[mid] = val
    else:
        for m in parallel:
            mid, w, val = _run_prob(m)
            scores[mid] = (w, val)
            detail[mid] = val

    for m in rest:
        mid, w, val = _run_prob(m)
        scores[mid] = (w, val)
        detail[mid] = val

    num = sum(w * v for w, v in scores.values())
    den = sum(w for w, _ in scores.values())
    probability = num / den if den else 0.0

    thr_cfg = cfg.get("threshold") or {}
    thr = fill_threshold
    if thr is None:
        thr = thr_cfg.get("default_threshold")
    if thr is None:
        thr = _DEFAULT_THRESHOLD
    thr_f = float(thr)
    quality_defect = 1 if probability >= thr_f else 0

    return {
        "capacity": float(capacity),
        "residual_li": float(residual_li),
        "probability": float(probability),
        "quality_defect": int(quality_defect),
        "applied_threshold": thr_f,
        "unit_capacity": "mAh/g",
        "unit_residual": "ppm",
        "probability_denominator": float(den),
        "member_scores": detail,
    }
