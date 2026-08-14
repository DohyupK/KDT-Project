"""
Score recommended-weight ensemble → MariaDB `temp3` (KEEP table).

Order (must match voting_predict):
  1) capacity
  2) residual_li
  3) probability (cascade clf uses capacity/residual from steps 1–2)
  4) quality_defect = (probability >= 0.4)

Then evaluate threshold sweep FROM `temp3` rows vs CSV (not in-memory only).
CWD: ai-service/
"""
from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import polars as pl
import pymysql
import xgboost as xgb
from catboost import CatBoostClassifier, CatBoostRegressor, Pool
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
AI = ROOT / "ai-service"
sys.path.insert(0, str(AI))
os.chdir(AI)
load_dotenv(ROOT / ".env")

from voting_predict import _apply_imputer, _load_member, _maybe_domain  # noqa: E402
from train_pipeline import (  # noqa: E402
    CAT_COL,
    CAT_FILL,
    apply_imputer,
    build_cat_pool as clf_build_cat_pool,
    build_xgb_matrix as clf_build_xgb_matrix,
    ensemble_proba,
    prepare_feature_frame as clf_prepare,
)
from train_reg_pipeline import (  # noqa: E402
    build_cat_pool as reg_build_cat_pool,
    build_xgb_matrix as reg_build_xgb_matrix,
    ensemble_pred as reg_ensemble,
    prepare_feature_frame as reg_prepare,
)
from train_residual_pipeline import (  # noqa: E402
    build_cat_pool as res_build_cat_pool,
    build_xgb_matrix as res_build_xgb_matrix,
    prepare_feature_frame as res_prepare,
)
from train_residual_pipeline import ensemble_pred as res_ensemble  # noqa: E402

BACKUP = AI / "temp/models_backup_2026-08-10"
OUT_JSON = ROOT / "Documents/TopSecret/members/_eval_recommended_temp3.json"
OUT_DOC = ROOT / "Documents/TopSecret/members/recommended_temp3_test.md"
SUMMARY = ROOT / "Documents/TopSecret/members/summary_15_models_plain.md"
DDL = ROOT / "DB/temp3_recommended.sql"

W_CAP = {
    "legacy_reg": 4,
    "reg_d50": 3,
    "reg_d90": 3,
    "reg_feature": 2,
    "cathode_feature_cap": 2,
    "cathode_special_cap": 1,
}
W_RES = {
    "legacy_res": 4,
    "residual_d50": 3,
    "residual_d90": 2,
    "residual_feature": 2,
    "cathode_feature_res": 1,
}
W_PROB = {
    "clf_d90": 4,
    "legacy_clf": 3,
    "clf_d50": 2,
    "clf_feature": 2,
    "cathode_feature_clf": 1,
    "cathode_special_clf": 1,
}
VOTING_DIRS = {
    "reg_d50": "models/voting/reg_d50",
    "reg_d90": "models/voting/reg_d90",
    "reg_feature": "models/voting/reg_feature",
    "cathode_feature_cap": "models/voting/cathode_feature/cap",
    "cathode_special_cap": "models/voting/cathode_special/cap",
    "residual_d50": "models/voting/residual_d50",
    "residual_d90": "models/voting/residual_d90",
    "residual_feature": "models/voting/residual_feature",
    "cathode_feature_res": "models/voting/cathode_feature/res",
    "clf_d50": "models/voting/clf_d50",
    "clf_d90": "models/voting/clf_d90",
    "clf_feature": "models/voting/clf_feature",
    "cathode_feature_clf": "models/voting/cathode_feature/clf",
    "cathode_special_clf": "models/voting/cathode_special/clf",
}
THR_STORE = 0.4


def db():
    return pymysql.connect(
        host=os.environ.get("DB_HOST") or "127.0.0.1",
        port=int(os.environ.get("DB_PORT") or 3306),
        user=os.environ.get("DB_USER") or "root",
        password=os.environ.get("DB_PASSWORD") or "",
        database=os.environ.get("DB_NAME") or "kdt",
        charset="utf8mb4",
    )


def weighted_avg(preds, weights):
    num = None
    den = 0.0
    for k, w in weights.items():
        if w <= 0:
            continue
        p = preds[k]
        num = p * w if num is None else num + p * w
        den += w
    return num / den


def predict_voting_member(dir_rel, feat_df):
    bundle = _load_member(Path(dir_rel))
    meta = bundle["meta"]
    feature_columns = meta["feature_columns"]
    numeric_cols = meta.get("numeric_cols") or [c for c in feature_columns if c != CAT_COL]
    cat_cols = meta.get("cat_features") or []
    df = feat_df
    for c in feature_columns:
        if c not in df.columns:
            fill = CAT_FILL if c == CAT_COL else None
            df = df.with_columns(pl.lit(fill).alias(c))
    df = _maybe_domain(df)
    df = _apply_imputer(df, bundle["imputer"])
    df = df.select([c for c in feature_columns if c in df.columns])
    parts = []
    nums = [c for c in numeric_cols if c in df.columns]
    if nums:
        parts.append(df.select(nums).to_numpy().astype(np.float64))
    if cat_cols and bundle["encoder"] is not None:
        parts.append(
            bundle["encoder"].transform(df.select(cat_cols).to_numpy()).astype(np.float64)
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
        return (
            0.5 * bundle["xgb"].predict_proba(X)[:, 1]
            + 0.5 * bundle["cat"].predict_proba(pool)[:, 1]
        )
    p_xgb = bundle["xgb"].predict(X).astype(np.float64)
    p_cat = np.asarray(bundle["cat"].predict(pool), dtype=np.float64).reshape(-1)
    return 0.5 * p_xgb + 0.5 * p_cat


def predict_legacy_clf(df_raw):
    prepared, feature_columns, numeric_cols = clf_prepare(df_raw)
    imputer = json.loads((BACKUP / "imputer_values.json").read_text(encoding="utf-8"))
    encoder = joblib.load(BACKUP / "encoder.pkl")
    prepared = apply_imputer(prepared, imputer)
    X = clf_build_xgb_matrix(prepared, numeric_cols, encoder)
    xgb_m = xgb.XGBClassifier()
    xgb_m.load_model(BACKUP / "xgb_model.json")
    try:
        xgb_m.set_params(device="cpu")
    except Exception:
        pass
    cat_m = CatBoostClassifier()
    cat_m.load_model(str(BACKUP / "cat_model.cbm"))
    return ensemble_proba(
        xgb_m.predict_proba(X)[:, 1],
        cat_m.predict_proba(clf_build_cat_pool(prepared, feature_columns))[:, 1],
    )


def predict_legacy_reg(df_raw):
    models = BACKUP / "reg"
    prepared, feature_columns, numeric_cols = reg_prepare(df_raw)
    imputer = json.loads((models / "imputer_values.json").read_text(encoding="utf-8"))
    encoder = joblib.load(models / "encoder.pkl")
    prepared = apply_imputer(prepared, imputer)
    X = reg_build_xgb_matrix(prepared, numeric_cols, encoder)
    xgb_m = xgb.XGBRegressor()
    xgb_m.load_model(models / "xgb_model.json")
    try:
        xgb_m.set_params(device="cpu")
    except Exception:
        pass
    cat_m = CatBoostRegressor()
    cat_m.load_model(str(models / "cat_model.cbm"))
    return reg_ensemble(
        xgb_m.predict(X),
        np.asarray(cat_m.predict(reg_build_cat_pool(prepared, feature_columns)), dtype=np.float64),
    )


def predict_legacy_res(df_raw):
    models = BACKUP / "residual"
    prepared, feature_columns, numeric_cols = res_prepare(df_raw)
    imputer = json.loads((models / "imputer_values.json").read_text(encoding="utf-8"))
    encoder = joblib.load(models / "encoder.pkl")
    prepared = apply_imputer(prepared, imputer)
    X = res_build_xgb_matrix(prepared, numeric_cols, encoder)
    xgb_m = xgb.XGBRegressor()
    xgb_m.load_model(models / "xgb_model.json")
    try:
        xgb_m.set_params(device="cpu")
    except Exception:
        pass
    cat_m = CatBoostRegressor()
    cat_m.load_model(str(models / "cat_model.cbm"))
    return res_ensemble(
        xgb_m.predict(X),
        np.asarray(cat_m.predict(res_build_cat_pool(prepared, feature_columns)), dtype=np.float64),
    )


def reg_metrics(y_true, y_pred):
    n = len(y_true)
    err = [p - t for p, t in zip(y_pred, y_true)]
    sq = [e * e for e in err]
    mae = sum(abs(e) for e in err) / n
    rmse = math.sqrt(sum(sq) / n)
    mx = sum(y_true) / n
    my = sum(y_pred) / n
    num = sum((a - mx) * (b - my) for a, b in zip(y_true, y_pred))
    dx = math.sqrt(sum((a - mx) ** 2 for a in y_true))
    dy = math.sqrt(sum((b - my) ** 2 for b in y_pred))
    r = num / (dx * dy) if dx and dy else None
    ss = sum((t - mx) ** 2 for t in y_true)
    r2 = 1 - sum(sq) / ss if ss else None
    return {
        "n": n,
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "pearson_r": None if r is None else round(r, 6),
        "r2": None if r2 is None else round(r2, 6),
        "true_mean": round(mx, 4),
        "pred_mean": round(my, 4),
    }


def clf_at(y_true, probs, t):
    tp = fp = tn = fn = 0
    for yt, p in zip(y_true, probs):
        pred = 1 if p >= t else 0
        if pred == 1 and yt == 1:
            tp += 1
        elif pred == 1 and yt == 0:
            fp += 1
        elif pred == 0 and yt == 0:
            tn += 1
        else:
            fn += 1
    n = tp + fp + tn + fn
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    acc = (tp + tn) / n if n else 0.0
    f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
    return {
        "threshold": round(t, 2),
        "n_pred_pos": tp + fp,
        "pred_pos_rate": round((tp + fp) / n, 6) if n else 0,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "accuracy": round(acc, 6),
        "precision": round(prec, 6),
        "recall": round(rec, 6),
        "f1": round(f1, 6),
    }


def pct(x):
    return f"{x * 100:.2f}%"


def main():
    pipeline_order = [
        "1. capacity (weighted members + legacy_reg)",
        "2. residual_li (weighted members + legacy_res)",
        "3. probability (clf + cascade using capacity/residual from 1–2 + legacy_clf)",
        "4. quality_defect = 1 if probability >= 0.4 else 0",
        "5. INSERT temp3 columns in that semantic order",
    ]
    print("PIPELINE_ORDER")
    for line in pipeline_order:
        print(" ", line)

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT lot_id FROM `temp` ORDER BY lot_id ASC")
            temp_ids = [str(r[0]) for r in cur.fetchall()]
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS `temp3` (
                  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
                  quality_defect  TINYINT(1)   NOT NULL,
                  capacity        DOUBLE       NULL,
                  residual_li     DOUBLE       NULL,
                  probability     DOUBLE       NULL,
                  spc             VARCHAR(16)  NULL
                )
                """
            )
            cur.execute("TRUNCATE TABLE `temp3`")
        conn.commit()
    finally:
        conn.close()

    DDL.write_text(
        """-- Recommended-weight ensemble scratch (KEEP; do not drop without approval).
-- Filled by ai-service/scripts/score_recommended_to_temp3.py
-- Inference order: capacity → residual_li → probability → quality_defect

CREATE TABLE IF NOT EXISTS `temp3` (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL,
  residual_li     DOUBLE       NULL,
  probability     DOUBLE       NULL,
  spc             VARCHAR(16)  NULL
);
""",
        encoding="utf-8",
    )

    order = pl.DataFrame({"id": temp_ids, "_ord": list(range(len(temp_ids)))})
    clf_csv = pl.read_csv(AI / "data/cathode_clf_data.csv")
    reg_csv = pl.read_csv(AI / "data/cathode_reg_data.csv")
    qc_csv = pl.read_csv(AI / "data/cathode_qc_reg_data.csv")
    clf_j = order.join(clf_csv, on="id").sort("_ord")
    reg_j = order.join(reg_csv, on="id").sort("_ord")
    qc_j = order.join(qc_csv, on="id").sort("_ord")
    assert clf_j.height == 10000
    feat = clf_j.select(
        [
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
        ]
    )

    # --- 1) capacity ---
    print("STEP1_capacity")
    cap_preds = {
        mid: predict_voting_member(VOTING_DIRS[mid], feat)
        for mid in ("reg_d50", "reg_d90", "reg_feature", "cathode_feature_cap", "cathode_special_cap")
    }
    cap_preds["legacy_reg"] = predict_legacy_reg(reg_j.drop("_ord"))
    capacity = weighted_avg(cap_preds, W_CAP)

    # --- 2) residual_li ---
    print("STEP2_residual_li")
    res_preds = {
        mid: predict_voting_member(VOTING_DIRS[mid], feat)
        for mid in ("residual_d50", "residual_d90", "residual_feature", "cathode_feature_res")
    }
    res_preds["legacy_res"] = predict_legacy_res(qc_j.drop("_ord"))
    residual = weighted_avg(res_preds, W_RES)

    # --- 3) probability (cascade uses steps 1–2) ---
    print("STEP3_probability")
    feat_cascade = feat.with_columns(
        [pl.Series("capacity", capacity), pl.Series("residual_li", residual)]
    )
    prob_preds = {
        mid: predict_voting_member(VOTING_DIRS[mid], feat)
        for mid in ("clf_d50", "clf_d90", "clf_feature")
    }
    for mid in ("cathode_feature_clf", "cathode_special_clf"):
        prob_preds[mid] = predict_voting_member(VOTING_DIRS[mid], feat_cascade)
    prob_preds["legacy_clf"] = predict_legacy_clf(clf_j.drop("_ord"))
    probability = weighted_avg(prob_preds, W_PROB)

    # --- 4) quality_defect ---
    print("STEP4_quality_defect thr=", THR_STORE)
    qd = (probability >= THR_STORE).astype(np.int64)

    ids = clf_j["id"].to_list()
    conn = db()
    try:
        with conn.cursor() as cur:
            batch = [
                (
                    str(ids[i]),
                    int(qd[i]),
                    float(capacity[i]),
                    float(residual[i]),
                    float(probability[i]),
                    None,
                )
                for i in range(len(ids))
            ]
            cur.executemany(
                "INSERT INTO `temp3` (lot_id, quality_defect, capacity, residual_li, probability, spc) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                batch,
            )
            cur.execute("SELECT COUNT(*) FROM `temp3`")
            n_temp3 = cur.fetchone()[0]
            # Read back FROM temp3 for evaluation (source of truth for this report)
            cur.execute(
                "SELECT lot_id, quality_defect, capacity, residual_li, probability "
                "FROM `temp3` ORDER BY lot_id ASC"
            )
            rows = cur.fetchall()
        conn.commit()
    finally:
        conn.close()
    print("TEMP3_ROWS", n_temp3)

    # Join CSV labels by lot_id from temp3 readback
    t3 = pl.DataFrame(
        {
            "id": [str(r[0]) for r in rows],
            "t3_qd": [int(r[1]) for r in rows],
            "t3_cap": [float(r[2]) for r in rows],
            "t3_res": [float(r[3]) for r in rows],
            "t3_prob": [float(r[4]) for r in rows],
        }
    )
    j = (
        t3.join(clf_csv.select(["id", pl.col("quality_defect").cast(pl.Int64)]), on="id")
        .join(reg_csv.select(["id", "capacity"]), on="id")
        .join(qc_csv.select(["id", "residual_li"]), on="id")
    )
    assert j.height == 10000, j.height

    # Verify stored qd matches prob>=0.4 from temp3 itself
    qd_ok = sum(
        1
        for q, p in zip(j["t3_qd"].to_list(), j["t3_prob"].to_list())
        if q == (1 if p >= THR_STORE else 0)
    )

    y_def = [int(x) for x in j["quality_defect"].to_list()]
    y_cap = [float(x) for x in j["capacity"].to_list()]
    y_res = [float(x) for x in j["residual_li"].to_list()]
    p_cap = [float(x) for x in j["t3_cap"].to_list()]
    p_res = [float(x) for x in j["t3_res"].to_list()]
    probs = [float(x) for x in j["t3_prob"].to_list()]

    cap_m = reg_metrics(y_cap, p_cap)
    res_m = reg_metrics(y_res, p_res)
    thresholds = [round(0.1 + i * 0.05, 2) for i in range(0, 19)]
    sweep = [clf_at(y_def, probs, t) for t in thresholds]
    at04 = clf_at(y_def, probs, 0.4)

    result = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "source": "MariaDB temp3 READBACK vs CSV (not in-memory-only)",
        "temp3_rows": n_temp3,
        "joined": j.height,
        "pipeline_order": pipeline_order,
        "quality_defect_store_rule": "probability >= 0.4",
        "temp3_qd_matches_prob_ge_0_4": qd_ok,
        "weights": {"capacity": W_CAP, "residual_li": W_RES, "probability": W_PROB},
        "denominators": {
            "capacity": sum(W_CAP.values()),
            "residual_li": sum(W_RES.values()),
            "probability": sum(W_PROB.values()),
        },
        "capacity": cap_m,
        "residual_li": res_m,
        "probability_mean": round(sum(probs) / len(probs), 6),
        "at_0_4": at04,
        "threshold_sweep_0_05": sweep,
    }
    OUT_JSON.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    # Build report from temp3
    table_lines = [
        "| 임계값 | 검사 LOT 수 | 검사 비율 | 불량 포착률 | 정밀도 | 놓친 불량 수 |",
        "|--------|------------:|----------:|------------:|-------:|-------------:|",
    ]
    for s in sweep:
        t = s["threshold"]
        mark = "**" if abs(t - 0.4) < 1e-9 else ""
        table_lines.append(
            f"| {mark}{t:.2f}{mark} | {mark}{s['n_pred_pos']}{mark} | "
            f"{mark}{pct(s['pred_pos_rate'])}{mark} | {mark}{pct(s['recall'])}{mark} | "
            f"{mark}{pct(s['precision'])}{mark} | {mark}{s['fn']}{mark} |"
        )
    table_md = "\n".join(table_lines)

    doc = f"""# 추천 가중 실험 · `temp3` (테이블 유지)

최종 갱신: 2026-08-11  
가정: [`summary_15_models_plain.md`](./summary_15_models_plain.md) §5 추천 가중  
측정 출처: **MariaDB `` `temp3` `` READBACK** ∩ CSV (미매칭 0). in-memory 우회 없음.

## 테이블·원복 방침

| 항목 | 상태 |
|------|------|
| `` `temp3` `` | **유지** (DROP 금지 · 이번 지시) |
| DDL | [`DB/temp3_recommended.sql`](../../../DB/temp3_recommended.sql) |
| 채점 스크립트 | [`ai-service/scripts/score_recommended_to_temp3.py`](../../../ai-service/scripts/score_recommended_to_temp3.py) |
| `voting_config.json` | **미변경** |
| `` `temp` `` / `judgment_lots` | **미변경** |
| 원숫자 | [`_eval_recommended_temp3.json`](./_eval_recommended_temp3.json) |

## 추론 순서 확인

코드·실행 로그상 **아래 순서로만** 계산한 뒤 INSERT한다 (`voting_predict`와 동일 cascade).

1. **capacity** (가중합)
2. **residual_li** (가중합)
3. **probability** (clf + cascade; cascade 입력 = 1·2의 예측값)
4. **quality_defect** = `probability ≥ 0.4`
5. `` `temp3` ``에 lot_id / quality_defect / capacity / residual_li / probability 기록

검증: `` `temp3`.quality_defect`` ↔ `(probability ≥ 0.4)` 일치 **{qd_ok}/10000**.

## 적용 가중

**capacity** /{sum(W_CAP.values())}: `{json.dumps(W_CAP, ensure_ascii=False)}`  
**residual** /{sum(W_RES.values())}: `{json.dumps(W_RES, ensure_ascii=False)}`  
**probability** /{sum(W_PROB.values())}: `{json.dumps(W_PROB, ensure_ascii=False)}`

## 결과 (temp3 1만 · CSV 실측)

| 항목 | 값 |
|------|-----|
| temp3 행 수 | **{n_temp3}** |
| 용량 MAE / R² | **{cap_m['mae']}** / {cap_m['r2']} |
| 잔류 MAE / R² | **{res_m['mae']}** / {res_m['r2']} |
| 불량@0.4 맞춤 / 놓침 / 포착 | **{pct(at04['accuracy'])}** / **{at04['fn']}** / {pct(at04['recall'])} |

### 임계값별 검사·포착 (T = 0.10 ~ 1.00, 0.05 단위)

**출처: `temp3.probability` vs CSV `quality_defect`.**  
예측 불량 = `temp3.probability ≥ T`. 실제 불량 = CSV **866건**/10000.

{table_md}

## 판정

- 본 표·지표는 `` `temp3` ``에 INSERT한 뒤 **DB에서 다시 읽어** CSV와 대조한 값이다.
- 추론 순서는 capacity → residual_li → probability → quality_defect 이다.
"""
    OUT_DOC.write_text(doc, encoding="utf-8")

    # Update summary §5.5 table block if present
    sum_txt = SUMMARY.read_text(encoding="utf-8")
    block_start = sum_txt.find("#### 임계값별 검사·포착 (추천가중 temp3")
    if block_start < 0:
        block_start = sum_txt.find("### 5.5 실험 결과")
    marker = "**판정:** 현 투표 대비"
    if marker in sum_txt:
        insert = (
            "\n#### 임계값별 검사·포착 (추천가중 temp3, **DB `temp3` READBACK**, 0.05 단위)\n\n"
            "상세·유지: [`recommended_temp3_test.md`](./recommended_temp3_test.md) · 테이블 `` `temp3` `` **유지**\n\n"
            f"{table_md}\n\n"
            f"추론 순서 확인: capacity → residual_li → probability → quality_defect "
            f"(qd↔prob≥0.4 = {qd_ok}/10000).\n\n"
        )
        # Remove old threshold subsection between 5.5 and 판정 if any
        if "#### 임계값별 검사·포착 (추천가중 temp3" in sum_txt:
            a = sum_txt.find("#### 임계값별 검사·포착 (추천가중 temp3")
            b = sum_txt.find(marker)
            if a >= 0 and b > a:
                sum_txt = sum_txt[:a] + insert + sum_txt[b:]
            else:
                sum_txt = sum_txt.replace(marker, insert + marker, 1)
        else:
            sum_txt = sum_txt.replace(marker, insert + marker, 1)
        # Fix old "원복 완료" wording for temp3
        sum_txt = sum_txt.replace(
            "### 5.5 실험 결과 (`temp3`, 원복 완료)",
            "### 5.5 실험 결과 (`temp3` **유지**)",
        )
        sum_txt = sum_txt.replace(
            "`voting_config`·`` `temp` ``는 **미변경**. `` `temp3` ``는 평가 후 DROP.",
            "`voting_config`·`` `temp` ``는 **미변경**. `` `temp3` ``는 **유지** (2026-08-11 재측정).",
        )
        SUMMARY.write_text(sum_txt, encoding="utf-8")

    print(json.dumps({"temp3_rows": n_temp3, "qd_ok": qd_ok, "at_0_4": at04, "cap": cap_m, "res": res_m}, indent=2))
    print("WROTE", OUT_DOC)
    print("TEMP3_KEPT")


if __name__ == "__main__":
    main()
