# 멤버 단독 평가 모음 (가중치 재결정용)

최종 갱신: 2026-08-10  
앙상블(가중 합산) 보고서: [`../model_quality.md`](../model_quality.md) · [`../report.md`](../report.md)  
**15개 한눈에(비전문가용):** [`summary_15_models_plain.md`](./summary_15_models_plain.md) (기존모델=`judgment_lots` + **재추론 temp2** 절)  
재추론 상세: [`legacy_temp2_test.md`](./legacy_temp2_test.md)

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
재실행: `ai-service/scripts/eval_members_vs_csv.py`

---

## capacity (단독 vs CSV capacity)

| member | 가중 | MAE | RMSE | r | R² | 보고서 |
|--------|-----:|----:|-----:|--:|---:|--------|
| `reg_d50` | 1 | 3.7759 | 4.8344 | 0.9175 | 0.8417 | [`model_quality`](./reg_d50/model_quality.md) |
| `reg_d90` | 1 | 3.7992 | 4.8653 | 0.9164 | 0.8397 | [`model_quality`](./reg_d90/model_quality.md) |
| `reg_feature` | 2 | 3.8220 | 4.8907 | 0.9154 | 0.8380 | [`model_quality`](./reg_feature/model_quality.md) |
| `cathode_feature_cap` | 3 | 3.8200 | 4.8752 | 0.9160 | 0.8390 | [`model_quality`](./cathode_feature_cap/model_quality.md) |
| `cathode_special_cap` | 4 | 5.6188 | 7.4240 | 0.7918 | 0.6267 | [`model_quality`](./cathode_special_cap/model_quality.md) |
| **앙상블 (참고)** | 11 | 4.7928 | 6.6903 | 0.8384 | 0.6968 | [`../model_quality.md`](../model_quality.md) |

→ 가중 4인 `cathode_special_cap`이 단독 오차가 커서 앙상블 MAE를 끌어올림.

---

## residual_li (단독 vs CSV residual_li)

| member | 가중 | MAE | RMSE | r | R² | 보고서 |
|--------|-----:|----:|-----:|--:|---:|--------|
| `residual_d50` | 1 | 224.45 | 287.80 | 0.9142 | 0.8356 | [`model_quality`](./residual_d50/model_quality.md) |
| `residual_d90` | 1 | 226.76 | 290.29 | 0.9126 | 0.8327 | [`model_quality`](./residual_d90/model_quality.md) |
| `residual_feature` | 2 | 226.28 | 289.79 | 0.9129 | 0.8333 | [`model_quality`](./residual_feature/model_quality.md) |
| `cathode_feature_res` | 3 | 353.69 | 448.78 | 0.7754 | 0.6003 | [`model_quality`](./cathode_feature_res/model_quality.md) |
| `cathode_special_res` | 4 | 445.48 | 580.74 | 0.5772 | 0.3306 | [`model_quality`](./cathode_special_res/model_quality.md) |
| **앙상블 (참고)** | 11 | 331.33 | 436.95 | 0.7926 | 0.6211 | [`../model_quality.md`](../model_quality.md) |

→ 마찬가지로 가중 큰 special/feature_res가 단독 성능이 약함.

---

## probability 슬롯 (단독 score @ 임계 0.4)

| member | kind | 가중 | 검사수 | 포착률 | 정밀도 | FN | F1 | 보고서 |
|--------|------|-----:|-------:|-------:|-------:|---:|----:|--------|
| `clf_d50` | clf_proba | 1 | 2544 | 92.49% | 31.49% | 65 | 0.470 | [`quality`](./clf_d50/) · [`report`](./clf_d50/report.md) |
| `clf_d90` | clf_proba | 1 | 2199 | 95.50% | 37.61% | 39 | 0.540 | [`quality`](./clf_d90/) · [`report`](./clf_d90/report.md) |
| `clf_feature` | clf_proba | 2 | 2486 | 91.69% | 31.94% | 72 | 0.474 | [`quality`](./clf_feature/) · [`report`](./clf_feature/report.md) |
| `residual_d50` | residual_score | 1 | 3382 | 77.48% | 19.84% | 195 | 0.316 | [`as_score`](./residual_d50__as_score/) |
| `residual_d90` | residual_score | 1 | 3382 | 77.48% | 19.84% | 195 | 0.316 | [`as_score`](./residual_d90__as_score/) |
| `residual_feature` | residual_score | 2 | 3382 | 77.48% | 19.84% | 195 | 0.316 | [`as_score`](./residual_feature__as_score/) |
| `cathode_feature_clf` | cascade | 3 | 2040 | 82.10% | 34.85% | 155 | 0.489 | [`quality`](./cathode_feature_clf/) |
| `cathode_special_clf` | cascade | 4 | 2077 | 81.76% | 34.09% | 158 | 0.481 | [`quality`](./cathode_special_clf/) |
| **앙상블 (참고)** | weighted/15 | — | 2503 | 85.57% | 29.60% | 125 | 0.440 | [`../report.md`](../report.md) |

각 슬롯 폴더에 `model_quality.md` + `report.md`(T=0.10~1.00 / 0.05).  
residual ppm 단독은 위 `residual_*` 폴더, 확률 투표용 점수는 `*__as_score`.

---

## 재가중치 시 참고

1. capacity/residual: 단독 MAE·R²가 좋은 멤버(d50/d90/feature) vs 현재 고가중 special.
2. probability: `clf_d90` F1·정밀도 우위 · residual_score 슬롯은 검사 과다·정밀도 낮음.
3. 가중 변경 후 앙상블을 다시 `` `temp` ``에 채점하면 [`../model_quality.md`](../model_quality.md)와 비교.
