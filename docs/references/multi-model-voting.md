# 다중 모델 투표 앙상블 — 결정 기록

최종 갱신: 2026-08-12  
관련: [`model-training-methods.md`](./model-training-methods.md) · [`ai-service/models/voting_config.json`](../../ai-service/models/voting_config.json) · [`ai-service/models/recipe.json`](../../ai-service/models/recipe.json)

활성 경로: cascade voting (`POST /predict-voting`).  
레거시 단일 헤드도 **`ai-service/models/legacy/`** 에서 로드해 capacity/residual/불량 blend에 포함한다 (구 `temp/models_backup_*` 경로 폐기).

## 1. 목적

`lots` 공정 파라미터로 `/predict-voting` 추론 후 **3단 쓰기 SSOT**:  
`lot_results`(qd/residual NULL-fill) → `judgment_lots`(LR + voting capacity/prob) → `analysis_lots`(judgment 기준 risk/`scored_at` 2차 추론).

## 2. 데이터·아티팩트

- 피처 CSV: `ai-service/data/cathode_{clf,reg,qc_reg}_data.csv`
- 운영 모델: `ai-service/models/` (`voting/` · `legacy/` · `symbolic_model/` · `voting_config.json`)

## 3. 학습 합의 (멤버 학습 시)

- 기존 파이프라인 + **`N_FOLDS = 6`** · Test holdout 미사용
- 멤버 산출물: `ai-service/models/voting/<member>/`

## 4. 운영 투표 가중 (현 config)

| 용도 | 분모 | 요지 |
|------|-----:|------|
| capacity | **15** | legacy_reg:4 · d50/d90:3 · feature/feat_cap:2 · special_cap:1 |
| residual_li | **13** | legacy_res:4 · d50/d90:3 · feature:2 · feat_res:1 |
| 불량 | OR | `p_blend=(7·clf_d90+3·legacy)/10` ≥ **0.55** **또는** symbolic ≥ ≈**0.0809** |

상세 상수: `models/recipe.json` · `voting_config.json` (`probability.mode` = `blend_or_symbolic`).

## 5. 추론 스테이지

capacity → residual_li → (blend + symbolic) → quality_defect.  
스테이지 내: `*_d50 || *_d90` 병렬 → 나머지.

## 6. 코드 진입점

| 항목 | 경로 |
|------|------|
| 추론 | `ai-service/voting_predict.py` → `POST /predict-voting` |
| backend | `aiProxy.predictVoting` · `lotScore.scoreLotWithAi` |
| `lot_results` | **1단** qd/`residual_li` NULL-fill (피더 실측 COALESCE 유지) |
| `judgment_lots` | **2단** qd/residual←LR · capacity/prob←voting · UPSERT **NULL-fill** (`COALESCE`) |
| `analysis_lots` | **3단** judgment 기준 `combineLotScore` + SPC → risk/`scored_at` |
| 폴러 | `spcLotSync` (60s) · `analysisLotSyncPoller` (10m) — 3단 전체 또는 analysis-only(`scoreAnalysisFromJudgment`) |
| ai-service | backend 기동 시 자식 자동 기동 (`AI_SERVICE_AUTOSTART=1`, `AI_SERVICE_AUTOSTART=0`이면 수동) |

채점 순서 SSOT: `/predict-voting` → **`lot_results` NULL-fill** → **`judgment_lots` 기록** → **judgment 기준 `analysis_lots` 2차 추론**.  
폴러: judgment/analysis/`scored_at`/LR행 결손 **최신 우선** · LR 필드 백필은 잔여 · risk_reason은 score 락 밖.  
`lot_results` NULL / residual NULL = 피더 stub 후 +60분 qd / +24h residual · 또는 AI fill 미도달(큐 굶주림이면 버그).
