"""
Offline holdout re-score for clf / reg / residual (no Optuna, no retrain).

Replays chronological 20% test split on current CSV + saved artifacts,
compares metrics to models/*/metadata.json.

Usage (CWD = ai-service/):
  python scripts/evaluate_models.py
  python scripts/evaluate_models.py --heads clf,reg
  python scripts/evaluate_models.py --out logs/eval_report.json
  python scripts/evaluate_models.py --api   # optional alive smoke (not metrics)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import xgboost as xgb
from catboost import CatBoostClassifier, CatBoostRegressor

AI_ROOT = Path(__file__).resolve().parent.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))
os.chdir(AI_ROOT)

from train_pipeline import (  # noqa: E402
    CAT_COL,
    TARGET_COL as CLF_TARGET,
    MODELS_DIR as CLF_MODELS,
    apply_imputer,
    build_cat_pool as clf_build_cat_pool,
    build_xgb_matrix as clf_build_xgb_matrix,
    chronological_train_test_indices,
    compute_metrics as clf_compute_metrics,
    ensemble_proba,
    load_raw_csv as clf_load_raw,
    prepare_feature_frame as clf_prepare,
    sha256_file,
    validate_schema as clf_validate,
)
from train_reg_pipeline import (  # noqa: E402
    DATA_PATH as REG_DATA,
    MODELS_DIR as REG_MODELS,
    TARGET_COL as REG_TARGET,
    build_cat_pool as reg_build_cat_pool,
    build_xgb_matrix as reg_build_xgb_matrix,
    compute_metrics as reg_compute_metrics,
    ensemble_pred,
    load_raw_csv as reg_load_raw,
    prepare_feature_frame as reg_prepare,
    validate_schema as reg_validate,
)
from train_residual_pipeline import (  # noqa: E402
    DATA_PATH as RES_DATA,
    MODELS_DIR as RES_MODELS,
    TARGET_COL as RES_TARGET,
    build_cat_pool as res_build_cat_pool,
    build_xgb_matrix as res_build_xgb_matrix,
    compute_metrics as res_compute_metrics,
    load_raw_csv as res_load_raw,
    prepare_feature_frame as res_prepare,
    validate_schema as res_validate,
)
from train_residual_pipeline import ensemble_pred as res_ensemble_pred  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("evaluate_models")

RTOL = 1e-4
ATOL = 1e-5


def _close(a: float, b: float) -> bool:
    return bool(np.isclose(a, b, rtol=RTOL, atol=ATOL))


def _metrics_match(
    computed: dict[str, float], saved: dict[str, float]
) -> dict[str, bool]:
    out: dict[str, bool] = {}
    for k, v in saved.items():
        if k not in computed:
            out[k] = False
            continue
        out[k] = _close(float(computed[k]), float(v))
    return out


def _load_json(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def evaluate_clf() -> dict[str, Any]:
    meta_path = CLF_MODELS / "metadata.json"
    meta = _load_json(meta_path)
    saved = dict(meta.get("metrics") or {})
    ens = _load_json(CLF_MODELS / "ensemble_config.json")
    threshold = float(
        ens.get("default_threshold")
        or saved.get("applied_eval_threshold")
        or 0.5
    )

    raw = clf_load_raw()
    clf_validate(raw)
    prepared, feature_columns, numeric_cols = clf_prepare(raw)
    y_all = prepared[CLF_TARGET].to_numpy().astype(np.int64)
    _, test_idx = chronological_train_test_indices(prepared.height, test_size=0.2)
    test_df = prepared[test_idx.tolist()]
    y_test = y_all[test_idx]

    imputer = _load_json(CLF_MODELS / "imputer_values.json")
    encoder = joblib.load(CLF_MODELS / "encoder.pkl")
    test_df = apply_imputer(test_df, imputer)
    X_test = clf_build_xgb_matrix(test_df, numeric_cols, encoder)

    xgb_model = xgb.XGBClassifier()
    xgb_model.load_model(CLF_MODELS / "xgb_model.json")
    try:
        xgb_model.set_params(device="cpu")
    except Exception:  # noqa: BLE001
        pass
    cat_model = CatBoostClassifier()
    cat_model.load_model(str(CLF_MODELS / "cat_model.cbm"))

    p_xgb = xgb_model.predict_proba(X_test)[:, 1]
    p_cat = cat_model.predict_proba(clf_build_cat_pool(test_df, feature_columns))[:, 1]
    proba = ensemble_proba(p_xgb, p_cat)
    metrics = clf_compute_metrics(y_test, proba, threshold=threshold)
    metrics["applied_eval_threshold"] = threshold

    ds_hash = sha256_file(Path("data/cathode_clf_data.csv"))
    return {
        "head": "clf",
        "n_test": int(len(test_idx)),
        "dataset_hash_now": ds_hash,
        "dataset_hash_meta": meta.get("dataset_hash"),
        "metrics": metrics,
        "metadata_metrics": saved,
        "match": _metrics_match(metrics, saved),
        "model_version": meta.get("model_version"),
    }


def _evaluate_regressor(
    *,
    head: str,
    models_dir: Path,
    data_path: Path,
    target_col: str,
    load_raw,
    validate,
    prepare,
    build_xgb,
    build_cat,
    compute_metrics_fn,
    ensemble_fn,
) -> dict[str, Any]:
    meta = _load_json(models_dir / "metadata.json")
    saved = dict(meta.get("metrics") or {})

    raw = load_raw()
    validate(raw)
    prepared, feature_columns, numeric_cols = prepare(raw)
    y_all = prepared[target_col].to_numpy().astype(np.float64)
    _, test_idx = chronological_train_test_indices(prepared.height, test_size=0.2)
    test_df = prepared[test_idx.tolist()]
    y_test = y_all[test_idx]

    imputer = _load_json(models_dir / "imputer_values.json")
    encoder = joblib.load(models_dir / "encoder.pkl")
    test_df = apply_imputer(test_df, imputer)
    X_test = build_xgb(test_df, numeric_cols, encoder)

    xgb_model = xgb.XGBRegressor()
    xgb_model.load_model(models_dir / "xgb_model.json")
    try:
        xgb_model.set_params(device="cpu")
    except Exception:  # noqa: BLE001
        pass
    cat_model = CatBoostRegressor()
    cat_model.load_model(str(models_dir / "cat_model.cbm"))

    p_xgb = xgb_model.predict(X_test)
    p_cat = np.asarray(
        cat_model.predict(build_cat(test_df, feature_columns)),
        dtype=np.float64,
    )
    y_pred = ensemble_fn(p_xgb, p_cat)
    metrics = compute_metrics_fn(y_test, y_pred)

    return {
        "head": head,
        "n_test": int(len(test_idx)),
        "dataset_hash_now": sha256_file(data_path),
        "dataset_hash_meta": meta.get("dataset_hash"),
        "metrics": metrics,
        "metadata_metrics": saved,
        "match": _metrics_match(metrics, saved),
        "model_version": meta.get("model_version"),
    }


def evaluate_reg() -> dict[str, Any]:
    return _evaluate_regressor(
        head="reg",
        models_dir=REG_MODELS,
        data_path=REG_DATA,
        target_col=REG_TARGET,
        load_raw=reg_load_raw,
        validate=reg_validate,
        prepare=reg_prepare,
        build_xgb=reg_build_xgb_matrix,
        build_cat=reg_build_cat_pool,
        compute_metrics_fn=reg_compute_metrics,
        ensemble_fn=ensemble_pred,
    )


def evaluate_residual() -> dict[str, Any]:
    return _evaluate_regressor(
        head="residual",
        models_dir=RES_MODELS,
        data_path=RES_DATA,
        target_col=RES_TARGET,
        load_raw=res_load_raw,
        validate=res_validate,
        prepare=res_prepare,
        build_xgb=res_build_xgb_matrix,
        build_cat=res_build_cat_pool,
        compute_metrics_fn=res_compute_metrics,
        ensemble_fn=res_ensemble_pred,
    )


def _print_head(result: dict[str, Any]) -> None:
    head = result["head"]
    print(f"\n=== {head} ===")
    print(f"model_version: {result.get('model_version')}")
    print(f"n_test: {result.get('n_test')}")
    hash_ok = result.get("dataset_hash_now") == result.get("dataset_hash_meta")
    print(f"dataset_hash match: {hash_ok}")
    print(f"{'metric':<28} {'computed':>14} {'metadata':>14} {'match':>6}")
    metrics = result["metrics"]
    saved = result["metadata_metrics"]
    match = result["match"]
    keys = list(dict.fromkeys([*saved.keys(), *metrics.keys()]))
    for k in keys:
        c = metrics.get(k)
        s = saved.get(k)
        m = match.get(k, False) if k in saved else ""
        c_s = f"{c:.6g}" if isinstance(c, (int, float)) else str(c)
        s_s = f"{s:.6g}" if isinstance(s, (int, float)) else str(s)
        print(f"{k:<28} {c_s:>14} {s_s:>14} {str(m):>6}")


def _api_smoke(base: str) -> dict[str, Any]:
    """POST one raw row to each predict endpoint (alive check, not accuracy)."""
    raw = clf_load_raw()
    row = raw.head(1)
    body: dict[str, Any] = {
        "d50": float(row["d50"][0]),
        "d90": float(row["d90"][0]),
        "metal_impurity": float(row["metal_impurity"][0]),
        "lithium_input": float(row["lithium_input"][0]),
        "additive_ratio": float(row["additive_ratio"][0]),
        "process_time": float(row["process_time"][0]),
        "sintering_temp": float(row["sintering_temp"][0]),
        "humidity": float(row["humidity"][0]),
        "tank_pressure": float(row["tank_pressure"][0]),
        "operator_id": str(row[CAT_COL][0]),
    }
    paths = {
        "clf": "/predict",
        "reg": "/predict-capacity",
        "residual": "/predict-residual",
    }
    out: dict[str, Any] = {}
    for name, path in paths.items():
        url = base.rstrip("/") + path
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                payload = json.loads(res.read().decode("utf-8"))
                out[name] = {"status": int(res.status), "ok": True, "keys": list(payload.keys())}
        except urllib.error.HTTPError as e:
            out[name] = {"status": int(e.code), "ok": False, "error": e.read()[:200].decode()}
        except Exception as exc:  # noqa: BLE001
            out[name] = {"status": 0, "ok": False, "error": str(exc)}
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Holdout re-score for ML heads")
    parser.add_argument(
        "--heads",
        default="clf,reg,residual",
        help="Comma-separated: clf,reg,residual",
    )
    parser.add_argument(
        "--out",
        default="logs/eval_report.json",
        help="JSON report path (relative to ai-service/)",
    )
    parser.add_argument(
        "--api",
        action="store_true",
        help="Also smoke POST /predict* (requires running ai-service)",
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("SMOKE_AI_URL", "http://127.0.0.1:8800"),
    )
    args = parser.parse_args()

    heads = [h.strip().lower() for h in args.heads.split(",") if h.strip()]
    runners = {
        "clf": evaluate_clf,
        "reg": evaluate_reg,
        "residual": evaluate_residual,
    }
    unknown = [h for h in heads if h not in runners]
    if unknown:
        logger.error("Unknown heads: %s", unknown)
        return 2

    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cwd": str(AI_ROOT.resolve()),
        "heads": [],
    }
    all_ok = True
    for h in heads:
        logger.info("Evaluating %s ...", h)
        try:
            result = runners[h]()
        except Exception as exc:  # noqa: BLE001
            logger.exception("%s failed: %s", h, exc)
            result = {"head": h, "error": str(exc), "match": {}, "metrics": {}}
            all_ok = False
        report["heads"].append(result)
        if "error" not in result:
            _print_head(result)
            if result.get("dataset_hash_now") != result.get("dataset_hash_meta"):
                logger.warning(
                    "%s: CSV hash differs from metadata — metrics may not match train-time",
                    h,
                )
            if not all(result.get("match", {}).values()):
                all_ok = False
        else:
            print(f"\n=== {h} ERROR ===\n{result['error']}")

    if args.api:
        print("\n=== API smoke ===")
        smoke = _api_smoke(args.api_url)
        report["api_smoke"] = smoke
        for name, info in smoke.items():
            print(f"{name}: ok={info.get('ok')} status={info.get('status')}")
            if not info.get("ok"):
                all_ok = False

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {out_path.resolve()}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
