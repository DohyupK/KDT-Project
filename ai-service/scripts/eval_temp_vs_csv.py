"""Evaluate temp predictions vs CSV ground truth. Writes JSON summary."""
from __future__ import annotations

import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

import pymysql
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

CLF = ROOT / "ai-service/data/cathode_clf_data.csv"
REG = ROOT / "ai-service/data/cathode_reg_data.csv"
QC = ROOT / "ai-service/data/cathode_qc_reg_data.csv"
OUT = ROOT / "Documents/TopSecret/_eval_temp_vs_csv.json"


def read_csv_map(path: Path, value_col: str) -> dict[str, float]:
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    header = lines[0].split(",")
    id_i = header.index("id")
    v_i = header.index(value_col)
    out: dict[str, float] = {}
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split(",")
        out[parts[id_i]] = float(parts[v_i])
    return out


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
    abs_err = [abs(e) for e in err]
    sq = [e * e for e in err]
    mae = sum(abs_err) / n
    rmse = math.sqrt(sum(sq) / n)
    mape_terms = [abs(e) / abs(t) for e, t in zip(err, y_true) if t != 0]
    mape = (sum(mape_terms) / len(mape_terms)) if mape_terms else None
    bias = sum(err) / n
    r = pearson(y_true, y_pred)
    # R^2
    my = sum(y_true) / n
    ss_tot = sum((t - my) ** 2 for t in y_true)
    ss_res = sum(sq)
    r2 = 1 - ss_res / ss_tot if ss_tot else None
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
        "true_min": round(min(y_true), 4),
        "true_max": round(max(y_true), 4),
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
    spec = tn / (tn + fp) if (tn + fp) else 0.0
    acc = (tp + tn) / n if n else 0.0
    f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
    pos = tp + fp
    return {
        "threshold": round(t, 2),
        "n_pred_pos": pos,
        "pred_pos_rate": round(pos / n, 6) if n else 0,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "accuracy": round(acc, 6),
        "precision": round(prec, 6),
        "recall": round(rec, 6),
        "specificity": round(spec, 6),
        "f1": round(f1, 6),
    }


def main() -> None:
    clf = read_csv_map(CLF, "quality_defect")
    cap = read_csv_map(REG, "capacity")
    res = read_csv_map(QC, "residual_li")

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
                "SELECT lot_id, quality_defect, capacity, residual_li, probability, spc "
                "FROM `temp` ORDER BY lot_id ASC"
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    joined = []
    miss = []
    for lot_id, qd_db, capacity_p, residual_p, prob, spc in rows:
        lid = str(lot_id)
        if lid not in clf or lid not in cap or lid not in res:
            miss.append(lid)
            continue
        if capacity_p is None or residual_p is None or prob is None:
            miss.append(lid)
            continue
        joined.append(
            {
                "lot_id": lid,
                "y_defect": int(clf[lid]),
                "y_cap": float(cap[lid]),
                "y_res": float(res[lid]),
                "p_cap": float(capacity_p),
                "p_res": float(residual_p),
                "prob": float(prob),
                "qd_temp": int(qd_db) if qd_db is not None else None,
                "spc": spc,
            }
        )

    y_def = [r["y_defect"] for r in joined]
    probs = [r["prob"] for r in joined]
    y_cap = [r["y_cap"] for r in joined]
    p_cap = [r["p_cap"] for r in joined]
    y_res = [r["y_res"] for r in joined]
    p_res = [r["p_res"] for r in joined]

    # thresholds 0.10 .. 1.00 step 0.05
    thresholds = [round(0.1 + i * 0.05, 2) for i in range(0, 19)]  # 0.1 .. 1.0
    sweep = [clf_at_threshold(y_def, probs, t) for t in thresholds]

    # temp quality_defect column vs CSV (stored at 0.4)
    temp_qd_match = sum(
        1 for r in joined if r["qd_temp"] is not None and r["qd_temp"] == r["y_defect"]
    )
    temp_vs_recomputed = sum(
        1
        for r in joined
        if r["qd_temp"] is not None and r["qd_temp"] == (1 if r["prob"] >= 0.4 else 0)
    )

    # positive slice stats like model_quality
    pos_slices = []
    for t in thresholds:
        subset = [r for r in joined if r["prob"] >= t]
        n = len(subset)
        n1 = sum(1 for r in subset if r["y_defect"] == 1)
        pos_slices.append(
            {
                "threshold": t,
                "n": n,
                "actual_1": n1,
                "actual_0": n - n1,
                "actual_1_rate": round(n1 / n, 6) if n else None,
            }
        )

    # bins [lo, hi)
    bins = []
    edges = [i / 10 for i in range(0, 11)]
    for i in range(len(edges) - 1):
        lo, hi = edges[i], edges[i + 1]
        if i == len(edges) - 2:
            subset = [r for r in joined if lo <= r["prob"] <= hi]
        else:
            subset = [r for r in joined if lo <= r["prob"] < hi]
        n = len(subset)
        n1 = sum(1 for r in subset if r["y_defect"] == 1)
        bins.append(
            {
                "lo": lo,
                "hi": hi,
                "n": n,
                "actual_1_rate": round(n1 / n, 6) if n else None,
                "actual_0_rate": round((n - n1) / n, 6) if n else None,
            }
        )

    n_actual_1 = sum(y_def)
    mean_p0 = (
        sum(r["prob"] for r in joined if r["y_defect"] == 0)
        / max(1, sum(1 for r in joined if r["y_defect"] == 0))
    )
    mean_p1 = (
        sum(r["prob"] for r in joined if r["y_defect"] == 1)
        / max(1, sum(1 for r in joined if r["y_defect"] == 1))
    )

    report = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "temp_rows": len(rows),
        "joined": len(joined),
        "miss": len(miss),
        "miss_sample": miss[:10],
        "csv": {
            "clf": str(CLF.relative_to(ROOT)),
            "reg": str(REG.relative_to(ROOT)),
            "qc_reg": str(QC.relative_to(ROOT)),
        },
        "actual_defect_count": n_actual_1,
        "actual_defect_rate": round(n_actual_1 / len(joined), 6) if joined else None,
        "prob_stats": {
            "mean": round(sum(probs) / len(probs), 6),
            "min": round(min(probs), 6),
            "max": round(max(probs), 6),
            "mean_actual_0": round(mean_p0, 6),
            "mean_actual_1": round(mean_p1, 6),
            "pearson_prob_vs_actual": pearson(probs, [float(y) for y in y_def]),
        },
        "capacity": reg_metrics(y_cap, p_cap),
        "residual_li": reg_metrics(y_res, p_res),
        "temp_quality_defect_vs_csv_match": temp_qd_match,
        "temp_quality_defect_vs_prob_ge_0_4": temp_vs_recomputed,
        "at_0_4": clf_at_threshold(y_def, probs, 0.4),
        "threshold_sweep": sweep,
        "positive_slices": pos_slices,
        "prob_bins": bins,
    }
    # round pearson
    if report["prob_stats"]["pearson_prob_vs_actual"] is not None:
        report["prob_stats"]["pearson_prob_vs_actual"] = round(
            report["prob_stats"]["pearson_prob_vs_actual"], 6
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("joined", "miss", "actual_defect_count", "at_0_4", "capacity", "residual_li")}, indent=2))
    print("WROTE", OUT)


if __name__ == "__main__":
    main()
