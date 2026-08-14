"""Eval legacy judgment_lots (backup models) vs CSV; append to plain summary."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

import polars as pl
import pymysql
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
AI = ROOT / "ai-service"
OUT_MD = ROOT / "Documents/TopSecret/members/summary_15_models_plain.md"
OUT_JSON = ROOT / "Documents/TopSecret/members/_eval_legacy_judgment.json"


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
    }


def clf_at(y_true: list[int], probs: list[float], t: float) -> dict:
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
        "threshold": t,
        "n_pred_pos": tp + fp,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "accuracy": round(acc, 6),
        "precision": round(prec, 6),
        "recall": round(rec, 6),
        "f1": round(f1, 6),
    }


def acc_plain(r2: float | None) -> str:
    if r2 is None:
        return "—"
    if r2 >= 0.8:
        return f"높음 (설명력 {r2:.1%})"
    if r2 >= 0.6:
        return f"보통~양호 (설명력 {r2:.1%})"
    if r2 >= 0.4:
        return f"보통 (설명력 {r2:.1%})"
    return f"낮음 (설명력 {r2:.1%})"


def pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def main() -> None:
    clf = pl.read_csv(AI / "data/cathode_clf_data.csv")
    reg = pl.read_csv(AI / "data/cathode_reg_data.csv")
    qc = pl.read_csv(AI / "data/cathode_qc_reg_data.csv")

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
            cur.execute("SELECT lot_id FROM `temp` ORDER BY lot_id ASC")
            temp_ids = [str(r[0]) for r in cur.fetchall()]
            cur.execute(
                "SELECT lot_id, quality_defect, capacity, residual_li, probability "
                "FROM judgment_lots"
            )
            jl_rows = cur.fetchall()
    finally:
        conn.close()

    jl = pl.DataFrame(
        {
            "id": [str(r[0]) for r in jl_rows],
            "jl_qd": [int(r[1]) for r in jl_rows],
            "jl_cap": [float(r[2]) if r[2] is not None else None for r in jl_rows],
            "jl_res": [float(r[3]) if r[3] is not None else None for r in jl_rows],
            "jl_prob": [float(r[4]) if r[4] is not None else None for r in jl_rows],
        }
    )

    order = pl.DataFrame({"id": temp_ids, "_ord": list(range(len(temp_ids)))})
    j = (
        order.join(jl, on="id", how="inner")
        .join(clf.select(["id", pl.col("quality_defect").cast(pl.Int64)]), on="id")
        .join(reg.select(["id", "capacity"]), on="id")
        .join(qc.select(["id", "residual_li"]), on="id")
        .sort("_ord")
    )

    # drop null preds
    before = j.height
    j = j.filter(
        pl.col("jl_cap").is_not_null()
        & pl.col("jl_res").is_not_null()
        & pl.col("jl_prob").is_not_null()
    )
    assert j.height == 10000, (before, j.height)

    y_def = [int(x) for x in j["quality_defect"].to_list()]
    y_cap = [float(x) for x in j["capacity"].to_list()]
    y_res = [float(x) for x in j["residual_li"].to_list()]
    p_cap = [float(x) for x in j["jl_cap"].to_list()]
    p_res = [float(x) for x in j["jl_res"].to_list()]
    probs = [float(x) for x in j["jl_prob"].to_list()]
    jl_qd = [int(x) for x in j["jl_qd"].to_list()]

    cap_m = reg_metrics(y_cap, p_cap)
    res_m = reg_metrics(y_res, p_res)
    at04 = clf_at(y_def, probs, 0.4)
    # stored quality_defect column vs CSV
    qd_match = sum(1 for a, b in zip(jl_qd, y_def) if a == b)
    # does stored qd match prob>=0.4?
    qd_vs_04 = sum(1 for q, p in zip(jl_qd, probs) if q == (1 if p >= 0.4 else 0))
    # Public docs used 0.4; backup ensemble often 0.8 — check both
    at08 = clf_at(y_def, probs, 0.8)
    sweep = {t: clf_at(y_def, probs, t) for t in (0.2, 0.4, 0.6, 0.8)}

    result = {
        "source": "judgment_lots (legacy backup models scored into DB)",
        "backup": "ai-service/temp/models_backup_2026-08-10",
        "joined": j.height,
        "capacity": cap_m,
        "residual_li": res_m,
        "probability_mean": round(sum(probs) / len(probs), 6),
        "at_0_4": at04,
        "at_0_8": at08,
        "threshold_sweep": sweep,
        "jl_quality_defect_vs_csv_match": qd_match,
        "jl_quality_defect_vs_prob_ge_0_4": qd_vs_04,
        "actual_defect_count": sum(y_def),
    }
    OUT_JSON.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    # Patch summary markdown: insert §기존모델 before final summary, renumber
    text = OUT_MD.read_text(encoding="utf-8")

    # Update intro line
    if "기존모델" not in text.split("\n")[0]:
        text = text.replace(
            "# 15개 모델 단독 요약 (비전문가용)\n\n최종 갱신: 2026-08-10  \n"
            "상세 폴더: [`README.md`](./README.md) · 원숫자 [`_eval_members.json`](./_eval_members.json)\n",
            "# 15개 모델 단독 요약 (비전문가용) + 기존모델\n\n최종 갱신: 2026-08-10  \n"
            "상세 폴더: [`README.md`](./README.md) · 원숫자 [`_eval_members.json`](./_eval_members.json) · "
            "기존 [`_eval_legacy_judgment.json`](./_eval_legacy_judgment.json)\n",
        )

    legacy_section = f"""
---

## 기존모델 (backup · `judgment_lots`)

백업 경로: [`ai-service/temp/models_backup_2026-08-10`](../../../ai-service/temp/models_backup_2026-08-10)  
구성: **clf 1 + capacity(reg) 1 + residual 1** (레거시 3헤드, XGB+Cat 블렌드).  
예측값 출처: MariaDB **`judgment_lots`** (이미 넣어 둔 분석 결과).  
비교 표본: `` `temp` ``와 같은 lot_id **10000건** ∩ CSV 실측 (미매칭 0).

| 확인 | 결과 |
|------|------|
| 조인 | **10000 / 10000** |
| `judgment_lots.quality_defect` ↔ CSV 불량 라벨 일치 | **{qd_match} / 10000** |
| `quality_defect` ↔ `(probability ≥ 0.4)` 일치 | **{qd_vs_04} / 10000** |
| 참고 | Public 감사 당시 이 슬라이스에서는 DB 판정 컬럼이 CSV와 같았음. 아래 분류 지표는 **probability에 임계를 다시 적용**한 값 |

### 기존모델 · 용량

| 이름 | 실측 평균 | 예측 평균 | 평균 오차(MAE) | 예측 정확도(R²) |
|------|----------:|----------:|---------------:|----------------|
| **기존모델** (reg) | {cap_m['true_mean']:.2f} | {cap_m['pred_mean']:.2f} | {cap_m['mae']:.2f} | {acc_plain(cap_m['r2'])} |

(참고 MAE/RMSE/r: {cap_m['mae']} / {cap_m['rmse']} / {cap_m['pearson_r']})

### 기존모델 · 잔류리튬

| 이름 | 실측 평균 | 예측 평균 | 평균 오차(MAE) | 예측 정확도(R²) |
|------|----------:|----------:|---------------:|----------------|
| **기존모델** (residual) | {res_m['true_mean']:.1f} | {res_m['pred_mean']:.1f} | {res_m['mae']:.1f} | {acc_plain(res_m['r2'])} |

(참고 MAE/RMSE/r: {res_m['mae']} / {res_m['rmse']} / {res_m['pearson_r']})

### 기존모델 · 불량 확률 (@임계 0.4)

예측 점수 평균: **{result['probability_mean']:.4f}** · 진짜 불량 866건.

| 이름 | 예측 점수 평균 | 맞춤 비율 | 걸린 건 중 진짜 불량 비율 | 놓침(FN) | 진짜 불량 중 잡은 비율 |
|------|---------------:|----------:|-------------------------:|---------:|----------------------:|
| **기존모델** (clf) | {result['probability_mean']:.3f} | {pct(at04['accuracy'])} | {pct(at04['precision'])} | {at04['fn']} | {pct(at04['recall'])} |

(@0.8 참고: 맞춤 {pct(at08['accuracy'])} · 정밀도 {pct(at08['precision'])} · 놓침 {at08['fn']} · 포착 {pct(at08['recall'])})

#### 기존모델 임계별

| 임계 T | 검사(예측 불량) 건수 | 그중 실제 불량 비율 | 놓침 | 맞춤 비율 |
|-------:|--------------------:|-------------------:|-----:|----------:|
| 0.2 | {sweep[0.2]['n_pred_pos']} | {pct(sweep[0.2]['precision'])} | {sweep[0.2]['fn']} | {pct(sweep[0.2]['accuracy'])} |
| 0.4 | {sweep[0.4]['n_pred_pos']} | {pct(sweep[0.4]['precision'])} | {sweep[0.4]['fn']} | {pct(sweep[0.4]['accuracy'])} |
| 0.6 | {sweep[0.6]['n_pred_pos']} | {pct(sweep[0.6]['precision'])} | {sweep[0.6]['fn']} | {pct(sweep[0.6]['accuracy'])} |
| 0.8 | {sweep[0.8]['n_pred_pos']} | {pct(sweep[0.8]['precision'])} | {sweep[0.8]['fn']} | {pct(sweep[0.8]['accuracy'])} |

### 기존모델 vs 투표 멤버 (한줄 비교)

| 항목 | 기존모델 | 투표 쪽 참고(단독 최고~앙상블) |
|------|----------|-------------------------------|
| 용량 MAE | **{cap_m['mae']:.2f}** | 단독 상위 ≈3.78 · 투표 앙상블 ≈4.79 |
| 잔류 MAE | **{res_m['mae']:.1f}** | 단독 상위 ≈224 · 투표 앙상블 ≈331 |
| 불량 맞춤@0.4 | **{pct(at04['accuracy'])}** | `clf_d90` 85.9% · 투표 앙상블 81.1% |
| 불량 놓침@0.4 | **{at04['fn']}** | `clf_d90` 39 · 투표 앙상블 125 |

"""

    # Replace section 5 summary / insert before it
    marker = "## 5. 한 줄 요약"
    if "## 기존모델" in text:
        # remove old legacy section if re-run: from --- before 기존모델 to marker
        import re

        text = re.sub(
            r"\n---\n\n## 기존모델.*?(?=\n## 5\. 한 줄 요약)",
            "\n",
            text,
            flags=re.S,
        )

    new_summary = f"""## 5. 한 줄 요약

1. 실측은 CSV 1만 행과 temp lot_id가 **완전 일치**한다. members 수치의 실측 쪽은 맞다.
2. 용량·잔류: d50/d90/feature 계열이 오차 작고, special 계열이 상대적으로 큼.
3. 불량: `@0.4` 기준 `clf_d90`이 맞춤·놓침 균형이 가장 나은 편(놓침 39).
4. **기존모델**(`judgment_lots`): 용량 MAE {cap_m['mae']:.2f} · 잔류 MAE {res_m['mae']:.1f} · 불량@0.4 맞춤 {pct(at04['accuracy'])} · 놓침 {at04['fn']}.
"""

    if marker in text:
        text = text.split(marker)[0].rstrip() + "\n" + legacy_section + new_summary
    else:
        text = text.rstrip() + "\n" + legacy_section + new_summary

    OUT_MD.write_text(text, encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("joined", "capacity", "residual_li", "at_0_4", "jl_quality_defect_vs_csv_match")}, indent=2))
    print("WROTE", OUT_MD)


if __name__ == "__main__":
    main()
