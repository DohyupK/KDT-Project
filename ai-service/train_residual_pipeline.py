"""
Residual lithium regression: train_model() + predict_residual_li(df)

CWD: ai-service/
Data: data/cathode_qc_reg_data.csv
Artifacts: models/residual/
Optuna: RMSE minimize (TimeSeriesSplit), XGB+Cat ensemble 0.5/0.5
Unit label: ppm (example; change later if needed)
"""

from __future__ import annotations

import gc
import json
import logging
import os
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
from catboost import CatBoostRegressor, Pool
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import OrdinalEncoder

from train_pipeline import (
    CAT_COL,
    CAT_FEATURES,
    CAT_FILL,
    DOMAIN_THRESHOLDS,
    ID_COL,
    N_FOLDS,
    SEED,
    TS_COL,
    add_domain_features,
    apply_imputer,
    assert_feature_schema,
    build_feature_types,
    chronological_train_test_indices,
    detect_device_mode,
    find_constant_features,
    fit_encoder,
    fit_imputer,
    sha256_file,
    _mean_abs_shap,
    _set_global_seed,
)

MODEL_VERSION = "1.0.0-residual"
OPTUNA_TRIALS = int(os.environ.get("OPTUNA_TRIALS", "100"))
DATA_PATH = Path("data/cathode_qc_reg_data.csv")
MODELS_DIR = Path("models/residual")
LOGS_DIR = Path("logs")
OPTUNA_DB = "sqlite:///optuna_residual.db"
TARGET_COL = "residual_li"
TARGET_UNIT = "ppm"
DROP_COLS = {ID_COL, TS_COL}

_xgb_model: xgb.XGBRegressor | None = None
_cat_model: CatBoostRegressor | None = None
_encoder: OrdinalEncoder | None = None
_imputer: dict[str, Any] | None = None
_ensemble_config: dict[str, Any] | None = None
_metadata: dict[str, Any] | None = None
_top_factors: list[str] | None = None

logger = logging.getLogger(__name__)


def setup_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / "train_residual.log"
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    root.handlers.clear()
    for handler in (
        logging.StreamHandler(),
        logging.FileHandler(log_path, encoding="utf-8"),
    ):
        handler.setFormatter(fmt)
        root.addHandler(handler)


def _ensure_models_dir() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def load_raw_csv(path: Path = DATA_PATH) -> pl.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path.resolve()}")
    return pl.read_csv(path, null_values=["", "NA", "null", "None"])


def validate_schema(df: pl.DataFrame) -> None:
    required = {ID_COL, TS_COL, CAT_COL, TARGET_COL}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")
    if df[TARGET_COL].null_count() > 0:
        raise ValueError(f"{TARGET_COL} has nulls; cannot train")
    numeric_cols = [
        c for c in df.columns if c not in {ID_COL, TS_COL, CAT_COL, TARGET_COL}
    ]
    if not numeric_cols:
        raise ValueError("At least one numeric feature column is required")
    if df.height < 50:
        logger.warning("Row count %s < 50; TimeSeriesSplit/Optuna may fail", df.height)


def prepare_feature_frame(df: pl.DataFrame) -> tuple[pl.DataFrame, list[str], list[str]]:
    work = df.drop([c for c in DROP_COLS if c in df.columns])
    base_numeric = [c for c in work.columns if c not in {CAT_COL, TARGET_COL}]
    cast_exprs: list[pl.Expr] = [
        pl.col(c).cast(pl.Float64, strict=False).alias(c) for c in base_numeric
    ]
    cast_exprs.append(pl.col(CAT_COL).cast(pl.Utf8).alias(CAT_COL))
    cast_exprs.append(pl.col(TARGET_COL).cast(pl.Float64).alias(TARGET_COL))
    work = work.with_columns(cast_exprs)
    work = add_domain_features(work)
    numeric_cols = [c for c in work.columns if c not in {CAT_COL, TARGET_COL}]
    feature_columns = numeric_cols + [CAT_COL]
    return work, feature_columns, numeric_cols


def build_xgb_matrix(
    df: pl.DataFrame,
    numeric_cols: list[str],
    encoder: OrdinalEncoder,
) -> np.ndarray:
    num = df.select(numeric_cols).to_numpy().astype(np.float64)
    cat = encoder.transform(
        df.select(CAT_COL).to_numpy().astype(object).reshape(-1, 1)
    ).astype(np.float64)
    return np.hstack([num, cat])


def build_cat_pool(
    df: pl.DataFrame,
    feature_columns: list[str],
    y: np.ndarray | None = None,
) -> Pool:
    data = df.select(feature_columns).rows()
    return Pool(
        data=data,
        label=y,
        cat_features=CAT_FEATURES,
        feature_names=feature_columns,
    )


def _rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))


def _xgb_reg_params(trial: optuna.Trial, device_mode: str) -> dict[str, Any]:
    return {
        "max_depth": trial.suggest_int("max_depth", 3, 10),
        "learning_rate": trial.suggest_float("learning_rate", 1e-3, 0.3, log=True),
        "n_estimators": trial.suggest_int("n_estimators", 100, 800),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "min_child_weight": trial.suggest_float("min_child_weight", 1.0, 10.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True),
        "gamma": trial.suggest_float("gamma", 0.0, 5.0),
        "objective": "reg:squarederror",
        "eval_metric": "rmse",
        "tree_method": "hist",
        "device": "cuda" if device_mode == "cuda" else "cpu",
        "random_state": SEED,
        "n_jobs": 1 if device_mode == "cuda" else -1,
        "verbosity": 0,
    }


def _cat_reg_params(trial: optuna.Trial, device_mode: str) -> dict[str, Any]:
    return {
        "depth": trial.suggest_int("depth", 4, 10),
        "learning_rate": trial.suggest_float("learning_rate", 1e-3, 0.3, log=True),
        "iterations": trial.suggest_int("iterations", 100, 800),
        "l2_leaf_reg": trial.suggest_float("l2_leaf_reg", 1.0, 10.0),
        "random_strength": trial.suggest_float("random_strength", 0.0, 2.0),
        "bagging_temperature": trial.suggest_float("bagging_temperature", 0.0, 1.0),
        "border_count": trial.suggest_int("border_count", 32, 255),
        "loss_function": "RMSE",
        "eval_metric": "RMSE",
        "task_type": "GPU" if device_mode == "cuda" else "CPU",
        "random_seed": SEED,
        "verbose": False,
        "allow_writing_files": False,
    }


def _optuna_progress_callback(study_label: str, total_target: int) -> Any:
    """Log every 5 completed trials (and the last)."""

    def _cb(study: optuna.Study, trial: optuna.trial.FrozenTrial) -> None:
        n = len(study.trials)
        if n % 5 == 0 or n >= total_target:
            best = study.best_value if study.best_trial is not None else float("nan")
            logger.info(
                "[%s] trial %s/%s done | last=%.6f best_rmse=%.6f",
                study_label,
                n,
                total_target,
                float(trial.value) if trial.value is not None else float("nan"),
                float(best),
            )

    return _cb


def tune_xgboost(X: np.ndarray, y: np.ndarray, device_mode: str) -> dict[str, Any]:
    sampler = optuna.samplers.TPESampler(seed=SEED)
    study = optuna.create_study(
        study_name="xgb_residual_reg_v1",
        direction="minimize",
        storage=OPTUNA_DB,
        load_if_exists=True,
        sampler=sampler,
    )

    def objective(trial: optuna.Trial) -> float:
        params = _xgb_reg_params(trial, device_mode)
        tscv = TimeSeriesSplit(n_splits=N_FOLDS)
        scores: list[float] = []
        try:
            for tr_idx, va_idx in tscv.split(X):
                model = xgb.XGBRegressor(**params)
                model.fit(
                    X[tr_idx],
                    y[tr_idx],
                    eval_set=[(X[va_idx], y[va_idx])],
                    verbose=False,
                )
                pred = model.predict(X[va_idx])
                scores.append(_rmse(y[va_idx], pred))
            return float(np.mean(scores)) if scores else 1e9
        finally:
            gc.collect()

    remaining = max(0, OPTUNA_TRIALS - len(study.trials))
    target = len(study.trials) + remaining
    logger.info("XGBoost Optuna: %s trials (RMSE minimize, resume-aware)", remaining)
    if remaining > 0:
        study.optimize(
            objective,
            n_trials=remaining,
            show_progress_bar=False,
            callbacks=[_optuna_progress_callback("xgb_residual_reg", target)],
        )
    return dict(study.best_params)


def tune_catboost(
    train_df: pl.DataFrame,
    feature_columns: list[str],
    y: np.ndarray,
    device_mode: str,
) -> dict[str, Any]:
    sampler = optuna.samplers.TPESampler(seed=SEED)
    study = optuna.create_study(
        study_name="cat_residual_reg_v1",
        direction="minimize",
        storage=OPTUNA_DB,
        load_if_exists=True,
        sampler=sampler,
    )

    def objective(trial: optuna.Trial) -> float:
        params = _cat_reg_params(trial, device_mode)
        tscv = TimeSeriesSplit(n_splits=N_FOLDS)
        scores: list[float] = []
        indices = np.arange(len(y))
        try:
            for tr_idx, va_idx in tscv.split(indices):
                tr_df = train_df[tr_idx.tolist()]
                va_df = train_df[va_idx.tolist()]
                train_pool = build_cat_pool(tr_df, feature_columns, y[tr_idx])
                valid_pool = build_cat_pool(va_df, feature_columns, y[va_idx])
                model = CatBoostRegressor(**params)
                model.fit(train_pool, eval_set=valid_pool, use_best_model=True)
                pred = np.asarray(model.predict(valid_pool), dtype=np.float64)
                scores.append(_rmse(y[va_idx], pred))
            return float(np.mean(scores)) if scores else 1e9
        finally:
            gc.collect()

    remaining = max(0, OPTUNA_TRIALS - len(study.trials))
    target = len(study.trials) + remaining
    logger.info("CatBoost Optuna: %s trials (RMSE minimize, resume-aware)", remaining)
    if remaining > 0:
        study.optimize(
            objective,
            n_trials=remaining,
            show_progress_bar=False,
            callbacks=[_optuna_progress_callback("cat_residual_reg", target)],
        )
    return dict(study.best_params)


def refit_xgboost(
    X: np.ndarray,
    y: np.ndarray,
    best_params: dict[str, Any],
    device_mode: str,
) -> xgb.XGBRegressor:
    params = {
        **best_params,
        "objective": "reg:squarederror",
        "eval_metric": "rmse",
        "tree_method": "hist",
        "device": "cuda" if device_mode == "cuda" else "cpu",
        "random_state": SEED,
        "n_jobs": 1 if device_mode == "cuda" else -1,
        "verbosity": 0,
    }
    model = xgb.XGBRegressor(**params)
    model.fit(X, y)
    return model


def refit_catboost(
    train_df: pl.DataFrame,
    feature_columns: list[str],
    y: np.ndarray,
    best_params: dict[str, Any],
    device_mode: str,
) -> CatBoostRegressor:
    params = {
        **best_params,
        "loss_function": "RMSE",
        "eval_metric": "RMSE",
        "task_type": "GPU" if device_mode == "cuda" else "CPU",
        "random_seed": SEED,
        "verbose": False,
        "allow_writing_files": False,
    }
    model = CatBoostRegressor(**params)
    model.fit(build_cat_pool(train_df, feature_columns, y))
    return model


def ensemble_pred(p_xgb: np.ndarray, p_cat: np.ndarray) -> np.ndarray:
    return 0.5 * p_xgb + 0.5 * p_cat


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "test_rmse": _rmse(y_true, y_pred),
        "test_mae": float(mean_absolute_error(y_true, y_pred)),
        "test_r2": float(r2_score(y_true, y_pred)),
    }


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
    with open(path.with_suffix(".json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def compute_and_save_shap(
    xgb_model: xgb.XGBRegressor,
    cat_model: CatBoostRegressor,
    X_train: np.ndarray,
    train_df: pl.DataFrame,
    feature_columns: list[str],
) -> None:
    n = X_train.shape[0]
    if n > 2000:
        rng = np.random.default_rng(SEED)
        idx = rng.choice(n, size=2000, replace=False)
        X_s = X_train[idx]
        df_s = train_df[idx.tolist()]
    else:
        X_s = X_train
        df_s = train_df

    logger.info("Computing SHAP (XGBoost regressor)...")
    xgb_shap = shap.TreeExplainer(xgb_model).shap_values(X_s)
    save_shap_importance(
        feature_columns,
        _mean_abs_shap(xgb_shap),
        MODELS_DIR / "shap_xgb_importance.csv",
    )

    logger.info("Computing SHAP (CatBoost regressor)...")
    pool = build_cat_pool(df_s, feature_columns)
    cat_shap = shap.TreeExplainer(cat_model).shap_values(pool)
    save_shap_importance(
        feature_columns,
        _mean_abs_shap(cat_shap),
        MODELS_DIR / "shap_cat_importance.csv",
    )


def global_top_factors(k: int = 4) -> list[str]:
    xgb_df = pl.read_csv(MODELS_DIR / "shap_xgb_importance.csv")
    cat_df = pl.read_csv(MODELS_DIR / "shap_cat_importance.csv")
    merged = (
        xgb_df.rename({"importance": "imp_xgb"})
        .join(cat_df.rename({"importance": "imp_cat"}), on="feature", how="inner")
        .with_columns(((pl.col("imp_xgb") + pl.col("imp_cat")) / 2.0).alias("imp_avg"))
        .sort("imp_avg", descending=True)
    )
    return merged["feature"].head(k).to_list()


def save_artifacts(
    xgb_model: xgb.XGBRegressor,
    cat_model: CatBoostRegressor,
    encoder: OrdinalEncoder,
    imputer: dict[str, Any],
    feature_columns: list[str],
    feature_types: dict[str, str],
    constant_features: list[str],
    metrics: dict[str, float],
    device_mode: str,
    dataset_hash: str,
) -> None:
    _ensure_models_dir()
    xgb_model.save_model(MODELS_DIR / "xgb_model.json")
    cat_model.save_model(str(MODELS_DIR / "cat_model.cbm"))
    joblib.dump(encoder, MODELS_DIR / "encoder.pkl")

    with open(MODELS_DIR / "imputer_values.json", "w", encoding="utf-8") as f:
        json.dump(imputer, f, ensure_ascii=False, indent=2)

    ensemble_config = {"weights": {"xgb": 0.5, "cat": 0.5}, "task": "regression"}
    with open(MODELS_DIR / "ensemble_config.json", "w", encoding="utf-8") as f:
        json.dump(ensemble_config, f, ensure_ascii=False, indent=2)

    with open(MODELS_DIR / "domain_thresholds.json", "w", encoding="utf-8") as f:
        json.dump(DOMAIN_THRESHOLDS, f, ensure_ascii=False, indent=2)

    metadata = {
        "model_version": MODEL_VERSION,
        "task": "residual_li_regression",
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
            or c
            in {
                "particle_span",
                "temp_x_humidity",
                "temp_dev_from_800",
                "temp_dev_from_800_sq",
            }
        ],
        "cat_features": CAT_FEATURES,
        "target": TARGET_COL,
        "target_unit": TARGET_UNIT,
        "optuna_objective": "rmse_minimize",
        "seed": SEED,
        "constant_features": constant_features,
        "metrics": metrics,
        "device_mode": device_mode,
    }
    with open(MODELS_DIR / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)


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
    prepared, feature_columns, numeric_cols = prepare_feature_frame(raw)
    feature_types = build_feature_types(prepared, feature_columns)

    y_all = prepared[TARGET_COL].to_numpy().astype(np.float64)
    train_idx, test_idx = chronological_train_test_indices(prepared.height, test_size=0.2)

    train_df = prepared[train_idx.tolist()]
    test_df = prepared[test_idx.tolist()]
    y_train = y_all[train_idx]
    y_test = y_all[test_idx]

    logger.info(
        "Train size=%s Test size=%s device=%s OPTUNA_TRIALS=%s",
        len(train_idx),
        len(test_idx),
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

    logger.info("Tuning XGBoost regressor (TimeSeriesSplit, RMSE)...")
    xgb_best = tune_xgboost(X_train, y_train, device_mode)
    logger.info("Best XGB params: %s", xgb_best)

    logger.info("Tuning CatBoost regressor (TimeSeriesSplit, RMSE)...")
    cat_best = tune_catboost(train_df, feature_columns, y_train, device_mode)
    logger.info("Best Cat params: %s", cat_best)

    logger.info("Refitting on full Train...")
    xgb_model = refit_xgboost(X_train, y_train, xgb_best, device_mode)
    cat_model = refit_catboost(train_df, feature_columns, y_train, cat_best, device_mode)

    p_xgb = xgb_model.predict(X_test)
    p_cat = np.asarray(
        cat_model.predict(build_cat_pool(test_df, feature_columns)),
        dtype=np.float64,
    )
    y_pred = ensemble_pred(p_xgb, p_cat)
    metrics = compute_metrics(y_test, y_pred)
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
    )
    top4 = global_top_factors(4)
    logger.info("Global top factors: %s", top4)
    logger.info("Artifacts saved under %s", MODELS_DIR.resolve())
    return metrics


def _load_artifacts_if_needed() -> None:
    global _xgb_model, _cat_model, _encoder, _imputer
    global _ensemble_config, _metadata, _top_factors

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
            "Residual model artifacts missing. Run train_model() first. Missing: "
            + ", ".join(missing)
        )

    with open(MODELS_DIR / "metadata.json", encoding="utf-8") as f:
        _metadata = json.load(f)
    with open(MODELS_DIR / "imputer_values.json", encoding="utf-8") as f:
        _imputer = json.load(f)
    with open(MODELS_DIR / "ensemble_config.json", encoding="utf-8") as f:
        _ensemble_config = json.load(f)

    _encoder = joblib.load(MODELS_DIR / "encoder.pkl")

    device_mode = _metadata.get("device_mode", "cpu")
    _xgb_model = xgb.XGBRegressor()
    _xgb_model.load_model(MODELS_DIR / "xgb_model.json")
    try:
        _xgb_model.set_params(device="cuda" if device_mode == "cuda" else "cpu")
    except Exception:  # noqa: BLE001
        _xgb_model.set_params(device="cpu")

    _cat_model = CatBoostRegressor()
    _cat_model.load_model(str(MODELS_DIR / "cat_model.cbm"))
    _top_factors = global_top_factors(4)


def predict_residual_li(df: pl.DataFrame) -> dict[str, Any]:
    """Realtime residual_li inference. Single-row polars DataFrame only."""
    if not isinstance(df, pl.DataFrame):
        raise TypeError("df must be a polars.DataFrame")
    if df.height != 1:
        raise ValueError(f"predict_residual_li expects exactly 1 row; got {df.height}")

    _load_artifacts_if_needed()
    assert _metadata is not None
    assert _imputer is not None
    assert _encoder is not None
    assert _xgb_model is not None
    assert _cat_model is not None
    assert _top_factors is not None

    feature_columns: list[str] = _metadata["feature_columns"]
    feature_types: dict[str, str] = _metadata.get("feature_types") or {
        c: ("Utf8" if c == CAT_COL else "Float64") for c in feature_columns
    }
    numeric_cols = [c for c in feature_columns if c != CAT_COL]

    work = df
    drop_now = [c for c in [ID_COL, TS_COL, TARGET_COL] if c in work.columns]
    if drop_now:
        work = work.drop(drop_now)

    raw_cols = [c for c in work.columns if c != CAT_COL]
    cast_exprs = [pl.col(c).cast(pl.Float64, strict=False).alias(c) for c in raw_cols]
    if CAT_COL in work.columns:
        cast_exprs.append(pl.col(CAT_COL).cast(pl.Utf8).alias(CAT_COL))
    work = work.with_columns(cast_exprs)
    work = add_domain_features(work)
    assert_feature_schema(work.select(feature_columns), feature_types)
    work = work.select(feature_columns)
    work = apply_imputer(work, _imputer)

    X = build_xgb_matrix(work, numeric_cols, _encoder)
    p_xgb = float(_xgb_model.predict(X)[0])
    p_cat = float(_cat_model.predict(build_cat_pool(work, feature_columns))[0])
    residual_li = float(0.5 * p_xgb + 0.5 * p_cat)
    unit = str(_metadata.get("target_unit") or TARGET_UNIT)

    return {
        "residual_li": residual_li,
        "unit": unit,
        "top_factors": list(_top_factors),
    }


if __name__ == "__main__":
    train_model()
