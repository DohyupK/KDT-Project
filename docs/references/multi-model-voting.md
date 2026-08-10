# 다중 모델 투표 앙상블 — 결정 기록

최종 갱신: 2026-08-10  
관련: [`model-training-methods.md`](./model-training-methods.md) · [`ai-service/models/voting_config.json`](../../ai-service/models/voting_config.json)

활성 경로: cascade voting만. 레거시 clf/reg/residual 가중치는 `ai-service/temp/models_backup_2026-08-10/`에만 보관하며 **로드하지 않음**.

## 1. 목적

`lots` 공정 파라미터로 추론하여 `judgment_lots`의  
`quality_defect`, `capacity`, `residual_li`, `probability` 를 채운다.

## 2. 데이터

- 원본: `c:\Users\OWNER\Downloads\data` CSV 11개 (1행 헤더, 2행~ 데이터)
- 복사본: `ai-service/data/voting/`
- 기존 운영 아티팩트 백업: `ai-service/temp/models_backup_2026-08-10/`

## 3. 학습 합의

- 기존 파이프라인과 동일 + **`N_FOLDS = 6`**
- **Test holdout 미사용** (100% Train; Optuna는 Train 내 TimeSeriesSplit만)
- 멤버별 완료 시 `Downloads/data/<member_id>_완료.md` 기록
- 임계값 **`default_threshold = 0.4`** (`quality_defect` 마지막 단계만; 학습 비포함)

## 4. 투표 가중

| 용도 | 멤버 | 가중 | 분모 |
|------|------|------|------|
| capacity | reg_d50, reg_d90, reg_feature, cathode_feature_cap, special_cap | 1,1,2,3,4 | **11** |
| residual_li | residual_d50/d90/feature, cathode_feature_res, special_res | 1,1,2,3,4 | **11** |
| probability | clf×3 + residual_score×3 + cascade clf×2 | 1,1,2 + 1,1,2 + 3,4 | **15** |

- **reg(capacity) 가중 1+1+2=4 는 probability 투표에서 제외** (초기 “19”에서 제외 → 15)
- 전체 가중 계수 표기 합(11+11+…과 별개로) 대화 초기안 19에서 capacity 슬롯 제외

## 5. probability (B안)

1. capacitŷ · residual̂ 먼저 산정  
2. cascade clf (`cathode_feature` / `special`)는 입력에 capacitŷ·residual̂ 사용  
3. qc_reg 출력 → `standard` 기반 점수  
   `s(r) = clip((r - 3000) / (4000 - 3000), 0, 1)`  
   - caution 3000 · severe 3500(위험등급) · USL spare **4000**(규격 대비)
4. `probability = Σ w_i · score_i / 15`  
5. `quality_defect` = `probability ≥ 0.4` (**마지막** 단계; `voting_config.threshold.default_threshold`)

스테이지 내 스케줄: `*_d50 || *_d90` 병렬 → `*_feature` → 나머지. 스테이지는 capacity → residual → probability → quality_defect 순.

## 6. 코드 진입점

| 항목 | 경로 |
|------|------|
| 멤버 학습 | `ai-service/train_voting_member.py` |
| 일괄 학습 | `ai-service/scripts/train_all_voting_models.py` |
| 추론 | `ai-service/voting_predict.py` → `POST /predict-voting` |
| backend | `aiProxy.predictVoting` · `lotScore.scoreLotWithAi` (voting만) |
| 임계 | **0.4** → `quality_defect` |
| `judgment_lots` | 운영 UPSERT는 **NULL-fill만** (`COALESCE`). 스키마·기존 행 수정 없음. 채점 검증은 `` `temp` `` |
| temp 채점 | [`DB/temp_judgment_like.sql`](../../DB/temp_judgment_like.sql) · `npm run score:lots-to-temp` (`lots ORDER BY id LIMIT 10000`) |
