# Issue / LOT / Dashboard API (백엔드)

최종 갱신: 2026-08-04

## 규칙

- 이슈 목록: `status <> 완료` AND `risk_level IN (심각, 주의)` — **안정 제외** (레거시 `높음|중간|A|B`도 조회 호환)
- 목록 DTO에 `actionContent` 없음 (상세·PUT에만)
- **완료 → 라이브러리 「과거 자료」** (`completed_at`). 인수인계 이력과 분리
- 위험 LOT Top: `GET /api/lots/risk-top`
- 채점: ai-service `POST /predict` + `POST /predict-residual` + Phase I SPC(첨부 한계) + Nelson 2–8 → `lots` 갱신
  - **불량확률 입력:** `cathode_clf_samples`
  - **잔류리튬 입력:** `cathode_residual_samples`
  - **SPC:** 9공정 listwise 완전 LOT만 (Phase I = 완전사례 초기 2,000 한계 고정)
- 여유량 = `4000 - residual_lithium` (DB 비저장, API 계산)
- 목록의 `date`, `riskLevel`, `status`는 잘못된 값을 보내면 `400`

## risk / SPC 용어

| 필드 | 값 |
|------|-----|
| `risk_level` | `심각` \| `주의` \| `안정` |
| `spc_status` | `이탈` \| `주의` \| `안정` \| `이탈, 주의` |

내부 산정(표에는 위험등급만 단계 표시): 불량확률 ≥40% / 20–40% / &lt;20%, 잔류리튬 ≥3500 / 3000–&lt;3500 / &lt;3000, SPC 이탈→심각·주의→주의. **worst-of**.

## 엔드포인트

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| GET | `/api/lots/risk-top?limit=` | 선택 | 심각·주의 LOT |
| GET | `/api/lots/:lotId` | 선택 | LOT 상세 (+ residualMargin) |
| POST | `/api/lots/import` | JWT | CSV→lots 공정값 적재. `?score=1` 시 채점 |
| POST | `/api/lots/score` | JWT | 기존 lots AI+SPC 재채점 (`limit`,`offset`,`concurrency`) |
| GET | `/api/dashboard/lot-risks` | 선택 | 대시보드 LOT 위험 목록(페이지·필터) |
| GET | `/api/dashboard/lot-risks/:lotId` | 선택 | 상세 + SPC 이탈/주의 관리도 시계열. `actionContent=null` |
| GET | `/api/dashboard/production-trend` | 선택 | 일별 생산량·양품·불량·실측/AI 불량률 |
| GET | `/api/dashboard/production-daily` | 선택 | 생산 상세(고정 FI 4컬럼) |
| GET | `/api/dashboard/lots.csv?date=YYYY-MM-DD` | 선택 | 해당일 LOT CSV |
| GET | `/api/dashboard/feature-importance?topK=5` | 선택 | clf SHAP Top-k |
| GET | `/api/issues` | 선택 | 미완료∩심각\|주의 |
| GET\|PUT | `/api/issues/:issueId` | PUT=JWT | 이슈 상세·저장 |
| GET | `/api/knowledge/past-issues` | 선택 | 과거 자료 |
| GET | `/api/knowledge/past-issues/:issueId` | 선택 | 과거 자료 상세 |
| GET | `/api/knowledge/handover-history` | 선택 | 인수인계(후속) |

## 배치 채점

```bash
cd backend
# ai-service(:8800) clf·residual ready 필요
npm run score:lots
npm run score:lots -- --limit=100 --concurrency=4
```

Phase I 한계: [`backend/config/spcPhase1Limits.json`](../../backend/config/spcPhase1Limits.json)
(listwise 결측 제거 후 초기 2000 LOT I-MR).

## DDL

- [`DB/issue_lot_tables.sql`](../../DB/issue_lot_tables.sql)
- [`DB/schema.sql`](../../DB/schema.sql)

## FE

- 대시보드: `GET /api/dashboard/*` (`dashboardApi.ts`)
- 이슈 목록 risk 필터: `심각` / `주의` / `안정`
