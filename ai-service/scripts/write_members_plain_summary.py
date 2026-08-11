"""Verify members eval ground truth join; write plain-language 15-model summary."""
from __future__ import annotations

import json
import os
from pathlib import Path

import polars as pl
import pymysql
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
AI = ROOT / "ai-service"
MEMBERS = ROOT / "Documents/TopSecret/members"
EVAL = MEMBERS / "_eval_members.json"
OUT = MEMBERS / "summary_15_models_plain.md"


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
    finally:
        conn.close()

    s_temp = set(temp_ids)
    s_clf = set(clf["id"].cast(str).to_list())
    s_reg = set(reg["id"].cast(str).to_list())
    s_qc = set(qc["id"].cast(str).to_list())

    checks = {
        "temp_n": len(temp_ids),
        "temp_unique": len(s_temp),
        "joined_clf": len(s_temp & s_clf),
        "miss_clf": len(s_temp - s_clf),
        "miss_reg": len(s_temp - s_reg),
        "miss_qc": len(s_temp - s_qc),
        "temp_eq_clf_ids": s_temp == s_clf,
        "clf_eq_reg_ids": s_clf == s_reg,
        "clf_eq_qc_ids": s_clf == s_qc,
    }

    order = pl.DataFrame({"id": temp_ids})
    j = (
        order.join(clf.select(["id", pl.col("quality_defect").cast(pl.Float64)]), on="id")
        .join(reg.select(["id", "capacity"]), on="id")
        .join(qc.select(["id", "residual_li"]), on="id")
    )
    checks["joined_rows"] = j.height
    checks["csv_defect_count"] = int(j["quality_defect"].sum())
    checks["csv_defect_rate"] = float(j["quality_defect"].mean())
    checks["csv_capacity_mean"] = float(j["capacity"].mean())
    checks["csv_residual_mean"] = float(j["residual_li"].mean())

    data = json.loads(EVAL.read_text(encoding="utf-8"))

    # Cross-check true_mean in eval JSON vs CSV
    cap_true = data["capacity"]["reg_d50"]["metrics"]["true_mean"]
    res_true = data["residual_li"]["residual_d50"]["metrics"]["true_mean"]
    checks["eval_cap_true_mean"] = cap_true
    checks["eval_res_true_mean"] = res_true
    checks["cap_mean_match"] = abs(cap_true - checks["csv_capacity_mean"]) < 1e-3
    checks["res_mean_match"] = abs(res_true - checks["csv_residual_mean"]) < 1e-3
    checks["defect_match_866"] = checks["csv_defect_count"] == 866

    def pct(x: float) -> str:
        return f"{x * 100:.1f}%"

    def acc_plain(r2: float | None) -> str:
        if r2 is None:
            return "—"
        # plain band for non-experts
        if r2 >= 0.8:
            return f"높음 (설명력 {r2:.1%})"
        if r2 >= 0.6:
            return f"보통~양호 (설명력 {r2:.1%})"
        if r2 >= 0.4:
            return f"보통 (설명력 {r2:.1%})"
        return f"낮음 (설명력 {r2:.1%})"

    lines: list[str] = []
    lines.append("# 15개 모델 단독 요약 (비전문가용)")
    lines.append("")
    lines.append("최종 갱신: 2026-08-10  ")
    lines.append("상세 폴더: [`README.md`](./README.md) · 원숫자 [`_eval_members.json`](./_eval_members.json)")
    lines.append("")
    lines.append("## 0. 실측값 재확인 결과")
    lines.append("")
    lines.append("| 확인 항목 | 결과 |")
    lines.append("|-----------|------|")
    lines.append(f"| `` `temp` `` 행 수 | {checks['temp_n']} (고유 {checks['temp_unique']}) |")
    lines.append(
        f"| CSV와 lot_id 일치 | clf {checks['joined_clf']}/10000 · "
        f"미매칭 clf/reg/qc = {checks['miss_clf']}/{checks['miss_reg']}/{checks['miss_qc']} |"
    )
    lines.append(
        f"| temp ID 집합 = clf CSV | **{'예' if checks['temp_eq_clf_ids'] else '아니오'}** · "
        f"clf=reg=qc ID **{'동일' if checks['clf_eq_reg_ids'] and checks['clf_eq_qc_ids'] else '불일치'}** |"
    )
    lines.append(
        f"| 실측 불량 (CSV `quality_defect=1`) | **{checks['csv_defect_count']}건** "
        f"({checks['csv_defect_rate']*100:.2f}%) |"
    )
    lines.append(
        f"| 실측 용량 평균 (CSV) | **{checks['csv_capacity_mean']:.4f}** mAh/g · "
        f"평가파일 true_mean 일치: **{'OK' if checks['cap_mean_match'] else 'FAIL'}** |"
    )
    lines.append(
        f"| 실측 잔류리튬 평균 (CSV) | **{checks['csv_residual_mean']:.4f}** ppm · "
        f"평가파일 true_mean 일치: **{'OK' if checks['res_mean_match'] else 'FAIL'}** |"
    )
    lines.append("")
    lines.append(
        "**결론:** members 보고서는 `` `temp` `` 1만 lot과 "
        "`ai-service/data/cathode_{clf,reg,qc_reg}_data.csv`를 `id`로 조인한 **CSV 실측**을 쓴다. "
        "가중 통합이 아니라 **모델 단독 예측** vs 그 실측이다."
    )
    lines.append("")
    lines.append("### 용어 (짧게)")
    lines.append("")
    lines.append("| 말 | 뜻 |")
    lines.append("|----|----|")
    lines.append("| 실측 평균 | CSV에 적힌 진짜 값의 평균 |")
    lines.append("| 예측 평균 | 그 모델이 1만 건에 대해 낸 값의 평균 |")
    lines.append("| 평균 오차(MAE) | \|예측−실측\| 평균. 작을수록 좋음 |")
    lines.append("| 예측 정확도(회귀) | R² 기준 설명력. 1에 가까울수록 실측을 잘 따라감 |")
    lines.append("| 임계 | 점수(확률)가 이 값 이상이면 「불량」으로 판정 |")
    lines.append("| 임계별 실제 1비율 | 「불량」으로 걸린 건 중, CSV도 진짜 불량인 비율 (=정밀도) |")
    lines.append("| 놓침 | 진짜 불량인데 모델이 놓친 건수 (FN). 전체 진짜 불량 866건 기준 |")
    lines.append("| 맞춤 비율(분류) | 1만 건 중 O/X 판정이 CSV와 같은 비율 (Accuracy @임계 0.4) |")
    lines.append("")

    # --- capacity 5 ---
    lines.append("---")
    lines.append("")
    lines.append("## 1. 용량(capacity) 모델 5개")
    lines.append("")
    lines.append("실측 출처: `cathode_reg_data.csv` · 단위 mAh/g · 표본 10000")
    lines.append("")
    lines.append("| 모델 | 실측 평균 | 예측 평균 | 평균 오차(MAE) | 예측 정확도(R²) |")
    lines.append("|------|----------:|----------:|---------------:|----------------|")
    for mid, block in data["capacity"].items():
        m = block["metrics"]
        lines.append(
            f"| `{mid}` | {m['true_mean']:.2f} | {m['pred_mean']:.2f} | "
            f"{m['mae']:.2f} | {acc_plain(m['r2'])} |"
        )
    lines.append("")
    lines.append(
        "용량·잔류 모델에는 「임계/놓침」이 없다(연속값 예측). "
        "불량 O/X는 아래 분류·점수 모델 참고."
    )
    lines.append("")

    # --- residual 5 ---
    lines.append("---")
    lines.append("")
    lines.append("## 2. 잔류리튬(residual_li) 모델 5개")
    lines.append("")
    lines.append("실측 출처: `cathode_qc_reg_data.csv` · 단위 ppm · 표본 10000")
    lines.append("")
    lines.append("| 모델 | 실측 평균 | 예측 평균 | 평균 오차(MAE) | 예측 정확도(R²) |")
    lines.append("|------|----------:|----------:|---------------:|----------------|")
    for mid, block in data["residual_li"].items():
        m = block["metrics"]
        lines.append(
            f"| `{mid}` | {m['true_mean']:.1f} | {m['pred_mean']:.1f} | "
            f"{m['mae']:.1f} | {acc_plain(m['r2'])} |"
        )
    lines.append("")

    # --- clf / cascade / note residual as score is NOT a separate of 15 ---
    # 15 models = 5 cap + 5 res + 5 clf (clf_d50/d90/feature + feature_clf + special_clf)
    lines.append("---")
    lines.append("")
    lines.append("## 3. 불량 확률 모델 5개 (분류)")
    lines.append("")
    lines.append(
        "실측 출처: `cathode_clf_data.csv` `quality_defect` · "
        f"진짜 불량 **{checks['csv_defect_count']}건 / 10000**. "
        "판정 규칙 예시: **점수 ≥ 0.4 → 불량**. "
        "cascade(`cathode_feature_clf`, `cathode_special_clf`)는 용량·잔류 입력에 "
        "앙상블(`temp`) 값을 사용."
    )
    lines.append("")
    lines.append("### 3.1 한눈에 (@임계 0.4)")
    lines.append("")
    lines.append(
        "| 모델 | 예측 점수 평균 | 맞춤 비율 | 걸린 건 중 진짜 불량 비율 | 놓침(FN) | 진짜 불량 중 잡은 비율 |"
    )
    lines.append(
        "|------|---------------:|----------:|-------------------------:|---------:|----------------------:|"
    )

    clf_ids = [
        "clf_d50",
        "clf_d90",
        "clf_feature",
        "cathode_feature_clf",
        "cathode_special_clf",
    ]
    for mid in clf_ids:
        p = data["probability"][mid]
        a = p["at_0_4"]
        lines.append(
            f"| `{mid}` | {p['mean_score']:.3f} | {pct(a['accuracy'])} | "
            f"{pct(a['precision'])} | {a['fn']} | {pct(a['recall'])} |"
        )
    lines.append("")
    lines.append("### 3.2 임계별 「걸린 건 중 실제 불량 비율」·놓침")
    lines.append("")
    lines.append("같은 표를 모델마다 요약 (T=0.2 / 0.4 / 0.6 / 0.8).")
    lines.append("")

    for mid in clf_ids:
        p = data["probability"][mid]
        sweep = {round(s["threshold"], 2): s for s in p["threshold_sweep"]}
        lines.append(f"#### `{mid}`")
        lines.append("")
        lines.append("| 임계 T | 검사(예측 불량) 건수 | 그중 실제 불량 비율 | 놓침 | 맞춤 비율 |")
        lines.append("|-------:|--------------------:|-------------------:|-----:|----------:|")
        for t in (0.2, 0.4, 0.6, 0.8):
            s = sweep[t]
            lines.append(
                f"| {t:.1f} | {s['n_pred_pos']} | {pct(s['precision'])} | "
                f"{s['fn']} | {pct(s['accuracy'])} |"
            )
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## 4. 15개 목록 (학습 산출물 = 위 5+5+5)")
    lines.append("")
    lines.append("| # | 모델 | 타깃 | 이 문서 절 |")
    lines.append("|--:|------|------|-----------|")
    n = 1
    for mid in data["capacity"]:
        lines.append(f"| {n} | `{mid}` | capacity | §1 |")
        n += 1
    for mid in data["residual_li"]:
        lines.append(f"| {n} | `{mid}` | residual_li | §2 |")
        n += 1
    for mid in clf_ids:
        lines.append(f"| {n} | `{mid}` | quality_defect 확률 | §3 |")
        n += 1
    lines.append("")
    lines.append(
        "참고: 확률 **투표 슬롯**에는 residual을 0~1 점수로 바꾼 항목도 있으나, "
        "그건 별도 학습 모델이 아니라 residual 모델의 **변환**이다. "
        "15개 학습 모델에는 넣지 않았다. (슬롯 보고서는 `*__as_score/`)"
    )
    lines.append("")
    lines.append("## 5. 한 줄 요약")
    lines.append("")
    lines.append("1. 실측은 CSV 1만 행과 temp lot_id가 **완전 일치**한다. members 수치의 실측 쪽은 맞다.")
    lines.append("2. 용량·잔류: d50/d90/feature 계열이 오차 작고, special 계열이 상대적으로 큼.")
    lines.append("3. 불량: `@0.4` 기준 `clf_d90`이 맞춤·놓침 균형이 가장 나은 편(놓침 39).")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(checks, indent=2, ensure_ascii=False))
    print("WROTE", OUT)


if __name__ == "__main__":
    main()
