"""
1단계 O/X 진단 판독기: train_model() + predict(df, fillThreshold=0.5)

CWD: ai-service/
Production upgrades: file logging, GC, metadata versioning, TimeSeriesSplit,
expanded Optuna space, cost-based threshold, schema-drift guard, SHAP JSON.
"""

from __future__ import annotations

import gc
import hashlib
import json
import logging
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import optuna
import polars as pl
import shap
import xgboost as xgb
from catboost import CatBoostClassifier, Pool
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import OrdinalEncoder

SEED = 42
MODEL_VERSION = "1.2.0"
OPTUNA_TRIALS = int(os.environ.get("OPTUNA_TRIALS", "100"))
N_FOLDS = 6
DATA_PATH = Path("data/cathode_clf_data.csv")
MODELS_DIR = Path("models")
LOGS_DIR = Path("logs")
OPTUNA_DB = "sqlite:///optuna.db"
OPTIMAL_SINTERING_TEMP = 800.0

ID_COL = "id"
TS_COL = "timestamp"
CAT_COL = "operator_id"
TARGET_COL = "quality_defect"
CAT_FEATURES = [CAT_COL]
CAT_FILL = "__MISSING__"
DROP_COLS = {ID_COL, TS_COL}
FN_COST_WEIGHT = 10.0

# EDA-derived process thresholds (diagnostic reference; not remediation advice)
DOMAIN_THRESHOLDS: dict[str, Any] = {
    "sintering_temp": {
        "type": "bipolar",
        "optimal": OPTIMAL_SINTERING_TEMP,
        "bands": [
            {"defect_rate_pct": 5, "low_max": 773.3, "high_min": 818.1},
            {"defect_rate_pct": 10, "low_max": 760.9, "high_min": 825.7},
            {"defect_rate_pct": 15, "low_max": 757.2, "high_min": 834.6},
            {"defect_rate_pct": 20, "low_max": 748.5, "high_min": 837.8},
            {"defect_rate_pct": 25, "low_max": None, "high_min": 846.9},
            {"defect_rate_pct": 30, "low_max": None, "high_min": 846.9},
            {"defect_rate_pct": 35, "low_max": 742.7, "high_min": 848.6},
            {"defect_rate_pct": 40, "low_max": None, "high_min": 856.9},
        ],
    },
    "humidity": {
        "type": "unidirectional_high",
        "bands": [
            {"defect_rate_pct": 5, "min": 48.74},
            {"defect_rate_pct": 10, "min": 53.05},
            {"defect_rate_pct": 15, "min": 57.98},
            {"defect_rate_pct": 20, "min": 62.80},
            {"defect_rate_pct": 25, "min": 63.92},
            {"defect_rate_pct": 30, "min": 66.59},
            {"defect_rate_pct": 35, "min": 66.59},
            {"defect_rate_pct": 40, "min": 67.90},
        ],
    },
    "metal_impurity": {
        "type": "unidirectional_high",
        "bands": [
            {"defect_rate_pct": 5, "min": 0.0252},
            {"defect_rate_pct": 10, "min": 0.0278},
            {"defect_rate_pct": 15, "min": 0.0305},
            {"defect_rate_pct": 20, "min": 0.0337},
            {"defect_rate_pct": 25, "min": 0.0344},
            {"defect_rate_pct": 30, "min": 0.0350},
            {"defect_rate_pct": 35, "min": 0.0368},
            {"defect_rate_pct": 40, "min": 0.0378},
            {"defect_rate_pct": 45, "min": 0.0378},
            {"defect_rate_pct": 50, "min": 0.0398},
        ],
    },
    "lithium_input": {
        "type": "unidirectional_high_weak",
        "note": "Alone never exceeds ~20% defect rate in EDA",
        "bands": [
            {"defect_rate_pct": 5, "min": 1.40},
            {"defect_rate_pct": 10, "min": 3.04},
            {"defect_rate_pct": 15, "min": 3.47},
        ],
    },
}

# Lazy global cache (predict)
_xgb_model: xgb.XGBClassifier | None = None
_cat_model: CatBoostClassifier | None = None
_encoder: OrdinalEncoder | None = None
_imputer: dict[str, Any] | None = None
_ensemble_config: dict[str, Any] | None = None
_metadata: dict[str, Any] | None = None
_top_risk_factors: list[str] | None = None

logger = logging.getLogger(__name__)


def setup_logging() -> None:
    """Console + persistent file log under logs/train.log."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / "train.log"
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

    # Avoid duplicate handlers on repeated imports / re-runs
    root.handlers.clear()

    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    root.addHandler(sh)

    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(fmt)
    root.addHandler(fh)


setup_logging()


def _set_global_seed(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)


def _ensure_models_dir() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def build_feature_types(df: pl.DataFrame, feature_columns: list[str]) -> dict[str, str]:
    return {col: str(df.schema[col]) for col in feature_columns}


def detect_device_mode() -> str:
    if os.environ.get("USE_GPU", "1") == "0":
        logger.info("USE_GPU=0 → device_mode=cpu")
        return "cpu"
    try:
        X = np.array([[0.0], [1.0]], dtype=np.float32)
        y = np.array([0, 1])
        clf = xgb.XGBClassifier(
            n_estimators=1,
            max_depth=1,
            tree_method="hist",
            device="cuda",
            verbosity=0,
        )
        clf.fit(X, y)
        logger.info("GPU probe OK → device_mode=cuda")
        return "cuda"
    except Exception as exc:  # noqa: BLE001
        logger.warning("GPU unavailable (%s) → device_mode=cpu", exc)
        return "cpu"


def load_raw_csv(path: Path = DATA_PATH) -> pl.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path.resolve()}")
    return pl.read_csv(path)


def validate_schema(df: pl.DataFrame) -> None:
    required = {ID_COL, TS_COL, CAT_COL, TARGET_COL}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    target_vals = set(df[TARGET_COL].drop_nulls().unique().to_list())
    if not target_vals.issubset({0, 1}):
        raise ValueError(
            f"{TARGET_COL} must be {{0,1}} only; got {sorted(target_vals)}. "
            "String target mapping is forbidden."
        )

    numeric_cols = [
        c for c in df.columns if c not in {ID_COL, TS_COL, CAT_COL, TARGET_COL}
    ]
    if not numeric_cols:
        raise ValueError("At least one numeric feature column is required")

    if df.height < 50:
        logger.warning("Row count %s < 50; TimeSeriesSplit/Optuna may fail", df.height)


def add_domain_features(df: pl.DataFrame) -> pl.DataFrame:
    """
    EDA-informed engineered features (keep all raw columns; do not drop weak ones).
    Flags use key defect-rate band thresholds from process analysis.
    """
    required = {"sintering_temp", "humidity", "metal_impurity", "d50", "d90", "lithium_input"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Cannot engineer domain features; missing {sorted(missing)}")

    return df.with_columns(
        [
            (pl.col("sintering_temp") - OPTIMAL_SINTERING_TEMP)
            .abs()
            .alias("temp_dev_from_800"),
            ((pl.col("sintering_temp") - OPTIMAL_SINTERING_TEMP) ** 2).alias(
                "temp_dev_from_800_sq"
            ),
            (pl.col("d90") - pl.col("d50")).alias("particle_span"),
            (pl.col("sintering_temp") * pl.col("humidity")).alias("temp_x_humidity"),
            (pl.col("sintering_temp") <= 773.3)
            .cast(pl.Float64)
            .alias("flag_temp_low_ge5pct"),
            (pl.col("sintering_temp") >= 818.1)
            .cast(pl.Float64)
            .alias("flag_temp_high_ge5pct"),
            (pl.col("sintering_temp") <= 748.5)
            .cast(pl.Float64)
            .alias("flag_temp_low_ge20pct"),
            (pl.col("sintering_temp") >= 837.8)
            .cast(pl.Float64)
            .alias("flag_temp_high_ge20pct"),
            (pl.col("sintering_temp") >= 846.9)
            .cast(pl.Float64)
            .alias("flag_temp_high_ge25pct"),
            (pl.col("humidity") >= 48.74).cast(pl.Float64).alias("flag_humidity_ge5pct"),
            (pl.col("humidity") >= 53.05).cast(pl.Float64).alias("flag_humidity_ge10pct"),
            (pl.col("humidity") >= 62.80).cast(pl.Float64).alias("flag_humidity_ge20pct"),
            (pl.col("humidity") >= 66.59).cast(pl.Float64).alias("flag_humidity_ge30pct"),
            (pl.col("metal_impurity") >= 0.0252)
            .cast(pl.Float64)
            .alias("flag_metal_ge5pct"),
            (pl.col("metal_impurity") >= 0.0278)
            .cast(pl.Float64)
            .alias("flag_metal_ge10pct"),
            (pl.col("metal_impurity") >= 0.0337)
            .cast(pl.Float64)
            .alias("flag_metal_ge20pct"),
            (pl.col("metal_impurity") >= 0.0378)
            .cast(pl.Float64)
            .alias("flag_metal_ge40pct"),
            (pl.col("lithium_input") >= 3.04)
            .cast(pl.Float64)
            .alias("flag_lithium_ge10pct"),
            (
                (pl.col("humidity") >= 60.0)
                & (
                    (pl.col("sintering_temp") <= 755.0)
                    | (pl.col("sintering_temp") >= 845.0)
                )
            )
            .cast(pl.Float64)
            .alias("flag_temp_humidity_danger_zone"),
        ]
    )


def prepare_feature_frame(df: pl.DataFrame) -> tuple[pl.DataFrame, list[str], list[str]]:
    """Drop id/timestamp; cast numerics to Float64; operator_id to String; add domain feats."""
    work = df.drop([c for c in DROP_COLS if c in df.columns])
    base_numeric = [c for c in work.columns if c not in {CAT_COL, TARGET_COL}]
    cast_exprs: list[pl.Expr] = []
    for col in base_numeric:
        cast_exprs.append(pl.col(col).cast(pl.Float64, strict=False).alias(col))
    cast_exprs.append(pl.col(CAT_COL).cast(pl.Utf8).alias(CAT_COL))
    if TARGET_COL in work.columns:
        cast_exprs.append(pl.col(TARGET_COL).cast(pl.Int64).alias(TARGET_COL))
    work = work.with_columns(cast_exprs)
    work = add_domain_features(work)

    numeric_cols = [c for c in work.columns if c not in {CAT_COL, TARGET_COL}]
    feature_columns = numeric_cols + [CAT_COL]
    return work, feature_columns, numeric_cols


def fit_imputer(train_df: pl.DataFrame, numeric_cols: list[str]) -> dict[str, Any]:
    numeric_means: dict[str, float] = {}
    for col in numeric_cols:
        mean_val = train_df[col].mean()
        if mean_val is None or (isinstance(mean_val, float) and np.isnan(mean_val)):
            numeric_means[col] = 0.0
        else:
            numeric_means[col] = float(mean_val)
    return {
        "numeric": numeric_means,
        "categorical_fill": {CAT_COL: CAT_FILL},
    }


def apply_imputer(df: pl.DataFrame, imputer: dict[str, Any]) -> pl.DataFrame:
    exprs: list[pl.Expr] = []
    for col, mean_val in imputer["numeric"].items():
        if col in df.columns:
            exprs.append(pl.col(col).fill_null(mean_val).alias(col))
    fill = imputer["categorical_fill"][CAT_COL]
    if CAT_COL in df.columns:
        exprs.append(
            pl.when(pl.col(CAT_COL).is_null() | (pl.col(CAT_COL).str.strip_chars() == ""))
            .then(pl.lit(fill))
            .otherwise(pl.col(CAT_COL))
            .alias(CAT_COL)
        )
    return df.with_columns(exprs) if exprs else df


def find_constant_features(train_df: pl.DataFrame, numeric_cols: list[str]) -> list[str]:
    constants: list[str] = []
    for col in numeric_cols:
        std = train_df[col].std()
        if std is None or float(std) == 0.0:
            constants.append(col)
    return constants


def _operator_series_to_2d(df: pl.DataFrame) -> np.ndarray:
    return df.select(CAT_COL).to_numpy().astype(object).reshape(-1, 1)


def fit_encoder(train_df: pl.DataFrame) -> OrdinalEncoder:
    enc = OrdinalEncoder(
        handle_unknown="use_encoded_value",
        unknown_value=-1,
        dtype=np.float64,
    )
    enc.fit(_operator_series_to_2d(train_df))
    return enc


def build_xgb_matrix(
    df: pl.DataFrame,
    numeric_cols: list[str],
    encoder: OrdinalEncoder,
) -> np.ndarray:
    num = df.select(numeric_cols).to_numpy().astype(np.float64)
    cat = encoder.transform(_operator_series_to_2d(df)).astype(np.float64)
    return np.hstack([num, cat])


def build_cat_pool(
    df: pl.DataFrame,
    feature_columns: list[str],
    y: np.ndarray | None = None,
) -> Pool:
    # CatBoost Pool without pandas: data as list of lists; cat by name
    data = df.select(feature_columns).rows()
    return Pool(
        data=data,
        label=y,
        cat_features=CAT_FEATURES,
        feature_names=feature_columns,
    )


def _xgb_params(
    trial: optuna.Trial,
    base_scale_pos_weight: float,
    device_mode: str,
) -> dict[str, Any]:
    lo = float(base_scale_pos_weight) * 0.8
    hi = float(base_scale_pos_weight) * 1.2
    return {
        "max_depth": trial.suggest_int("max_depth", 3, 10),
        "learning_rate": trial.suggest_float("learning_rate", 1e-3, 0.3, log=True),
        "n_estimators": trial.suggest_int("n_estimators", 100, 800),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "min_child_weight": trial.suggest_float("min_child_weight", 1.0, 10.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True),
        "gamma": trial.suggest_float("gamma", 0.0, 5.0),
        "scale_pos_weight": trial.suggest_float("scale_pos_weight", lo, hi),
        "objective": "binary:logistic",
        "eval_metric": "auc",
        "tree_method": "hist",
        "device": "cuda" if device_mode == "cuda" else "cpu",
        "random_state": SEED,
        "n_jobs": 1 if device_mode == "cuda" else -1,
        "verbosity": 0,
    }


def _cat_params(
    trial: optuna.Trial,
    scale_pos_weight: float,
    device_mode: str,
) -> dict[str, Any]:
    return {
        "depth": trial.suggest_int("depth", 4, 10),
        "learning_rate": trial.suggest_float("learning_rate", 1e-3, 0.3, log=True),
        "iterations": trial.suggest_int("iterations", 100, 800),
        "l2_leaf_reg": trial.suggest_float("l2_leaf_reg", 1.0, 10.0),
        "random_strength": trial.suggest_float("random_strength", 0.0, 2.0),
        "bagging_temperature": trial.suggest_float("bagging_temperature", 0.0, 1.0),
        "border_count": trial.suggest_int("border_count", 32, 255),
        "loss_function": "Logloss",
        "eval_metric": "AUC",
        "task_type": "GPU" if device_mode == "cuda" else "CPU",
        "scale_pos_weight": scale_pos_weight,
        "random_seed": SEED,
        "verbose": False,
        "allow_writing_files": False,
    }


def tune_xgboost(
    X: np.ndarray,
    y: np.ndarray,
    base_scale_pos_weight: float,
    device_mode: str,
) -> dict[str, Any]:
    sampler = optuna.samplers.TPESampler(seed=SEED)
    study = optuna.create_study(
        study_name="xgb_ox_clf_v1_2_0",
        direction="maximize",
        storage=OPTUNA_DB,
        load_if_exists=True,
        sampler=sampler,
    )

    def objective(trial: optuna.Trial) -> float:
        params = _xgb_params(trial, base_scale_pos_weight, device_mode)
        tscv = TimeSeriesSplit(n_splits=N_FOLDS)
        scores: list[float] = []
        try:
            for tr_idx, va_idx in tscv.split(X):
                if len(np.unique(y[tr_idx])) < 2 or len(np.unique(y[va_idx])) < 2:
                    continue
                model = xgb.XGBClassifier(**params)
                model.fit(
                    X[tr_idx],
                    y[tr_idx],
                    eval_set=[(X[va_idx], y[va_idx])],
                    verbose=False,
                )
                proba = model.predict_proba(X[va_idx])[:, 1]
                scores.append(float(roc_auc_score(y[va_idx], proba)))
            if not scores:
                return 0.0
            return float(np.mean(scores))
        finally:
            gc.collect()

    remaining = max(0, OPTUNA_TRIALS - len(study.trials))
    logger.info("XGBoost Optuna: %s trials to run (resume-aware)", remaining)
    if remaining > 0:
        study.optimize(objective, n_trials=remaining, show_progress_bar=False)
    return dict(study.best_params)


def tune_catboost(
    train_df: pl.DataFrame,
    feature_columns: list[str],
    y: np.ndarray,
    scale_pos_weight: float,
    device_mode: str,
) -> dict[str, Any]:
    sampler = optuna.samplers.TPESampler(seed=SEED)
    study = optuna.create_study(
        study_name="cat_ox_clf_v1_2_0",
        direction="maximize",
        storage=OPTUNA_DB,
        load_if_exists=True,
        sampler=sampler,
    )

    def objective(trial: optuna.Trial) -> float:
        params = _cat_params(trial, scale_pos_weight, device_mode)
        tscv = TimeSeriesSplit(n_splits=N_FOLDS)
        scores: list[float] = []
        indices = np.arange(len(y))
        try:
            for tr_idx, va_idx in tscv.split(indices):
                if len(np.unique(y[tr_idx])) < 2 or len(np.unique(y[va_idx])) < 2:
                    continue
                tr_df = train_df[tr_idx.tolist()]
                va_df = train_df[va_idx.tolist()]
                train_pool = build_cat_pool(tr_df, feature_columns, y[tr_idx])
                valid_pool = build_cat_pool(va_df, feature_columns, y[va_idx])
                model = CatBoostClassifier(**params)
                model.fit(train_pool, eval_set=valid_pool, use_best_model=True)
                proba = model.predict_proba(valid_pool)[:, 1]
                scores.append(float(roc_auc_score(y[va_idx], proba)))
            if not scores:
                return 0.0
            return float(np.mean(scores))
        finally:
            gc.collect()

    remaining = max(0, OPTUNA_TRIALS - len(study.trials))
    logger.info("CatBoost Optuna: %s trials to run (resume-aware)", remaining)
    if remaining > 0:
        study.optimize(objective, n_trials=remaining, show_progress_bar=False)
    return dict(study.best_params)


def refit_xgboost(
    X: np.ndarray,
    y: np.ndarray,
    best_params: dict[str, Any],
    fallback_scale_pos_weight: float,
    device_mode: str,
) -> xgb.XGBClassifier:
    params = {
        **best_params,
        "objective": "binary:logistic",
        "eval_metric": "auc",
        "tree_method": "hist",
        "device": "cuda" if device_mode == "cuda" else "cpu",
        "random_state": SEED,
        "n_jobs": 1 if device_mode == "cuda" else -1,
        "verbosity": 0,
    }
    if "scale_pos_weight" not in params:
        params["scale_pos_weight"] = fallback_scale_pos_weight
    model = xgb.XGBClassifier(**params)
    model.fit(X, y)
    return model


def refit_catboost(
    train_df: pl.DataFrame,
    feature_columns: list[str],
    y: np.ndarray,
    best_params: dict[str, Any],
    scale_pos_weight: float,
    device_mode: str,
) -> CatBoostClassifier:
    params = {
        **best_params,
        "loss_function": "Logloss",
        "eval_metric": "AUC",
        "task_type": "GPU" if device_mode == "cuda" else "CPU",
        "scale_pos_weight": scale_pos_weight,
        "random_seed": SEED,
        "verbose": False,
        "allow_writing_files": False,
    }
    model = CatBoostClassifier(**params)
    model.fit(build_cat_pool(train_df, feature_columns, y))
    return model


def ensemble_proba(p_xgb: np.ndarray, p_cat: np.ndarray) -> np.ndarray:
    return 0.5 * p_xgb + 0.5 * p_cat


def find_best_threshold(
    y_true: np.ndarray,
    proba: np.ndarray,
    fn_weight: float = FN_COST_WEIGHT,
) -> tuple[float, float]:
    """Minimize Cost = FP + FN * fn_weight over thresholds in [0.1, 0.9]."""
    best_thr = 0.5
    best_cost = float("inf")
    for thr_i in range(1, 10):
        thr = thr_i / 10.0
        pred = (proba >= thr).astype(int)
        fp = int(((pred == 1) & (y_true == 0)).sum())
        fn = int(((pred == 0) & (y_true == 1)).sum())
        cost = float(fp) + float(fn) * float(fn_weight)
        if cost < best_cost:
            best_cost = cost
            best_thr = thr
    return best_thr, best_cost


def compute_metrics(
    y_true: np.ndarray,
    proba: np.ndarray,
    threshold: float = 0.5,
) -> dict[str, float]:
    pred = (proba >= threshold).astype(int)
    return {
        "test_roc_auc": float(roc_auc_score(y_true, proba)),
        "test_accuracy": float(accuracy_score(y_true, pred)),
        "test_f1": float(f1_score(y_true, pred, zero_division=0)),
        "test_pr_auc": float(average_precision_score(y_true, proba)),
        "applied_eval_threshold": float(threshold),
    }


def _mean_abs_shap(values: Any) -> np.ndarray:
    arr = np.asarray(values)
    if arr.ndim == 3:
        # (n, features, classes) → take positive class if present
        arr = arr[:, :, -1]
    return np.abs(arr).mean(axis=0)


def save_shap_importance(
    feature_columns: list[str],
    importances: np.ndarray,
    path: Path,
) -> None:
    rows = [
        {"feature": feature_columns[i], "importance": float(importances[i])}
        for i in range(len(feature_columns))
    ]
    rows.sort(key=lambda r: r["importance"], reverse=True)
    pl.DataFrame(rows).write_csv(path)
    json_path = path.with_suffix(".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def compute_and_save_shap(
    xgb_model: xgb.XGBClassifier,
    cat_model: CatBoostClassifier,
    X_train: np.ndarray,
    train_df: pl.DataFrame,
    feature_columns: list[str],
) -> None:
    # Subsample for speed if large
    n = X_train.shape[0]
    if n > 2000:
        rng = np.random.default_rng(SEED)
        idx = rng.choice(n, size=2000, replace=False)
        X_s = X_train[idx]
        df_s = train_df[idx.tolist()]
    else:
        X_s = X_train
        df_s = train_df

    logger.info("Computing SHAP (XGBoost)...")
    xgb_explainer = shap.TreeExplainer(xgb_model)
    xgb_shap = xgb_explainer.shap_values(X_s)
    save_shap_importance(
        feature_columns,
        _mean_abs_shap(xgb_shap),
        MODELS_DIR / "shap_xgb_importance.csv",
    )

    logger.info("Computing SHAP (CatBoost)...")
    pool = build_cat_pool(df_s, feature_columns)
    cat_explainer = shap.TreeExplainer(cat_model)
    cat_shap = cat_explainer.shap_values(pool)
    save_shap_importance(
        feature_columns,
        _mean_abs_shap(cat_shap),
        MODELS_DIR / "shap_cat_importance.csv",
    )


def global_top_risk_factors(k: int = 4) -> list[str]:
    xgb_path = MODELS_DIR / "shap_xgb_importance.csv"
    cat_path = MODELS_DIR / "shap_cat_importance.csv"
    xgb_df = pl.read_csv(xgb_path)
    cat_df = pl.read_csv(cat_path)
    merged = (
        xgb_df.rename({"importance": "imp_xgb"})
        .join(cat_df.rename({"importance": "imp_cat"}), on="feature", how="inner")
        .with_columns(((pl.col("imp_xgb") + pl.col("imp_cat")) / 2.0).alias("imp_avg"))
        .sort("imp_avg", descending=True)
    )
    return merged["feature"].head(k).to_list()


def assert_feature_schema(df: pl.DataFrame, feature_types: dict[str, str]) -> None:
    """Strict schema-drift guard: column names and Polars dtypes must match."""
    expected_cols = list(feature_types.keys())
    missing = [c for c in expected_cols if c not in df.columns]
    extra = [c for c in df.columns if c not in expected_cols]
    if missing or extra:
        raise ValueError(
            f"Schema drift (columns). missing={missing} extra={extra} "
            f"expected={expected_cols}"
        )
    mismatches: list[str] = []
    for col, expected_dtype in feature_types.items():
        actual = str(df.schema[col])
        if actual != expected_dtype:
            mismatches.append(f"{col}: expected {expected_dtype}, got {actual}")
    if mismatches:
        raise ValueError("Schema drift (dtypes): " + "; ".join(mismatches))


def save_artifacts(
    xgb_model: xgb.XGBClassifier,
    cat_model: CatBoostClassifier,
    encoder: OrdinalEncoder,
    imputer: dict[str, Any],
    feature_columns: list[str],
    feature_types: dict[str, str],
    constant_features: list[str],
    metrics: dict[str, float],
    device_mode: str,
    dataset_hash: str,
    best_threshold: float,
) -> None:
    _ensure_models_dir()
    xgb_model.save_model(MODELS_DIR / "xgb_model.json")
    cat_model.save_model(str(MODELS_DIR / "cat_model.cbm"))
    joblib.dump(encoder, MODELS_DIR / "encoder.pkl")

    with open(MODELS_DIR / "imputer_values.json", "w", encoding="utf-8") as f:
        json.dump(imputer, f, ensure_ascii=False, indent=2)

    ensemble_config = {
        "weights": {"xgb": 0.5, "cat": 0.5},
        "default_threshold": float(best_threshold),
    }
    with open(MODELS_DIR / "ensemble_config.json", "w", encoding="utf-8") as f:
        json.dump(ensemble_config, f, ensure_ascii=False, indent=2)

    with open(MODELS_DIR / "domain_thresholds.json", "w", encoding="utf-8") as f:
        json.dump(DOMAIN_THRESHOLDS, f, ensure_ascii=False, indent=2)

    metadata = {
        "model_version": MODEL_VERSION,
        "train_date": datetime.now(timezone.utc).isoformat(),
        "dataset_hash": dataset_hash,
        "python_version": sys.version.split()[0],
        "feature_columns": feature_columns,
        "feature_types": feature_types,
        "domain_thresholds_file": "domain_thresholds.json",
        "engineered_features": [
            c
            for c in feature_columns
            if c.startswith("temp_")
            or c.startswith("flag_")
            or c in {"particle_span", "temp_x_humidity", "temp_dev_from_800", "temp_dev_from_800_sq"}
        ],
        "cat_features": CAT_FEATURES,
        "target": TARGET_COL,
        "seed": SEED,
        "constant_features": constant_features,
        "metrics": metrics,
        "device_mode": device_mode,
    }
    with open(MODELS_DIR / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)


def chronological_train_test_indices(n: int, test_size: float = 0.2) -> tuple[np.ndarray, np.ndarray]:
    """Time-ordered holdout: first (1-test_size) train, last test_size test."""
    if n < 2:
        raise ValueError("Need at least 2 rows for chronological split")
    split_at = int(n * (1.0 - test_size))
    split_at = max(1, min(n - 1, split_at))
    train_idx = np.arange(0, split_at)
    test_idx = np.arange(split_at, n)
    return train_idx, test_idx


def train_model() -> dict[str, float]:
    setup_logging()
    _set_global_seed(SEED)
    _ensure_models_dir()
    device_mode = detect_device_mode()

    logger.info("Loading %s (model_version=%s)", DATA_PATH, MODEL_VERSION)
    dataset_hash = sha256_file(DATA_PATH)
    logger.info("dataset_hash=%s", dataset_hash)

    raw = load_raw_csv()
    validate_schema(raw)
    # Keep CSV row order (assumed time-ordered by timestamp) for leakage control
    prepared, feature_columns, numeric_cols = prepare_feature_frame(raw)
    feature_types = build_feature_types(prepared, feature_columns)

    y_all = prepared[TARGET_COL].to_numpy().astype(np.int64)
    train_idx, test_idx = chronological_train_test_indices(prepared.height, test_size=0.2)

    train_df = prepared[train_idx.tolist()]
    test_df = prepared[test_idx.tolist()]
    y_train = y_all[train_idx]
    y_test = y_all[test_idx]

    n_pos = int((y_train == 1).sum())
    n_neg = int((y_train == 0).sum())
    if n_pos == 0:
        raise ValueError("Train has zero defect samples; cannot compute scale_pos_weight")
    scale_pos_weight = float(n_neg) / float(n_pos)
    logger.info(
        "Train size=%s Test size=%s scale_pos_weight=%.4f device=%s OPTUNA_TRIALS=%s",
        len(train_idx),
        len(test_idx),
        scale_pos_weight,
        device_mode,
        OPTUNA_TRIALS,
    )

    imputer = fit_imputer(train_df, numeric_cols)
    train_df = apply_imputer(train_df, imputer)
    test_df = apply_imputer(test_df, imputer)
    constant_features = find_constant_features(train_df, numeric_cols)

    encoder = fit_encoder(train_df)
    X_train = build_xgb_matrix(train_df, numeric_cols, encoder)
    X_test = build_xgb_matrix(test_df, numeric_cols, encoder)

    logger.info("Tuning XGBoost (TimeSeriesSplit)...")
    xgb_best = tune_xgboost(X_train, y_train, scale_pos_weight, device_mode)
    logger.info("Best XGB params: %s", xgb_best)

    logger.info("Tuning CatBoost (TimeSeriesSplit)...")
    cat_best = tune_catboost(
        train_df, feature_columns, y_train, scale_pos_weight, device_mode
    )
    logger.info("Best Cat params: %s", cat_best)

    logger.info("Refitting on full Train...")
    xgb_model = refit_xgboost(
        X_train, y_train, xgb_best, scale_pos_weight, device_mode
    )
    cat_model = refit_catboost(
        train_df, feature_columns, y_train, cat_best, scale_pos_weight, device_mode
    )

    p_xgb = xgb_model.predict_proba(X_test)[:, 1]
    p_cat = cat_model.predict_proba(build_cat_pool(test_df, feature_columns))[:, 1]
    proba = ensemble_proba(p_xgb, p_cat)

    best_threshold, best_cost = find_best_threshold(y_test, proba)
    logger.info(
        "Cost-optimal threshold=%.2f (cost=%.1f, Cost=FP+FN*%s)",
        best_threshold,
        best_cost,
        FN_COST_WEIGHT,
    )

    metrics = compute_metrics(y_test, proba, threshold=best_threshold)
    logger.info("Test metrics: %s", metrics)

    compute_and_save_shap(xgb_model, cat_model, X_train, train_df, feature_columns)
    save_artifacts(
        xgb_model,
        cat_model,
        encoder,
        imputer,
        feature_columns,
        feature_types,
        constant_features,
        metrics,
        device_mode,
        dataset_hash,
        best_threshold,
    )
    top4 = global_top_risk_factors(4)
    logger.info("Global top_risk_factors: %s", top4)
    logger.info("Artifacts saved under %s", MODELS_DIR.resolve())
    return metrics


def _reset_cache() -> None:
    global _xgb_model, _cat_model, _encoder, _imputer
    global _ensemble_config, _metadata, _top_risk_factors
    _xgb_model = None
    _cat_model = None
    _encoder = None
    _imputer = None
    _ensemble_config = None
    _metadata = None
    _top_risk_factors = None


def _load_artifacts_if_needed() -> None:
    global _xgb_model, _cat_model, _encoder, _imputer
    global _ensemble_config, _metadata, _top_risk_factors

    if _xgb_model is not None and _cat_model is not None and _metadata is not None:
        return

    required = [
        MODELS_DIR / "xgb_model.json",
        MODELS_DIR / "cat_model.cbm",
        MODELS_DIR / "encoder.pkl",
        MODELS_DIR / "imputer_values.json",
        MODELS_DIR / "ensemble_config.json",
        MODELS_DIR / "metadata.json",
        MODELS_DIR / "shap_xgb_importance.csv",
        MODELS_DIR / "shap_cat_importance.csv",
    ]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        raise FileNotFoundError(
            "Model artifacts missing. Run train_model() first. Missing: "
            + ", ".join(missing)
        )

    meta_path = MODELS_DIR / "metadata.json"
    with open(meta_path, encoding="utf-8") as f:
        _metadata = json.load(f)
    with open(MODELS_DIR / "imputer_values.json", encoding="utf-8") as f:
        _imputer = json.load(f)
    with open(MODELS_DIR / "ensemble_config.json", encoding="utf-8") as f:
        _ensemble_config = json.load(f)

    _encoder = joblib.load(MODELS_DIR / "encoder.pkl")

    device_mode = _metadata.get("device_mode", "cpu")
    _xgb_model = xgb.XGBClassifier()
    _xgb_model.load_model(MODELS_DIR / "xgb_model.json")
    # Align device for inference
    try:
        _xgb_model.set_params(device="cuda" if device_mode == "cuda" else "cpu")
    except Exception:  # noqa: BLE001
        _xgb_model.set_params(device="cpu")

    _cat_model = CatBoostClassifier()
    _cat_model.load_model(str(MODELS_DIR / "cat_model.cbm"))

    _top_risk_factors = global_top_risk_factors(4)
    logger.info("Artifacts loaded for predict(); top_risk_factors=%s", _top_risk_factors)


def predict(df: pl.DataFrame, fillThreshold: float = 0.5) -> dict[str, Any]:
    """Realtime O/X inference. Single-row polars DataFrame only."""
    if not isinstance(df, pl.DataFrame):
        raise TypeError("df must be a polars.DataFrame")
    if df.height != 1:
        raise ValueError(f"predict expects exactly 1 row; got {df.height}")

    _load_artifacts_if_needed()
    assert _metadata is not None
    assert _imputer is not None
    assert _encoder is not None
    assert _xgb_model is not None
    assert _cat_model is not None
    assert _top_risk_factors is not None

    feature_columns: list[str] = _metadata["feature_columns"]
    feature_types: dict[str, str] = _metadata.get("feature_types") or {
        c: ("Utf8" if c == CAT_COL else "Float64") for c in feature_columns
    }
    numeric_cols = [c for c in feature_columns if c != CAT_COL]

    work = df
    drop_now = [c for c in [ID_COL, TS_COL, TARGET_COL] if c in work.columns]
    if drop_now:
        work = work.drop(drop_now)

    # Cast raw columns then engineer domain features before schema check
    raw_cols = [c for c in work.columns if c != CAT_COL]
    cast_exprs = [pl.col(c).cast(pl.Float64, strict=False).alias(c) for c in raw_cols]
    if CAT_COL in work.columns:
        cast_exprs.append(pl.col(CAT_COL).cast(pl.Utf8).alias(CAT_COL))
    work = work.with_columns(cast_exprs)
    work = add_domain_features(work)

    # Schema-drift guard (includes engineered columns)
    assert_feature_schema(work.select(feature_columns), feature_types)

    # Enforce order (already validated)
    work = work.select(feature_columns)
    work = apply_imputer(work, _imputer)

    X = build_xgb_matrix(work, numeric_cols, _encoder)
    p_xgb = float(_xgb_model.predict_proba(X)[0, 1])
    p_cat = float(_cat_model.predict_proba(build_cat_pool(work, feature_columns))[0, 1])
    probability = float(0.5 * p_xgb + 0.5 * p_cat)
    defect_status = 1 if probability >= float(fillThreshold) else 0

    return {
        "defect_status": int(defect_status),
        "probability": probability,
        "applied_threshold": float(fillThreshold),
        "top_risk_factors": list(_top_risk_factors),
    }


if __name__ == "__main__":
    train_model()
