# Issue / LOT / 과거 자료 API (백엔드)

최종 갱신: 2026-08-14

## 규칙

- 이슈 목록: `completed_at IS NULL` (미완료). `risk_level`은 **`analysis_lots` JOIN** (issues에 컬럼 없음)
- 목록 DTO에 `actionContent` 없음 (상세·PUT에만)
- **완료 → 라이브러리 「과거 자료」** (`completed_at IS NOT NULL`). **인수인계 이력으로 넣지 않음**
- **이슈 저장(FE):** 「조치 완료 여부」체크 필수 · `completed: true`만 PUT (미완료 draft 없음)
- 인수인계(`handover_history`): `issues`와 **독립** (no `issue_id`) · `handover_content` · `handover_from`/`handover_to` · `created_at`/`archived_at` · Knowledge는 `archivedAt||createdAt` 일시 표시
- **이슈 ID:** `ISS-yyMMdd-001` 일별 순번은 **issues** 전용. 인수인계 등록은 이슈를 만들지 않음.
- **이슈 자동 생성:** `analysis_lots.risk_level = '심각'` 인 완전 공정 LOT만 (`ensureIssuesForRiskLots`; SPC 이탈 등은 이미 risk_level에 반영). SPC/분석 폴러는 **채점 대상이 없어도** 매 틱 시드 실행.
- **`issue_content`:** `risk_reason` → 로컬 vLLM 한 문장 요약 (`composeIssueContentViaVllm`). 실패 시 `buildIssueTitle` fallback. 폴러는 **score → risk_reason → 이슈 시드** 순.
- 과거 자료: 완료 이슈(`completed_at IS NOT NULL`) 목록 API
- 위험 LOT Top: `GET /api/lots/risk-top` — 최근 3일 · `risk_level` 심각 (`analysis_lots` JOIN)
- **이슈 보고서 메일:** 신규 Top LOT → HTML을 `send_email.mail_contents`에 넣고 n8n → Gmail API. 수신은 `user_settings.email_check = 'O'`. SSOT: [`issue-report.md`](./issue-report.md)
- 당일 KPI: `GET /api/lots/daily-kpi` — 당일 00시~ · `analysis_lots.probability` · 임계 0.8
- **채점 3단 SSOT** (`lot.service` `updateLotScore`). 앙상블 가중: [`multi-model-voting.md`](./multi-model-voting.md).  
  1. `/predict-voting` → **`lot_results`** NULL-fill (`quality_defect`·`residual_li`만; 피더 실측은 COALESCE로 불변)  
  2. **`judgment_lots`** — qd/residual ← `lot_results`, capacity/probability ← voting, `spc` ← SPC; 기존 실측/시드는 `COALESCE` 유지  
  3. **`analysis_lots`** — **judgment 기준 2차 추론** (`combineLotScore` + SPC → risk/`scored_at`); judgment만 찬·analysis만 빈 경우 `scoreAnalysisFromJudgment`  
- **`lot_results`:** 피더 `produce` 시 **`lot_id` stub 즉시** (qd/residual NULL) · +60분 qd · +24h residual · 그 전·미연동은 AI NULL-fill. `lot_id` UNIQUE.  
- **`lot_results` / residual NULL FAQ:** 추론 실패가 아님. 피더 지연(+60분/+24h) · 과거 미연동 · **폴러가 옛 LR만 ASC로 집어 신규를 굶기면** AI fill도 안 돌아 NULL 고착(버그→큐 우선순위 수정).  
- **폴러:** 백엔드 기동 시 **즉시** SPC sync + analysis sync 틱 + `SCORE_ON_BOOT`(기본 on) 1회 **채점만**(risk_reason/이슈는 폴러). 이후 SPC ~60s · analysis ~10m. A큐(judgment/analysis/`scored_at`/LR행 결손·**최신 DESC**) ~70% → B큐(LR qd/residual NULL·ASC). **score 락 해제 후** `risk_reason`(vLLM) → 이슈 시드.
  - 미채점: analysis/`probability`/`scored_at`/judgment residual·capacity **또는** `lot_results` 행/`residual_li`/`quality_defect` NULL
  - 피더 실측이 `lot_results`에 있으면 AI가 **덮지 않음**(COALESCE) · 대시보드 잔류는 계속 `judgment_lots`
- **피더:** `frontend/plant_feeder_live.py` → `SPC_LOT` / `SPC_LOT_results` (qd +60분, residual +24h). 앱 `lots`는 피더가 직접 쓰지 않음. backend `spcLotSync`(~60s)가 `SPC_LOT` → `lots` 미러 후 채점.
- 목록의 `date`, `riskLevel`은 잘못된 값을 보내면 `400`을 반환 (**`status` 필터 없음**).

## 테이블 분리 (`lots` / `analysis_lots` / `issues`)

| 테이블 | 역할 |
|--------|------|
| `lots` | CSV명 SSOT: `id`, `timestamp`, 공정 9, `operator_id` |
| `lot_results` | **1단** 결과 버퍼: `quality_defect`·`residual_li`(피더 실측 또는 AI NULL-fill) · DDL [`DB/lot_results.sql`](../../DB/lot_results.sql) |
| `judgment_lots` | **2단** 판정: qd/residual←`lot_results`, capacity/prob←voting · 대시보드 잔류 JOIN |
| `analysis_lots` | **3단** 채점(judgment 2차 추론): `lot_id` **FK → `lots.id`**, `probability`, `spc_status`, `risk_level`, `risk_reason`, `created_at`, **`scored_at`** |
| `issues` | `issue_id`, `lot_id`, `issue_content`, `action_content`, `assignee_user_id`, `completed_at`, `created_at` — **no status / no risk_level** |

- 마이그레이션: `npm run migrate:issues-refactor` ([`backend/scripts/migrate-issues-refactor.ts`](../../backend/scripts/migrate-issues-refactor.ts)) — **기존 issues 행 전량 삭제** 후 스키마 정렬
- DDL: [`DB/schema.sql`](../../DB/schema.sql), [`DB/issue_lot_tables.sql`](../../DB/issue_lot_tables.sql), [`DB/alter_issues_refactor.sql`](../../DB/alter_issues_refactor.sql), [`DB/alter_analysis_lots_add_scored_at.sql`](../../DB/alter_analysis_lots_add_scored_at.sql), [`DB/send_email.sql`](../../DB/send_email.sql)

## 엔드포인트

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| GET | `/api/lots/risk-top?page=1&pageSize=8` | 선택 | 최근 3일·심각 LOT (`analysis_lots`) |
| GET | `/api/lots/daily-kpi` | 선택 | 당일 probability 양품/불량 KPI (임계 0.8) |
| GET | `/api/lots/q-cost` | 선택 | 품질 비용 KPI |
| GET | `/api/lots/:lotId` | 선택 | LOT 상세 (공정+채점 JOIN) |
| POST | `/api/lots/import` | JWT | CSV→`lots` 공정 적재·채점(+`analysis_lots`) + 이슈 시드 |
| POST | `/api/lots/score` | JWT | 미채점 LOT 채점 |
| GET | `/api/issues` | 선택 | 미완료 (`completed_at IS NULL`); `riskLevel`은 analysis_lots |
| GET | `/api/issues/:issueId` | 선택 | 상세(조치내용 포함) |
| PUT | `/api/issues/:issueId` | JWT | body: `actionContent`, `completed` — **FE 저장은 `completed: true`만** (미완료 draft PUT 없음). `completed_at = NOW()`, `action_content` 저장, 담당자=`users` 로그인 사용자 |
| GET | `/api/knowledge/past-issues` | 선택 | **과거 자료** (`completed_at IS NOT NULL`) |
| GET | `/api/knowledge/past-issues/:issueId` | 선택 | 과거 자료 상세(조치·LOT JOIN) |
| GET | `/api/knowledge/handover-history` | 선택 | 인수인계 (`?status=pending\|completed`) |
| POST | `/api/knowledge/handover` | JWT | 인수인계 등록 |
| POST | `/api/knowledge/analyze` | JWT | Knowledge 분석 (`AI_Library_analysis`) |
| GET | `/api/dashboard/lot-risks` | 선택 | 대시보드 위험 LOT |
| GET | `/api/dashboard/lot-risks/:lotId` | 선택 | 대시보드 LOT 상세 |
| GET | `/api/dashboard/production-trend` | 선택 | 생산 추이 |
| GET | `/api/dashboard/production-daily` | 선택 | 일별 생산 |
| GET | `/api/dashboard/lots.csv` | 선택 | LOT CSV 내보내기 |
| GET | `/api/dashboard/feature-importance` | 선택 | 피처 중요도 |
| POST | `/api/internal/n8n/send-email-result` | `N8N_WEBHOOK_SECRET` | n8n 콜백. `{ id, send: 'O'\|'X' }` → `send_email.send` |

## DTO 필드

| UI / JSON | DB |
|-----------|-----|
| `issueId` | `issues.issue_id` |
| `createdAt` | `issues.created_at` |
| `lotId` | `issues.lot_id` |
| `riskLevel` | `analysis_lots.risk_level` (JOIN) |
| `spcStatus` | `analysis_lots.spc_status` (목록·필터) |
| `issueContent` | `issues.issue_content` |
| `actionContent` | `issues.action_content` |
| `completed` / `completedAt` | `completed_at IS NOT NULL` / `completed_at` |
| `analysis` (상세) | `analysis_lots` 스냅샷: `lotId`, `probability`, `spcStatus`, `riskLevel`, `riskReason`, `createdAt`, **`scoredAt`** |

## 이슈 상세 분석 UI

- `GET /api/issues/:issueId` → `analysis`로 `analysis_lots` 표시 (`probability` · `risk_level` · `spc_status` · `risk_reason`)

## 이슈 페이지 시드

- SQL: [`DB/issues_seed.sql`](../../DB/issues_seed.sql) — mock LOT만; **issues INSERT 없음**(빈 테이블 유지)
- 실행: `npm run seed:issues`
- 담당자 매핑·구 mock 이슈 행은 제거됨

## 과거 자료 목록

위험도·처리상태 **미포함**.

| UI | 필드 |
|----|------|
| 이슈 ID | `issueId` |
| 일시 | `createdAt` |
| LOT-ID | `lotId` |
| 이슈 내용 | `issueContent` |
| 담당자 | `assigneeName` |
| 처리날짜 | `completedAt` |

완료 판정: `completed_at IS NOT NULL`만.

## FE

- 이슈 페이지 목록은 `GET /api/issues`의 미완료 데이터.
- 행 선택 시 `GET /api/issues/:issueId` → 담당자 `assigneeName`(`users.name`), 조치 `actionContent`, **`analysis`(analysis_lots)**.
- **저장 = 완료만:** 「조치 완료 여부」 체크 필수. JWT + `PUT` (`actionContent`, `completed: true`) → `completed_at` 설정 후 목록에서 제거 · Knowledge 「과거 자료」에 표시.
- 처리 상태(`status`) UI/필터 없음.
