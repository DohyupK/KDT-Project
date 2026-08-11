"""
Train one voting ensemble member (classification or regression).

CWD: ai-service/
No chronological holdout — 100% of rows used for Train + Optuna CV (N_FOLDS).
Same method as production pipelines: Polars, seed 42, XGB+Cat 0.5/0.5, Optuna.

Usage:
  python train_voting_member.py --member clf_d50
  python train_voting_member.py --data data/voting/cathode_clf_d50.csv --target quality_defect --out models/voting/clf_d50 --task classification
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import joblib
import numpy as np
import optuna
import polars as pl
import shap
import xgboost as xgb
from catboost import CatBoostClassifier, CatBoostRegressor, Pool
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
)
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import OrdinalEncoder

from train_pipeline import (
    CAT_COL,
    CAT_FILL,
    N_FOLDS,
    OPTIMAL_SINTERING_TEMP,
    SEED,
    add_domain_features,
    detect_device_mode,
    _mean_abs_shap,
    _set_global_seed,
)

OPTUNA_TRIALS = int(os.environ.get("OPTUNA_TRIALS", "100"))
LOGS_DIR = Path("logs")
COMPLETION_DIR = Path(os.environ.get("VOTING_COMPLETION_DIR", r"c:\Users\OWNER\Downloads\data"))

TaskKind = Literal["classification", "regression"]

MEMBERS: dict[str, dict[str, str]] = {
    "clf_d50": {
        "data": "data/voting/cathode_clf_d50.csv",
        "target": "quality_defect",
        "out": "models/voting/clf_d50",
        "task": "classification",
        "optuna_db": "sqlite:///optuna_voting_clf_d50.db",
    },
    "clf_d90": {
        "data": "data/voting/cathode_clf_d90.csv",
        "target": "quality_defect",
        "out": "models/voting/clf_d90",
        "task": "classification",
        "optuna_db": "sqlite:///optuna_voting_clf_d90.db",
    },
    "clf_feature": {
        "data": "data/voting/cathode_clf_feature.csv",
        "target": "quality_defect",
        "out": "models/voting/clf_feature",
        "task": "classification",
        "optuna_db": "sqlite:///optuna_voting_clf_feature.db",
    },
    "reg_d50": {
        "data": "data/voting/cathode_reg_d50.csv",
        "target": "capacity",
        "out": "models/voting/reg_d50",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_reg_d50.db",
    },
    "reg_d90": {
        "data": "data/voting/cathode_reg_d90.csv",
        "target": "capacity",
        "out": "models/voting/reg_d90",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_reg_d90.db",
    },
    "reg_feature": {
        "data": "data/voting/cathode_reg_feature.csv",
        "target": "capacity",
        "out": "models/voting/reg_feature",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_reg_feature.db",
    },
    "residual_d50": {
        "data": "data/voting/cathode_qc_reg_d50.csv",
        "target": "residual_li",
        "out": "models/voting/residual_d50",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_residual_d50.db",
    },
    "residual_d90": {
        "data": "data/voting/cathode_qc_reg_d90.csv",
        "target": "residual_li",
        "out": "models/voting/residual_d90",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_residual_d90.db",
    },
    "residual_feature": {
        "data": "data/voting/cathode_qc_reg_feature.csv",
        "target": "residual_li",
        "out": "models/voting/residual_feature",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_residual_feature.db",
    },
    "cathode_feature_cap": {
        "data": "data/voting/cathode_feature.csv",
        "target": "capacity",
        "out": "models/voting/cathode_feature/cap",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_cathode_feature_cap.db",
        "drop_extra": "residual_li,quality_defect",
    },
    "cathode_feature_res": {
        "data": "data/voting/cathode_feature.csv",
        "target": "residual_li",
        "out": "models/voting/cathode_feature/res",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_cathode_feature_res.db",
        "drop_extra": "capacity,quality_defect",
    },
    "cathode_feature_clf": {
        "data": "data/voting/cathode_feature.csv",
        "target": "quality_defect",
        "out": "models/voting/cathode_feature/clf",
        "task": "classification",
        "optuna_db": "sqlite:///optuna_voting_cathode_feature_clf.db",
        # capacity + residual_li kept as features for cascade inference
        "drop_extra": "",
    },
    "cathode_special_cap": {
        "data": "data/voting/cathode_special_feature.csv",
        "target": "capacity",
        "out": "models/voting/cathode_special/cap",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_cathode_special_cap.db",
        "drop_extra": "residual_li,quality_defect",
    },
    "cathode_special_res": {
        "data": "data/voting/cathode_special_feature.csv",
        "target": "residual_li",
        "out": "models/voting/cathode_special/res",
        "task": "regression",
        "optuna_db": "sqlite:///optuna_voting_cathode_special_res.db",
        "drop_extra": "capacity,quality_defect",
    },
    "cathode_special_clf": {
        "data": "data/voting/cathode_special_feature.csv",
        "target": "quality_defect",
        "out": "models/voting/cathode_special/clf",
        "task": "classification",
        "optuna_db": "sqlite:///optuna_voting_cathode_special_clf.db",
        "drop_extra": "",
    },
}

logger = logging.getLogger(__name__)


def setup_logging(member_id: str) -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / f"train_voting_{member_id}.log"
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


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_completion_markdown(member_id: str, out_dir: Path, task: str, target: str) -> None:
    COMPLETION_DIR.mkdir(parents=True, exist_ok=True)
    path = COMPLETION_DIR / f"{member_id}_완료.md"
    now = datetime.now(timezone.utc).isoformat()
    body = (
        f"# {member_id} 완료\n\n"
        f"- status: **완료**\n"
        f"- finished_at_utc: `{now}`\n"
        f"- task: `{task}`\n"
        f"- target: `{target}`\n"
        f"- artifacts: `{out_dir.as_posix()}`\n"
        f"- n_folds: `{N_FOLDS}`\n"
        f"- holdout: `none` (100% train)\n"
        f"- optuna_trials: `{OPTUNA_TRIALS}`\n"
    )
    path.write_text(body, encoding="utf-8")
    logger.info("Wrote completion marker: %s", path)


def maybe_add_domain_features(df: pl.DataFrame) -> pl.DataFrame:
    required = {"sintering_temp", "humidity", "metal_impurity", "d50", "d90", "lithium_input"}
    if required <= set(df.columns):
        return add_domain_features(df)
    # Partial engineering when possible
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
    if not exprs:
        return df
    return df.with_columns(exprs)


def prepare_frame(
    df: pl.DataFrame,
    target: str,
    drop_extra: list[str],
) -> tuple[pl.DataFrame, list[str], list[str]]:
    drop = {c for c in ("id", "timestamp", *drop_extra) if c}
    work = df.drop([c for c in drop if c in df.columns])
    if target not in work.columns:
        raise ValueError(f"Target {target} missing from CSV columns {work.columns}")

    other_targets = {"quality_defect", "capacity", "residual_li"} - {target}
    for ot in other_targets:
        if ot in work.columns and ot not in drop_extra:
            # keep only if intentionally a feature (cascade clf); drop if still present as unused label
            pass

    # For cap/res training, drop_extra already removed other labels.
    # For clf on cathode_feature, keep capacity/residual_li as features.

    feature_candidates = [c for c in work.columns if c != target]
    cast_exprs: list[pl.Expr] = []
    cat_cols: list[str] = []
    for col in feature_candidates:
        if col == CAT_COL:
            cast_exprs.append(pl.col(col).cast(pl.Utf8).alias(col))
            cat_cols.append(col)
        else:
            cast_exprs.append(pl.col(col).cast(pl.Float64, strict=False).alias(col))
    if target == "quality_defect":
        cast_exprs.append(pl.col(target).cast(pl.Int64).alias(target))
    else:
        cast_exprs.append(pl.col(target).cast(pl.Float64, strict=False).alias(target))
    work = work.with_columns(cast_exprs)
    work = maybe_add_domain_features(work)

    feature_columns = [c for c in work.columns if c != target]
    numeric_cols = [c for c in feature_columns if c not in cat_cols]
    return work, feature_columns, numeric_cols


def fit_imputer(train_df: pl.DataFrame, numeric_cols: list[str]) -> dict[str, Any]:
    means: dict[str, float] = {}
    for col in numeric_cols:
        mean_val = train_df[col].mean()
        means[col] = float(mean_val) if mean_val is not None else 0.0
    return {"numeric_means": means, "categorical_fill": CAT_FILL}


def apply_imputer(df: pl.DataFrame, imputer: dict[str, Any]) -> pl.DataFrame:
    means: dict[str, float] = imputer["numeric_means"]
    exprs: list[pl.Expr] = []
    for col, mean_val in means.items():
        if col in df.columns:
            exprs.append(pl.col(col).fill_null(mean_val).alias(col))
    if CAT_COL in df.columns:
        exprs.append(pl.col(CAT_COL).fill_null(imputer["categorical_fill"]).alias(CAT_COL))
    return df.with_columns(exprs) if exprs else df


def fit_encoder(train_df: pl.DataFrame, cat_cols: list[str]) -> OrdinalEncoder | None:
    if not cat_cols:
        return None
    enc = OrdinalEncoder(
        handle_unknown="use_encoded_value",
        unknown_value=-1,
    )
    arr = train_df.select(cat_cols).to_numpy()
    enc.fit(arr)
    return enc


def build_xgb_matrix(
    df: pl.DataFrame,
    numeric_cols: list[str],
    cat_cols: list[str],
    encoder: OrdinalEncoder | None,
) -> np.ndarray:
    parts: list[np.ndarray] = []
    if numeric_cols:
        parts.append(df.select(numeric_cols).to_numpy().astype(np.float64))
    if cat_cols and encoder is not None:
        parts.append(encoder.transform(df.select(cat_cols).to_numpy()).astype(np.float64))
    if not parts:
        raise ValueError("No features for XGB matrix")
    return np.hstack(parts) if len(parts) > 1 else parts[0]


def build_cat_pool(
    df: pl.DataFrame,
    feature_columns: list[str],
    y: np.ndarray | None = None,
    cat_cols: list[str] | None = None,
) -> Pool:
    cat_cols = cat_cols or []
    X = df.select(feature_columns)
    cat_idx = [feature_columns.index(c) for c in cat_cols if c in feature_columns]
    data = X.to_numpy()
    # CatBoost wants categorical as strings
    if cat_idx:
        # rebuild via pandas-free: pass DataFrame-like dict
        col_data = []
        for i, c in enumerate(feature_columns):
            s = X[c].to_list()
            col_data.append(s)
        # Use numpy object array for mixed — CatBoost Pool from list of lists
        rows = list(map(list, zip(*col_data)))
        if y is None:
            return Pool(data=rows, cat_features=cat_idx, feature_names=feature_columns)
        return Pool(
            data=rows,
            label=y.tolist(),
            cat_features=cat_idx,
            feature_names=feature_columns,
        )
    if y is None:
        return Pool(data=data, feature_names=feature_columns)
    return Pool(data=data, label=y, feature_names=feature_columns)


def _xgb_clf_params(trial: optuna.Trial, spw: float, device_mode: str) -> dict[str, Any]:
    lo, hi = spw * 0.8, spw * 1.2
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


def _cat_clf_params(trial: optuna.Trial, spw: float, device_mode: str) -> dict[str, Any]:
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
        "scale_pos_weight": spw,
        "random_seed": SEED,
        "verbose": False,
        "allow_writing_files": False,
    }


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


def _rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))


def train_member(
    member_id: str,
    data_path: Path,
    target: str,
    out_dir: Path,
    task: TaskKind,
    optuna_db: str,
    drop_extra: list[str],
) -> dict[str, Any]:
    setup_logging(member_id)
    _set_global_seed(SEED)
    out_dir.mkdir(parents=True, exist_ok=True)
    device_mode = detect_device_mode()
    dataset_hash = sha256_file(data_path)
    logger.info(
        "Training member=%s task=%s target=%s rows_csv=%s device=%s trials=%s folds=%s",
        member_id,
        task,
        target,
        data_path,
        device_mode,
        OPTUNA_TRIALS,
        N_FOLDS,
    )

    raw = pl.read_csv(data_path, null_values=["", "NA", "null", "None"])
    prepared, feature_columns, numeric_cols = prepare_frame(raw, target, drop_extra)
    cat_cols = [c for c in feature_columns if c == CAT_COL]
    y = prepared[target].to_numpy()
    if task == "classification":
        y = y.astype(np.int64)
        n_pos = int((y == 1).sum())
        n_neg = int((y == 0).sum())
        if n_pos == 0 or n_neg == 0:
            raise ValueError(f"Need both classes; pos={n_pos} neg={n_neg}")
        scale_pos_weight = float(n_neg) / float(n_pos)
    else:
        y = y.astype(np.float64)
        scale_pos_weight = 1.0

    imputer = fit_imputer(prepared, numeric_cols)
    train_df = apply_imputer(prepared, imputer)
    encoder = fit_encoder(train_df, cat_cols)
    X = build_xgb_matrix(train_df, numeric_cols, cat_cols, encoder)

    sampler = optuna.samplers.TPESampler(seed=SEED)

    if task == "classification":
        xgb_study = optuna.create_study(
            study_name=f"xgb_{member_id}",
            direction="maximize",
            storage=optuna_db,
            load_if_exists=True,
            sampler=sampler,
        )

        def xgb_obj(trial: optuna.Trial) -> float:
            params = _xgb_clf_params(trial, scale_pos_weight, device_mode)
            tscv = TimeSeriesSplit(n_splits=N_FOLDS)
            scores: list[float] = []
            try:
                for tr_idx, va_idx in tscv.split(X):
                    if len(np.unique(y[tr_idx])) < 2 or len(np.unique(y[va_idx])) < 2:
                        continue
                    model = xgb.XGBClassifier(**params)
                    model.fit(X[tr_idx], y[tr_idx], eval_set=[(X[va_idx], y[va_idx])], verbose=False)
                    proba = model.predict_proba(X[va_idx])[:, 1]
                    scores.append(float(roc_auc_score(y[va_idx], proba)))
                return float(np.mean(scores)) if scores else 0.0
            finally:
                gc.collect()

        rem = max(0, OPTUNA_TRIALS - len(xgb_study.trials))
        logger.info("XGB Optuna remaining=%s", rem)
        if rem:
            xgb_study.optimize(xgb_obj, n_trials=rem, show_progress_bar=False)
        xgb_best = dict(xgb_study.best_params)

        cat_study = optuna.create_study(
            study_name=f"cat_{member_id}",
            direction="maximize",
            storage=optuna_db,
            load_if_exists=True,
            sampler=optuna.samplers.TPESampler(seed=SEED),
        )

        def cat_obj(trial: optuna.Trial) -> float:
            params = _cat_clf_params(trial, scale_pos_weight, device_mode)
            tscv = TimeSeriesSplit(n_splits=N_FOLDS)
            scores: list[float] = []
            indices = np.arange(len(y))
            try:
                for tr_idx, va_idx in tscv.split(indices):
                    if len(np.unique(y[tr_idx])) < 2 or len(np.unique(y[va_idx])) < 2:
                        continue
                    tr_df = train_df[tr_idx.tolist()]
                    va_df = train_df[va_idx.tolist()]
                    model = CatBoostClassifier(**params)
                    model.fit(
                        build_cat_pool(tr_df, feature_columns, y[tr_idx], cat_cols),
                        eval_set=build_cat_pool(va_df, feature_columns, y[va_idx], cat_cols),
                        use_best_model=True,
                    )
                    proba = model.predict_proba(
                        build_cat_pool(va_df, feature_columns, None, cat_cols)
                    )[:, 1]
                    scores.append(float(roc_auc_score(y[va_idx], proba)))
                return float(np.mean(scores)) if scores else 0.0
            finally:
                gc.collect()

        rem = max(0, OPTUNA_TRIALS - len(cat_study.trials))
        logger.info("Cat Optuna remaining=%s", rem)
        if rem:
            cat_study.optimize(cat_obj, n_trials=rem, show_progress_bar=False)
        cat_best = dict(cat_study.best_params)

        xgb_params = {
            **xgb_best,
            "objective": "binary:logistic",
            "eval_metric": "auc",
            "tree_method": "hist",
            "device": "cuda" if device_mode == "cuda" else "cpu",
            "random_state": SEED,
            "n_jobs": 1 if device_mode == "cuda" else -1,
            "verbosity": 0,
        }
        if "scale_pos_weight" not in xgb_params:
            xgb_params["scale_pos_weight"] = scale_pos_weight
        xgb_model = xgb.XGBClassifier(**xgb_params)
        xgb_model.fit(X, y)

        cat_params = {
            **cat_best,
            "loss_function": "Logloss",
            "eval_metric": "AUC",
            "task_type": "GPU" if device_mode == "cuda" else "CPU",
            "scale_pos_weight": scale_pos_weight,
            "random_seed": SEED,
            "verbose": False,
            "allow_writing_files": False,
        }
        cat_model = CatBoostClassifier(**cat_params)
        cat_model.fit(build_cat_pool(train_df, feature_columns, y, cat_cols))

        p = 0.5 * xgb_model.predict_proba(X)[:, 1] + 0.5 * cat_model.predict_proba(
            build_cat_pool(train_df, feature_columns, None, cat_cols)
        )[:, 1]
        metrics = {
            "train_roc_auc": float(roc_auc_score(y, p)),
            "train_accuracy": float(accuracy_score(y, (p >= 0.5).astype(int))),
            "train_f1": float(f1_score(y, (p >= 0.5).astype(int), zero_division=0)),
            "train_pr_auc": float(average_precision_score(y, p)),
            "holdout": "none",
        }
        cv_best = {
            "xgb_cv_auc": float(xgb_study.best_value) if xgb_study.best_trial else None,
            "cat_cv_auc": float(cat_study.best_value) if cat_study.best_trial else None,
        }
    else:
        xgb_study = optuna.create_study(
            study_name=f"xgb_{member_id}",
            direction="minimize",
            storage=optuna_db,
            load_if_exists=True,
            sampler=sampler,
        )

        def xgb_obj_r(trial: optuna.Trial) -> float:
            params = _xgb_reg_params(trial, device_mode)
            tscv = TimeSeriesSplit(n_splits=N_FOLDS)
            scores: list[float] = []
            try:
                for tr_idx, va_idx in tscv.split(X):
                    model = xgb.XGBRegressor(**params)
                    model.fit(X[tr_idx], y[tr_idx], eval_set=[(X[va_idx], y[va_idx])], verbose=False)
                    scores.append(_rmse(y[va_idx], model.predict(X[va_idx])))
                return float(np.mean(scores)) if scores else 1e9
            finally:
                gc.collect()

        rem = max(0, OPTUNA_TRIALS - len(xgb_study.trials))
        logger.info("XGB Optuna remaining=%s", rem)
        if rem:
            xgb_study.optimize(xgb_obj_r, n_trials=rem, show_progress_bar=False)
        xgb_best = dict(xgb_study.best_params)

        cat_study = optuna.create_study(
            study_name=f"cat_{member_id}",
            direction="minimize",
            storage=optuna_db,
            load_if_exists=True,
            sampler=optuna.samplers.TPESampler(seed=SEED),
        )

        def cat_obj_r(trial: optuna.Trial) -> float:
            params = _cat_reg_params(trial, device_mode)
            tscv = TimeSeriesSplit(n_splits=N_FOLDS)
            scores: list[float] = []
            indices = np.arange(len(y))
            try:
                for tr_idx, va_idx in tscv.split(indices):
                    tr_df = train_df[tr_idx.tolist()]
                    va_df = train_df[va_idx.tolist()]
                    model = CatBoostRegressor(**params)
                    model.fit(
                        build_cat_pool(tr_df, feature_columns, y[tr_idx], cat_cols),
                        eval_set=build_cat_pool(va_df, feature_columns, y[va_idx], cat_cols),
                        use_best_model=True,
                    )
                    pred = np.asarray(
                        model.predict(build_cat_pool(va_df, feature_columns, None, cat_cols)),
                        dtype=np.float64,
                    )
                    scores.append(_rmse(y[va_idx], pred))
                return float(np.mean(scores)) if scores else 1e9
            finally:
                gc.collect()

        rem = max(0, OPTUNA_TRIALS - len(cat_study.trials))
        logger.info("Cat Optuna remaining=%s", rem)
        if rem:
            cat_study.optimize(cat_obj_r, n_trials=rem, show_progress_bar=False)
        cat_best = dict(cat_study.best_params)

        xgb_params = {
            **xgb_best,
            "objective": "reg:squarederror",
            "eval_metric": "rmse",
            "tree_method": "hist",
            "device": "cuda" if device_mode == "cuda" else "cpu",
            "random_state": SEED,
            "n_jobs": 1 if device_mode == "cuda" else -1,
            "verbosity": 0,
        }
        xgb_model = xgb.XGBRegressor(**xgb_params)
        xgb_model.fit(X, y)

        cat_params = {
            **cat_best,
            "loss_function": "RMSE",
            "eval_metric": "RMSE",
            "task_type": "GPU" if device_mode == "cuda" else "CPU",
            "random_seed": SEED,
            "verbose": False,
            "allow_writing_files": False,
        }
        cat_model = CatBoostRegressor(**cat_params)
        cat_model.fit(build_cat_pool(train_df, feature_columns, y, cat_cols))

        pred = 0.5 * xgb_model.predict(X) + 0.5 * np.asarray(
            cat_model.predict(build_cat_pool(train_df, feature_columns, None, cat_cols)),
            dtype=np.float64,
        )
        metrics = {
            "train_rmse": _rmse(y, pred),
            "train_mae": float(mean_absolute_error(y, pred)),
            "train_r2": float(r2_score(y, pred)),
            "holdout": "none",
        }
        cv_best = {
            "xgb_cv_rmse": float(xgb_study.best_value) if xgb_study.best_trial else None,
            "cat_cv_rmse": float(cat_study.best_value) if cat_study.best_trial else None,
        }

    # SHAP (sample)
    n = X.shape[0]
    if n > 2000:
        rng = np.random.default_rng(SEED)
        idx = rng.choice(n, size=2000, replace=False)
        X_s = X[idx]
        df_s = train_df[idx.tolist()]
    else:
        X_s = X
        df_s = train_df
    try:
        xgb_shap = shap.TreeExplainer(xgb_model).shap_values(X_s)
        imp = _mean_abs_shap(xgb_shap)
        rows = [
            {"feature": feature_columns[i], "importance": float(imp[i])}
            for i in range(min(len(feature_columns), len(imp)))
        ]
        rows.sort(key=lambda r: r["importance"], reverse=True)
        pl.DataFrame(rows).write_csv(out_dir / "shap_xgb_importance.csv")
        with open(out_dir / "shap_xgb_importance.json", "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
    except Exception as exc:  # noqa: BLE001
        logger.warning("SHAP xgb skipped: %s", exc)

    xgb_model.save_model(out_dir / "xgb_model.json")
    cat_model.save_model(str(out_dir / "cat_model.cbm"))
    if encoder is not None:
        joblib.dump(encoder, out_dir / "encoder.pkl")
    with open(out_dir / "imputer_values.json", "w", encoding="utf-8") as f:
        json.dump(imputer, f, ensure_ascii=False, indent=2)
    with open(out_dir / "ensemble_config.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "weights": {"xgb": 0.5, "cat": 0.5},
                "task": task,
                "default_threshold": None,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    feature_types = {
        c: ("String" if c in cat_cols else "Float64") for c in feature_columns
    }
    metadata = {
        "member_id": member_id,
        "model_version": "2.0.0-voting",
        "train_date": datetime.now(timezone.utc).isoformat(),
        "dataset_hash": dataset_hash,
        "data_path": str(data_path).replace("\\", "/"),
        "target": target,
        "task": task,
        "seed": SEED,
        "n_folds": N_FOLDS,
        "optuna_trials": OPTUNA_TRIALS,
        "holdout": "none",
        "feature_columns": feature_columns,
        "feature_types": feature_types,
        "cat_features": cat_cols,
        "numeric_cols": numeric_cols,
        "device_mode": device_mode,
        "metrics": metrics,
        "cv_best": cv_best,
        "drop_extra": drop_extra,
        "n_rows": int(prepared.height),
    }
    with open(out_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    write_completion_markdown(member_id, out_dir, task, target)
    logger.info("Done member=%s metrics=%s", member_id, metrics)
    return metadata


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--member", type=str, default=None, help="Member id from MEMBERS")
    parser.add_argument("--data", type=str, default=None)
    parser.add_argument("--target", type=str, default=None)
    parser.add_argument("--out", type=str, default=None)
    parser.add_argument("--task", choices=["classification", "regression"], default=None)
    parser.add_argument("--optuna-db", type=str, default=None)
    parser.add_argument("--drop-extra", type=str, default="")
    args = parser.parse_args(argv)

    if args.member:
        if args.member not in MEMBERS:
            print(f"Unknown member {args.member}. Known: {list(MEMBERS)}", file=sys.stderr)
            return 2
        cfg = MEMBERS[args.member]
        member_id = args.member
        data_path = Path(cfg["data"])
        target = cfg["target"]
        out_dir = Path(cfg["out"])
        task = cfg["task"]  # type: ignore[assignment]
        optuna_db = cfg["optuna_db"]
        drop_extra = [x for x in cfg.get("drop_extra", "").split(",") if x]
    else:
        if not all([args.data, args.target, args.out, args.task]):
            print("Need --member or full --data/--target/--out/--task", file=sys.stderr)
            return 2
        member_id = Path(args.out).name
        data_path = Path(args.data)
        target = args.target
        out_dir = Path(args.out)
        task = args.task  # type: ignore[assignment]
        optuna_db = args.optuna_db or f"sqlite:///optuna_voting_{member_id}.db"
        drop_extra = [x for x in args.drop_extra.split(",") if x]

    train_member(member_id, data_path, target, out_dir, task, optuna_db, drop_extra)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
