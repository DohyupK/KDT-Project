# LOT 관련 테이블 상호작용 로직 (SSOT)

최종 갱신: 2026-08-12  
등급: TopSecret — 운영 채점·동기화 내부 계약  
관련 코드: `backend/src/services/lot.service.ts` · `unscoredLots.ts` · `spcLotSync.ts` · `analysisLotSyncPoller.ts` · `frontend/plant_feeder_live.py`  
공개 요약: `docs/references/issue-lot-api.md` · `docs/references/multi-model-voting.md`

---

## 1. 테이블 역할

| 테이블 | 역할 | PK / FK |
|--------|------|---------|
| `lots` | 공정 SSOT (`id`, `timestamp`, 공정 9변수, `operator_id`) | PK=`id` |
| `lot_results` | 1단 결과 버퍼: `quality_defect`, `residual_li` (피더 실측 또는 AI NULL-fill) | PK=`seq`, **UNIQUE(`lot_id`)** |
| `judgment_lots` | 2단 판정: qd/residual/capacity/probability/spc · **대시보드 잔류 JOIN** | PK=`lot_id` → `lots.id` CASCADE |
| `analysis_lots` | 3단 위험·SPC·probability · **`scored_at`**=마지막 채점 시각 | PK=`lot_id` → `lots.id` CASCADE |
| `issues` | 심각+주의/이탈 시 자동 생성 (채점 후속) | FK → `lots.id` |
| `SPC_LOT` | (옵션) 외부 공정 미러 소스 → `lots` 적재 | 폴러 `spcLotSync` |

`lot_results`는 orphan DROP 대상이 **아님** (KEEP).

---

## 2. 데이터 유입

```
피더 produce
  → lots (공정 즉시)
  → lot_results stub (lot_id만, qd/residual NULL)
피더 deliver
  → +60분: lot_results.quality_defect (lot_id 기준 UPDATE, 실측이 AI보다 우선)
  → +24h: lot_results.residual_li
SPC_LOT (있을 때)
  → spcLotSync: 없는 lot_id만 lots INSERT 후 채점 큐에 포함
```

피더는 `judgment_lots` / `analysis_lots`에 **직접 쓰지 않는다**.

---

## 3. 채점 3단 파이프라인 (`updateLotScore`)

입력: `lots` 공정행 → ai-service `POST /predict-voting`.

```
1) lot_results
   - 행 없으면 INSERT (seq 재시도)
   - quality_defect / residual_li 는 COALESCE로 **NULL만** AI 채움
   - 피더 실측은 AI가 덮지 않음

2) judgment_lots
   - quality_defect / residual_li ← lot_results (없으면 voting)
   - capacity / probability ← voting
   - spc ← SPC 라벨
   - UPSERT 시 기존 실측/시드 컬럼은 COALESCE(기존, 신규)

3) analysis_lots
   - judgment 값을 입력으로 combineLotScore + SPC → risk_level / risk_reason / probability
   - scored_at = NOW() (INSERT·UPDATE 모두)
```

judgment만 차 있고 analysis/`scored_at`만 비면: `scoreAnalysisFromJudgment(lotId)` (voting 생략).

---

## 4. 폴러·큐 우선순위

| 폴러 | 주기 | 역할 |
|------|------|------|
| `spcLotSync` | ~60s | SPC→lots 미러 + 미채점 score |
| `analysisLotSyncPoller` | ~10m | 동일 미채점 조건 보강 (LIMIT 200) |

`pickUnscoredLotIds`:

- **A (~70%, timestamp DESC):** judgment 없음 · analysis/`probability`/`scored_at` 결손 · judgment residual/capacity NULL · **lot_results 행 없음**
- **B (잔여, ASC):** lot_results qd/residual NULL만 (analysis·judgment는 이미 찬 LOT)

**락:** score(+issues)가 끝나면 `running=false`. 그 **다음** `fillRiskReasonsForLots`(vLLM). risk_reason이 다음 틱을 막지 않음. vLLM 실패 시 규칙 문구 fallback (연동 삭제 아님).

backend 기동 시 ai-service autostart (`AI_SERVICE_AUTOSTART`, 기본 on) 후 폴러 시작.

---

## 5. 필드 흐름 요약

| 필드 | 1차 소스 | 소비처 |
|------|----------|--------|
| 공정 9변수 | `lots` / 피더·SPC | `/predict-voting`, SPC 이력 |
| `quality_defect` | 피더(+60m) 또는 AI → `lot_results` → `judgment_lots` | 대시보드·이슈 보조 |
| `residual_li` | 피더(+24h) 또는 AI → `lot_results` → `judgment_lots` | 대시보드 잔류·여유량 |
| `capacity` / `probability` | voting → `judgment_lots` (+ analysis.probability) | KPI·위험축 |
| `spc` / `spc_status` | SPC 엔진 | judgment.spc, analysis.spc_status |
| `risk_*` / `scored_at` | analysis 3단 | 이슈 자동생성·위험 Top |

---

## 6. NULL이 “정상”인 경우 vs “버그”

| 현상 | 정상 | 버그였던 경우(수정됨) |
|------|------|----------------------|
| `lot_results` 행 없음 | 구 피더(+60분 전) · 미연동 과거 LOT | 신규 lots만 있고 폴러가 옛 LR만 ASC로 집어 fill 미도달 |
| `residual_li` NULL | stub~+24h 사이 · 실측 전 | AI fill이 큐/락에 막힘 |
| `scored_at` NULL | (없어야 함) 신규 미채점 직전 | 미채점 조건에 scored_at 누락 → 고착 |
| `judgment` 없음 | 채점 전 순간 | 동일 큐 굶주림 |

---

## 7. 운영 주의

1. `lot_results.lot_id` UNIQUE — 피더/AI는 **lot_id**로 UPDATE·COALESCE.
2. `judgment_lots.quality_defect`는 NOT NULL — stub만 넣고 끝내지 않음; **score로 채움**.
3. 대시보드 잔류 SSOT는 **`judgment_lots`**, lab 버퍼는 **`lot_results`**.
4. 백필: `backend/scripts/backfill-judgment-lr-scored.ts` · 단건 E2E: `mock-lot-e2e.ts`.
5. DDL: `DB/schema.sql` · `DB/lot_results.sql` · `DB/alter_analysis_lots_add_scored_at.sql` · `DB/alter_lot_results_unique_lot_id.sql`.
