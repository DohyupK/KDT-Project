"""
Per-member voting evaluation vs CSV (same 10k join as temp ensemble reports).

CWD: ai-service/
Writes:
  Documents/TopSecret/members/_eval_members.json
  Documents/TopSecret/members/README.md
  Documents/TopSecret/members/<id>/model_quality.md
  Documents/TopSecret/members/<id>/report.md  (probability-like scores only)
"""
from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import polars as pl
import pymysql
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
AI = ROOT / "ai-service"
sys.path.insert(0, str(AI))
os.chdir(AI)

load_dotenv(ROOT / ".env")

from voting_predict import (  # noqa: E402
    _apply_imputer,
    _load_member,
    _maybe_domain,
    load_voting_config,
    residual_to_score,
)
from train_pipeline import CAT_COL, CAT_FILL  # noqa: E402

from catboost import Pool  # noqa: E402

OUT_DIR = ROOT / "Documents/TopSecret/members"
CLF_CSV = AI / "data/cathode_clf_data.csv"
REG_CSV = AI / "data/cathode_reg_data.csv"
QC_CSV = AI / "data/cathode_qc_reg_data.csv"


def pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx == 0 or dy == 0:
        return None
    return num / (dx * dy)


def reg_metrics(y_true: list[float], y_pred: list[float]) -> dict:
    n = len(y_true)
    err = [p - t for p, t in zip(y_pred, y_true)]
    sq = [e * e for e in err]
    mae = sum(abs(e) for e in err) / n
    rmse = math.sqrt(sum(sq) / n)
    mape_terms = [abs(e) / abs(t) for e, t in zip(err, y_true) if t != 0]
    mape = (sum(mape_terms) / len(mape_terms)) if mape_terms else None
    bias = sum(err) / n
    r = pearson(y_true, y_pred)
    my = sum(y_true) / n
    ss_tot = sum((t - my) ** 2 for t in y_true)
    r2 = 1 - sum(sq) / ss_tot if ss_tot else None
    return {
        "n": n,
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "bias_pred_minus_true": round(bias, 4),
        "mape": None if mape is None else round(mape, 6),
        "pearson_r": None if r is None else round(r, 6),
        "r2": None if r2 is None else round(r2, 6),
        "true_mean": round(sum(y_true) / n, 4),
        "pred_mean": round(sum(y_pred) / n, 4),
        "pred_min": round(min(y_pred), 4),
        "pred_max": round(max(y_pred), 4),
    }


def clf_at_threshold(y_true: list[int], probs: list[float], t: float) -> dict:
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


def predict_batch(dir_rel: str, feat_df: pl.DataFrame) -> np.ndarray:
    """Vectorized member predict for all rows in feat_df."""
    bundle = _load_member(Path(dir_rel))
    meta = bundle["meta"]
    feature_columns: list[str] = meta["feature_columns"]
    numeric_cols: list[str] = meta.get("numeric_cols") or [
        c for c in feature_columns if c != CAT_COL
    ]
    cat_cols: list[str] = meta.get("cat_features") or []

    df = feat_df
    for c in feature_columns:
        if c not in df.columns:
            fill = CAT_FILL if c == CAT_COL else None
            df = df.with_columns(pl.lit(fill).alias(c))
    df = _maybe_domain(df)
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
        pool = Pool(
            data=df.select(feature_columns).to_numpy(),
            feature_names=feature_columns,
        )

    if bundle["task"] == "classification":
        p_xgb = bundle["xgb"].predict_proba(X)[:, 1].astype(np.float64)
        p_cat = bundle["cat"].predict_proba(pool)[:, 1].astype(np.float64)
        return 0.5 * p_xgb + 0.5 * p_cat
    p_xgb = bundle["xgb"].predict(X).astype(np.float64)
    p_cat = np.asarray(bundle["cat"].predict(pool), dtype=np.float64).reshape(-1)
    return 0.5 * p_xgb + 0.5 * p_cat


def load_csv_cols(path: Path, cols: list[str]) -> pl.DataFrame:
    return pl.read_csv(path, infer_schema_length=10000).select(cols)


def fmt_pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def write_reg_quality(
    path: Path,
    *,
    member_id: str,
    head: str,
    weight: int,
    denom: int,
    target: str,
    unit: str,
    metrics: dict,
    note: str,
) -> None:
    m = metrics
    path.write_text(
        f"""# 멤버 단독 · {member_id} ({head})

최종 갱신: 2026-08-10  
모음: [`../README.md`](../README.md) · 앙상블 집계: [`../../model_quality.md`](../../model_quality.md)

이 문서는 **투표 가중 합산 전**, 멤버 `{member_id}` **단독 출력** vs CSV 실측이다.

---

## 0. 멤버 역할

| 항목 | 값 |
|------|-----|
| head | `{head}` |
| member_id | `{member_id}` |
| 현재 가중 | **{weight}** / 분모 {denom} |
| 타깃 | `{target}` ({unit}) |
| 비고 | {note} |

예측 = 해당 멤버 XGB+Cat(0.5/0.5) 단독. **다른 멤버와 가중 평균하지 않음.**

---

## 1. 조인

| 항목 | 내용 |
|------|------|
| 표본 | `` `temp` `` lot_id 순서 1만 ∩ CSV `id` |
| 매칭 | **10000 / 10000** |
| 실측 CSV | capacity→`cathode_reg_data.csv` · residual→`cathode_qc_reg_data.csv` |

---

## 2. 회귀 성능 ({target})

| 지표 | 값 |
|------|-----|
| MAE | **{m['mae']}** |
| RMSE | **{m['rmse']}** |
| Bias (pred−true) | {m['bias_pred_minus_true']:+} |
| MAPE | {(f"{m['mape']*100:.2f}%" if m['mape'] is not None else "—")} |
| Pearson r | **{m['pearson_r']}** |
| R² | **{m['r2']}** |
| 실측 평균 / 예측 평균 | {m['true_mean']} / {m['pred_mean']} |
| 예측 min–max | {m['pred_min']} – {m['pred_max']} |

---

## 3. 한 줄

`{member_id}` 단독: MAE={m['mae']}, RMSE={m['rmse']}, r={m['pearson_r']}, R²={m['r2']} · 현재 가중 {weight}/{denom}.
""",
        encoding="utf-8",
    )


def write_prob_reports(
    member_dir: Path,
    *,
    member_id: str,
    weight: int,
    kind: str,
    scores: list[float],
    y_def: list[int],
    note: str,
) -> dict:
    thresholds = [round(0.1 + i * 0.05, 2) for i in range(0, 19)]
    sweep = [clf_at_threshold(y_def, scores, t) for t in thresholds]
    at04 = clf_at_threshold(y_def, scores, 0.4)
    n1 = sum(y_def)
    mean_p = sum(scores) / len(scores)
    r = pearson(scores, [float(y) for y in y_def])

    pos_rows = []
    for t in thresholds:
        subset_y = [yt for yt, p in zip(y_def, scores) if p >= t]
        n = len(subset_y)
        a1 = sum(subset_y)
        pos_rows.append((t, n, a1, n - a1))

    # bins
    bins = []
    for i in range(10):
        lo, hi = i / 10, (i + 1) / 10
        if i == 9:
            subset = [yt for yt, p in zip(y_def, scores) if lo <= p <= hi]
        else:
            subset = [yt for yt, p in zip(y_def, scores) if lo <= p < hi]
        n = len(subset)
        a1 = sum(subset)
        bins.append((lo, hi, n, a1 / n if n else None))

    mq = member_dir / "model_quality.md"
    mq.write_text(
        f"""# 멤버 단독 · {member_id} (probability 투표 슬롯)

최종 갱신: 2026-08-10  
모음: [`../README.md`](../README.md) · 앙상블: [`../../model_quality.md`](../../model_quality.md)

**가중 합산 전** 슬롯 `{member_id}` 단독 점수 vs CSV `quality_defect`.

---

## 0. 멤버 역할

| 항목 | 값 |
|------|-----|
| head | `probability` |
| member_id | `{member_id}` |
| kind | `{kind}` |
| 현재 가중 | **{weight}** / 분모 15 |
| 비고 | {note} |

점수 해석: clf → 불량확률 · residual_score → `clip((r−3000)/(4000−3000),0,1)` · cascade → 공정+앙상블 \(\\hat{{c}},\\hat{{r}}\) 입력 clf.

운영 임계 참고: **0.4** (`voting_config`). 아래는 이 슬롯 점수에 동일 규칙을 적용한 단독 성능.

---

## 1. 조인 · 점수 분포

| 항목 | 값 |
|------|-----|
| 매칭 | 10000 / 10000 |
| 실제 불량 | {n1} (8.66%) |
| AVG(score) | {mean_p:.6f} |
| min / max | {min(scores):.4f} / {max(scores):.4f} |
| Pearson(score↔actual) | {None if r is None else round(r, 6)} |

---

## 2. 「≥0.4면 실제 불량인가?」(이 슬롯 단독)

`score ≥ 0.4`인 **{at04['n_pred_pos']}건** 안:

| 실제 | 건수 | 비율 |
|------|------|------|
| 1 | {at04['tp']} | {fmt_pct(at04['precision']) if at04['n_pred_pos'] else '—'} |
| 0 | {at04['fp']} | {fmt_pct(1-at04['precision']) if at04['n_pred_pos'] else '—'} |

---

## 3. 혼동행렬 (score ≥ 0.4)

|  | 실제 1 | 실제 0 |
|--|--------|--------|
| **예측 1** | TP {at04['tp']} | FP {at04['fp']} |
| **예측 0** | FN {at04['fn']} | TN {at04['tn']} |

| 지표 | 값 |
|------|-----|
| Accuracy | {at04['accuracy']:.4f} |
| Precision | {at04['precision']:.4f} |
| Recall | {at04['recall']:.4f} |
| F1 | {at04['f1']:.4f} |

---

## 4. `score ≥ T` 실제 1 비율 (0.10~1.00 / 0.05)

| T | 건수 | 실제 1 | 실제 0 | 실제 1% |
|---|-----:|-------:|-------:|--------:|
"""
        + "\n".join(
            f"| ≥{t:.2f} | {n} | {a1} | {a0} | {fmt_pct(a1/n) if n else '—'} |"
            for t, n, a1, a0 in pos_rows
        )
        + f"""

전체 임계 검사표: [`report.md`](./report.md)

---

## 5. score bin 실제 1 비율

| 구간 | n | 실제 1 |
|------|--:|-------:|
"""
        + "\n".join(
            f"| {lo:.1f}–{hi:.1f} | {n} | {fmt_pct(r1) if r1 is not None else '—'} |"
            for lo, hi, n, r1 in bins
        )
        + f"""

---

## 6. 한 줄

`{member_id}` (@0.4): Acc={at04['accuracy']:.4f}, Prec={at04['precision']:.4f}, Rec={at04['recall']:.4f}, F1={at04['f1']:.4f}, FN={at04['fn']} · 가중 {weight}/15.
""",
        encoding="utf-8",
    )

    # report.md
    lines = [
        f"# 멤버 단독 · {member_id} 임계값별 검사·포착",
        "",
        "최종 갱신: 2026-08-10  ",
        f"근거: [`model_quality.md`](./model_quality.md) · 모음 [`../README.md`](../README.md)",
        "",
        f"예측 양성 = `{member_id}` score ≥ T. 실제 불량 = CSV (**{n1}**/10000).",
        "",
        "| 임계값 | 검사 LOT 수 | 검사 비율 | 불량 포착률 | 정밀도 | 놓친 불량 수 | Accuracy | F1 |",
        "|--------|------------:|----------:|------------:|-------:|-------------:|---------:|---:|",
    ]
    for s in sweep:
        t = s["threshold"]
        mark = "**" if abs(t - 0.4) < 1e-9 else ""
        lines.append(
            f"| {mark}{t:.2f}{mark} | {mark}{s['n_pred_pos']}{mark} | {mark}{fmt_pct(s['pred_pos_rate'])}{mark} | "
            f"{mark}{fmt_pct(s['recall'])}{mark} | {mark}{fmt_pct(s['precision'])}{mark} | "
            f"{mark}{s['fn']}{mark} | {mark}{fmt_pct(s['accuracy'])}{mark} | {mark}{s['f1']:.3f}{mark} |"
        )
    lines.append("")
    lines.append(
        f"운영 참고 임계 **0.40**: 검사 {at04['n_pred_pos']} · 포착 {fmt_pct(at04['recall'])} · "
        f"정밀도 {fmt_pct(at04['precision'])} · 놓침 {at04['fn']}."
    )
    (member_dir / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    return {
        "at_0_4": at04,
        "threshold_sweep": sweep,
        "mean_score": round(mean_p, 6),
        "pearson_vs_defect": None if r is None else round(r, 6),
    }


def main() -> None:
    cfg = load_voting_config()
    caution = float(cfg["standard_residual"]["caution"])
    usl = float(cfg["standard_residual"]["usl_spare"])

    # features + labels from CSV; order by id to match temp
    clf = load_csv_cols(
        CLF_CSV,
        [
            "id",
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
            "quality_defect",
        ],
    ).sort("id")
    reg = load_csv_cols(REG_CSV, ["id", "capacity"]).sort("id")
    qc = load_csv_cols(QC_CSV, ["id", "residual_li"]).sort("id")

    conn = pymysql.connect(
        host=os.environ.get("DB_HOST") or "127.0.0.1",
        port=int(os.environ.get("DB_PORT") or 3306),
        user=os.environ.get("DB_USER") or "root",
        password=os.environ.get("DB_PASSWORD") or "",
        database=os.environ.get("DB_NAME") or "kdt",
        charset="utf8mb4",
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT lot_id, capacity, residual_li FROM `temp` ORDER BY lot_id ASC"
            )
            temp_rows = cur.fetchall()
    finally:
        conn.close()

    temp_ids = [str(r[0]) for r in temp_rows]
    temp_cap = {str(r[0]): float(r[1]) for r in temp_rows if r[1] is not None}
    temp_res = {str(r[0]): float(r[2]) for r in temp_rows if r[2] is not None}

    # align CSV to temp lot order
    clf = clf.filter(pl.col("id").is_in(temp_ids))
    # preserve temp order
    order_df = pl.DataFrame({"id": temp_ids, "_ord": list(range(len(temp_ids)))})
    base = order_df.join(clf, on="id", how="inner").sort("_ord")
    base = base.join(reg, on="id", how="inner").join(qc, on="id", how="inner")
    assert base.height == 10000, base.height

    # cascade inputs = ensemble predictions from temp (production cascade path)
    hat = pl.DataFrame(
        {
            "id": temp_ids,
            "capacity_hat": [temp_cap[i] for i in temp_ids],
            "residual_li_hat": [temp_res[i] for i in temp_ids],
        }
    )
    base = base.join(hat, on="id", how="left")

    y_def = base["quality_defect"].to_list()
    y_cap = [float(x) for x in base["capacity"].to_list()]
    y_res = [float(x) for x in base["residual_li"].to_list()]

    feat_process = base.select(
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
    feat_cascade = feat_process.with_columns(
        [
            base["capacity_hat"].alias("capacity"),
            base["residual_li_hat"].alias("residual_li"),
        ]
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results: dict = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "joined": 10000,
        "note": "Per-member alone (no weighted average). Cascade uses temp ensemble capacity/residual.",
        "capacity": {},
        "residual_li": {},
        "probability": {},
    }

    # --- capacity members (denom 11) ---
    print("=== capacity ===")
    for m in cfg["capacity"]["members"]:
        mid = m["id"]
        print(" predict", mid)
        preds = predict_batch(m["dir"], feat_process).tolist()
        metrics = reg_metrics(y_cap, preds)
        results["capacity"][mid] = {
            "weight": m["weight"],
            "denominator": 11,
            "metrics": metrics,
        }
        d = OUT_DIR / mid
        d.mkdir(parents=True, exist_ok=True)
        write_reg_quality(
            d / "model_quality.md",
            member_id=mid,
            head="capacity",
            weight=m["weight"],
            denom=11,
            target="capacity",
            unit="mAh/g",
            metrics=metrics,
            note="capacity 투표 멤버 (가중 합 11)",
        )
        print(" ", metrics)

    # --- residual members (denom 11) ---
    print("=== residual_li ===")
    residual_raw: dict[str, list[float]] = {}
    for m in cfg["residual_li"]["members"]:
        mid = m["id"]
        print(" predict", mid)
        preds = predict_batch(m["dir"], feat_process).tolist()
        residual_raw[mid] = preds
        metrics = reg_metrics(y_res, preds)
        results["residual_li"][mid] = {
            "weight": m["weight"],
            "denominator": 11,
            "metrics": metrics,
        }
        d = OUT_DIR / mid
        d.mkdir(parents=True, exist_ok=True)
        write_reg_quality(
            d / "model_quality.md",
            member_id=mid,
            head="residual_li",
            weight=m["weight"],
            denom=11,
            target="residual_li",
            unit="ppm",
            metrics=metrics,
            note="residual_li 투표 멤버 (가중 합 11)",
        )
        print(" ", metrics)

    # --- probability slots (denom 15) ---
    print("=== probability ===")
    for m in cfg["probability"]["members"]:
        mid = m["id"]
        kind = m.get("kind") or "clf_proba"
        print(" predict", mid, kind)
        if kind == "residual_score":
            # reuse residual raw if available (d50/d90/feature only in residual head)
            if mid in residual_raw:
                raw = residual_raw[mid]
            else:
                raw = predict_batch(m["dir"], feat_process).tolist()
            scores = [residual_to_score(r, caution=caution, usl=usl) for r in raw]
            note = "residual→[0,1] 점수 슬롯 (확률 투표용; 원 ppm은 residual_* 보고서)"
        elif kind == "clf_proba_cascade":
            scores = predict_batch(m["dir"], feat_cascade).tolist()
            note = "cascade clf · 입력 capacity/residual = temp 앙상블 예측"
        else:
            scores = predict_batch(m["dir"], feat_process).tolist()
            note = "공정 피처만 사용하는 clf 확률"

        if kind == "residual_score":
            d = OUT_DIR / f"{mid}__as_score"
        else:
            d = OUT_DIR / mid
        d.mkdir(parents=True, exist_ok=True)

        summary = write_prob_reports(
            d,
            member_id=mid,
            weight=m["weight"],
            kind=kind,
            scores=scores,
            y_def=[int(x) for x in y_def],
            note=note,
        )
        results["probability"][mid] = {
            "weight": m["weight"],
            "denominator": 15,
            "kind": kind,
            "report_dir": str(d.relative_to(OUT_DIR)),
            **summary,
        }
        print(" ", summary["at_0_4"])

    # README index
    def row_cap(mid: str, w: int) -> str:
        m = results["capacity"][mid]["metrics"]
        return f"| `{mid}` | {w} | {m['mae']} | {m['rmse']} | {m['pearson_r']} | {m['r2']} |"

    def row_res(mid: str, w: int) -> str:
        m = results["residual_li"][mid]["metrics"]
        return f"| `{mid}` | {w} | {m['mae']} | {m['rmse']} | {m['pearson_r']} | {m['r2']} |"

    def row_prob(mid: str) -> str:
        p = results["probability"][mid]
        a = p["at_0_4"]
        return (
            f"| `{mid}` | {p['kind']} | {p['weight']} | {a['n_pred_pos']} | "
            f"{fmt_pct(a['recall'])} | {fmt_pct(a['precision'])} | {a['fn']} | {a['f1']:.3f} | "
            f"[dir](./{p['report_dir']}/) |"
        )

    readme = f"""# 멤버 단독 평가 모음 (가중치 재결정용)

최종 갱신: 2026-08-10  
앙상블(가중 합산) 보고서: [`../model_quality.md`](../model_quality.md) · [`../report.md`](../report.md)

## 왜 「11」인가

| head | 멤버 수 | 가중 합(분모) | 의미 |
|------|--------:|-------------:|------|
| `capacity` | **5** | **11** | `1+1+2+3+4` |
| `residual_li` | **5** | **11** | 동일 |
| `probability` | **8** | **15** | clf3 + residual_score3 + cascade2 (`reg` 제외) |

「11개 모델」이 아니라 **가중치 합이 11**인 헤드가 두 개다.  
재가중치를 위해 **멤버마다 단독 출력**을 아래 폴더에 정리했다.

표본: `` `temp` `` ∩ CSV **10000/10000**. cascade clf 입력의 capacity/residual은 **temp 앙상블 값**(운영 cascade와 동일).

원숫자: [`_eval_members.json`](./_eval_members.json)

---

## capacity (단독 vs CSV capacity)

| member | 가중 | MAE | RMSE | r | R² |
|--------|-----:|----:|-----:|--:|---:|
"""
    for m in cfg["capacity"]["members"]:
        readme += row_cap(m["id"], m["weight"]) + "\n"
        readme += f"→ [`{m['id']}/model_quality.md`](./{m['id']}/model_quality.md)\n\n"

    readme += """---

## residual_li (단독 vs CSV residual_li)

| member | 가중 | MAE | RMSE | r | R² |
|--------|-----:|----:|-----:|--:|---:|
"""
    for m in cfg["residual_li"]["members"]:
        readme += row_res(m["id"], m["weight"]) + "\n"
        readme += f"→ [`{m['id']}/model_quality.md`](./{m['id']}/model_quality.md)\n\n"

    readme += """---

## probability 슬롯 (단독 score, 임계 0.4 기준 요약)

| member | kind | 가중 | 검사수 | 포착률 | 정밀도 | FN | F1 | 보고서 |
|--------|------|-----:|-------:|-------:|-------:|---:|----:|--------|
"""
    for m in cfg["probability"]["members"]:
        readme += row_prob(m["id"]) + "\n"

    readme += """
각 슬롯 폴더에 `model_quality.md` + `report.md`(T=0.10~1.00 / 0.05)가 있다.

---

## 재가중치 시 참고

1. capacity/residual: MAE·R²가 좋은 멤버에 가중을 더 줄지, 다양성(상관)을 볼지 결정.
2. probability: Recall/Precision/F1 트레이드오프 · residual_score 슬롯은 스케일이 clf와 다름.
3. 가중을 바꾼 뒤 앙상블을 다시 `` `temp` ``에 채점하면 [`../model_quality.md`](../model_quality.md)와 비교 가능.
"""
    (OUT_DIR / "README.md").write_text(readme, encoding="utf-8")
    (OUT_DIR / "_eval_members.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("WROTE", OUT_DIR)


if __name__ == "__main__":
    main()
