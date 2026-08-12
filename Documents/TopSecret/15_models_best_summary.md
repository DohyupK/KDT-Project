# 15개 멤버 · 중요 지표 · Best 요약

최종 갱신: 2026-08-12  
표본: CSV 10,000 LOT · 실측 불량 **866건 (8.66%)**  
원평가 일자: 2026-08-10 (`members` 단독 평가 · 이후 `members/` 폴더는 본 문서로 통합·삭제)

운영 모델 경로: [`ai-service/models/`](../../ai-service/models/)  
(`legacy` + `voting` + `symbolic_model` · `voting_config.json`)

---

## 1. 한 줄

| 헤드 | Best (단독) | 비고 |
|------|-------------|------|
| 용량 | **legacy_reg** (재추론 MAE **3.77**) ≈ `reg_d50` **3.78** | special_cap 약함 (5.62) |
| 잔류 | **legacy_res** (재추론 MAE **219.9**) ≈ `residual_d50` **224.5** | special_res 약함 (445) |
| 불량@0.4 | **`clf_d90`** (FN **39** · Prec **37.6%**) | cascade·residual_score 약함 |

**운영 cascade (현 `models/`):**  
capacity /15 · residual /13(`residual_d90`×3) · 불량 `(blend≥0.55) ∨ (symbolic≥≈0.0809)`  
→ CSV 검증 Prec **41.12%** · FN **37** · 검사 **2016**

---

## 2. 용량 5개 (mAh/g · MAE↓ 좋을수록)

| 순위 | 모델 | MAE | R² |
|-----:|------|----:|---:|
| 1 | `reg_d50` | **3.78** | 0.842 |
| 2 | `reg_d90` | 3.80 | 0.840 |
| 3 | `cathode_feature_cap` | 3.82 | 0.839 |
| 4 | `reg_feature` | 3.82 | 0.838 |
| 5 | `cathode_special_cap` | **5.62** | 0.627 |

구 투표 앙상블(가중 11, special 과중): MAE **4.79** — special이 앙상블을 깎음.

---

## 3. 잔류리튬 5개 (ppm · MAE↓)

| 순위 | 모델 | MAE | R² |
|-----:|------|----:|---:|
| 1 | `residual_d50` | **224.5** | 0.836 |
| 2 | `residual_feature` | 226.3 | 0.833 |
| 3 | `residual_d90` | 226.8 | 0.833 |
| 4 | `cathode_feature_res` | 353.7 | 0.600 |
| 5 | `cathode_special_res` | **445.5** | 0.331 |

구 투표 앙상블: MAE **331** — 역시 special/feature_res 과중이 원인.

---

## 4. 불량 확률 5개 (@임계 0.4)

진짜 불량 866건. 점수 ≥ 0.4 → 불량.

| 순위 | 모델 | Prec | FN | Recall | Acc | F1 |
|-----:|------|-----:|---:|-------:|----:|----:|
| 1 | **`clf_d90`** | **37.6%** | **39** | 95.5% | 85.9% | **0.540** |
| 2 | `clf_d50` | 31.5% | 65 | 92.5% | 81.9% | 0.470 |
| 3 | `clf_feature` | 31.9% | 72 | 91.7% | 82.4% | 0.474 |
| 4 | `cathode_feature_clf` | 34.9% | 155 | 82.1% | 85.2% | 0.489 |
| 5 | `cathode_special_clf` | 34.1% | 158 | 81.8% | 84.7% | 0.481 |

**제외 권고 (확률 투표):** `residual_*` → 0~1 점수 슬롯 — Prec ~20% · 검사 과다 · F1 ~0.32.

---

## 5. Legacy (구 단일 헤드 3종)

경로(운영): `ai-service/models/legacy/`  
(`judgment_lots` 옛 저장값의 capacity/residual은 CSV 복제로 MAE=0 → **성능 지표로 쓰지 말 것**. 재추론 기준.)

| 헤드 | 재추론 지표 |
|------|-------------|
| capacity | MAE **3.77** · R² 0.842 |
| residual | MAE **219.9** · R² 0.842 |
| clf @0.4 | Acc 83.9% · Prec 34.3% · **FN 52** · Recall 94.0% |

→ 회귀는 투표 단독 상위와 동급·최상. 불량은 `clf_d90`(FN39)보다는 약하고 cascade보다는 강함.

---

## 6. 가중·규칙으로 이어진 Best (운영)

멤버 단독 평가 → 추천 가중 → OR·symbolic 보강까지 요약.

| 단계 | 용량 MAE | 잔류 MAE | 불량 FN | Prec | 비고 |
|------|--------:|--------:|--------:|-----:|------|
| 구 투표 앙상블 (den 11/15) | 4.79 | 331 | 125@0.4 | 29.6% | special 과중 |
| 추천가중 (legacy+상위, ~temp3) | **3.75** | **221** | 60@0.4 | 35.0% | residual_score·special_res 제외 |
| **현 운영 `models/`** | ≈3.75 | ≈221 | **37** | **41.12%** | blend 7:3 @0.55 **OR** symbolic ≈0.0809 · res_d90×3 |

운영 규칙 (짧게):

```
capacity    = Σ w / 15   (legacy_reg:4, d50:3, d90:3, feature:2, feat_cap:2, special_cap:1)
residual_li = Σ w / 13   (legacy_res:4, d50:3, d90:3, feature:2, feat_res:1)
p_blend     = (7·clf_d90 + 3·legacy_clf) / 10
p_symbolic  = (clf_d90)^4 / legacy_clf
quality_defect = (p_blend ≥ 0.55) OR (p_symbolic ≥ 0.080941…)
```

---

## 7. 교훈 (재가중 시 꼭 남길 것)

1. **가중 ≠ 성능** — 구 config는 special에 4를 줘 앙상블을 악화시킴.  
2. **회귀 Best = legacy + d50/d90/feature** · special·feature_res는 축소/제외.  
3. **불량 Best 단독 = `clf_d90`** · residual_score 슬롯·약 cascade는 빼는 편이 유리.  
4. **DB 저장값 ≠ 모델 성능** — legacy capacity/residual은 재추론으로만 평가.  
5. 최종 운영은 실험 테이블명이 아니라 **`ai-service/models/` → `judgment_lots`**.

---

## 8. 관련 (상위 TopSecret)

- 구 투표 앙상블 vs CSV: [`model_quality.md`](./model_quality.md) · [`report.md`](./report.md)  
- 영구 아카이브(오프라인): `C:\Users\OWNER\Downloads\doc\` (`RECOVERY.md`, `temp39_bundle`)
