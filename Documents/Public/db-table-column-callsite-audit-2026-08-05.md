# DB 테이블 · 파라미터(컬럼) 호출처 상세 (2026-08-05)

- **DB:** 원격 MariaDB `kdt_project` (information_schema 재대조)
- **코드 범위:** `backend/src`, `backend/scripts`, `ai-service` 런타임, `frontend/src`, `frontend/plant_feeder_live.py`
- **저장소 schema:** `DB/schema.sql` (라이브보다 좁음 — §부록)
- **표기:** `앱 미참조` = 런타임 SQL/ORM에 컬럼명이 나오지 않음. DDL·시드 스크립트만인 경우 “스크립트만”으로 구분.
- **이름 변경 (2026-08-05):** `cathode_*_samples` → `cathode_*_data` 후 **앱 SSOT에서 제거** (score=`lots`)
- **제거 (2026-08-05):** MariaDB `cathode_clf_data` / `cathode_capacity_data` / `cathode_residual_data` — DROP: [`DB/drop_cathode_source_tables.sql`](../../DB/drop_cathode_source_tables.sql)
- **제거 (2026-08-05):** orphan SPC/`control_bounds` TABLE — DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql) (`SPC_LOT`·`SPC_LOT_results` 유지)
- **추가 (2026-08-05):** `judgment_lots` (`lot_id`, `quality_defect`, `capacity`, `residual_li`) FK→`lots.id` · 시드 + residual API JOIN
- **갱신 (2026-08-05):** `lots.residual_li` DROP · QC CSV 공정 재적재 · API residual ← `judgment_lots`
- **싱크 (2026-08-05):** `SPC_LOT`→`lots` + score · judgment NULL-fill · `npm run sync:spc-lots`

---

## 한눈에 보기

| # | 테이블/뷰 | 앱 연동 | 비고 |
|---|-----------|---------|------|
| ~~1–3~~ | ~~`cathode_*_data`~~ | **제거됨** | CSV 학습 유지 · 판정은 `judgment_lots` |
| ~~4~~ | ~~`control_bounds` TABLE~~ | **제거됨** | 앱 SSOT = `control_bounds.json` |
| 5 | `handover_history` | Issue · Knowledge | |
| 6 | `inquiries` | Inquiry | |
| 7 | `issues` | Issue (+ Knowledge API) | past-issues는 FE 미연결 |
| ~~8~~ | ~~`lot_results`~~ | **제거됨** | 피더 결과는 `SPC_LOT_results` |
| ~~9~~ | ~~`lot_spc_results`~~ | **제거됨** | |
| 10 | `lots` | Dashboard · Issue · score · sync | 공정만 (+ `analysis_lots` JOIN) |
| 10b | `judgment_lots` | Dashboard · Issue · score | probability·residual · NULL-fill AI · quality/capacity 시드 |
| ~~11~~ | ~~`spc_limits`~~ | **제거됨** | 앱은 `spcPhase1Limits.json` |
| 12 | `SPC_LOT` | 피더 · sync:spc-lots | → `lots` 미러 |
| 13 | `SPC_LOT_results` | 피더 | 기본 `RESULTS_TABLE` |
| 14 | `user_chat_messages` | Chat | ai-service MariaDB |
| 15 | `user_chat_threads` | Chat | |
| 16 | `user_settings` | Setting | |
| 17 | `users` | Auth · 전체 | |
| ~~18~~ | ~~`v_spc_charts`~~ | **제거됨** | |

---

## 1–3. `cathode_*_data` — **제거됨 (2026-08-05)**

다음 테이블은 앱·DDL에서 제거되었습니다. 원격 DROP: [`DB/drop_cathode_source_tables.sql`](../../DB/drop_cathode_source_tables.sql).

| 구 테이블 | 대체 |
|-----------|------|
| `cathode_clf_data` | 공정→`lots` · `quality_defect`→`judgment_lots` (+ CSV 학습) |
| `cathode_residual_data` | → `lots` (구 rename) · `residual_li`도 `judgment_lots`에 복사 |
| `cathode_capacity_data` | `capacity`→`judgment_lots` (+ CSV `cathode_reg_data.csv` 학습) |

## 10b. `judgment_lots`

**라이브 컬럼:** `lot_id`, `quality_defect`, `capacity`, `residual_li`, `probability`  
**FK:** `lot_id` → `lots.id`  
**적재:** `seed:judgment-lots` · score UPSERT **NULL만** (`/predict`→probability · `/predict-capacity` · `/predict-residual`)  
**앱:** dashboard `j.probability`→`defectProb`, `j.residual_li`→`residualLithium`.

---

## 4. `control_bounds` — TABLE **제거됨** · JSON 유지

### 4-A. DB 테이블 `control_bounds` — **제거됨 (2026-08-05)**

원격 DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql).

### 4-B. 파일 SSOT `ai-service/config/control_bounds.json` (유지)

| JSON 키 / 필드 | 어디에 적혀 있나 | 페이지 |
|----------------|------------------|--------|
| `sintering_temp`, `humidity` (+ `min`/`max`) | `backend/src/routes/settings.ts` (GET/PUT); `ai-service/agent/api_llm/bounds_cache.py`; `ai-service/agent/api_llm/whatif.py`; `frontend/src/api/settingsApi.ts`; `frontend/src/app/(shell)/setting/page.tsx` | `/setting` |

---

## 5. `handover_history`

**라이브 컬럼:** `history_id`, `issue_id`, `lot_id`, `risk_level`, `situation`, `action`, `cause`, `handover_from`, `handover_to`, `manager`, `assignee_user_id`, `event_date`, `category`, `snapshot_json`, `archived_at`

| 파라미터 | 어디에 적혀 있나 | FE DTO / 페이지 |
|----------|------------------|-----------------|
| `history_id` | `backend/src/services/issue.service.ts` SELECT/INSERT 후 조회 (~460–606) | `historyId` · `/issue`, `/knowledge` |
| `issue_id` | INSERT (~548+); SELECT; UPDATE by issue (~251); migrate 스크립트 | `issueId` |
| `lot_id` | INSERT / SELECT | `lotId` |
| `risk_level` | INSERT (예: 하드코드 값); SELECT | `riskLevel` |
| `situation` | INSERT (본문); SELECT | `situation` |
| `action` | UPDATE `'완료'` (~251, ~591); 목록 필터 `status=pending\|completed` | `action` (`NULL`/`완료`) |
| `cause` | SELECT만; INSERT `NULL` | `cause` · **항상 비움에 가까움** |
| `handover_from` | INSERT/UPDATE; `migrate-handover-fk.ts` | `handoverFrom` |
| `handover_to` | UPDATE/INSERT; migrate | `handoverTo` |
| `manager` | INSERT (= 작성자); UPDATE coalesce | `manager` |
| `assignee_user_id` | INSERT (~549–553) | **목록 DTO 미포함** |
| `event_date` | INSERT/SELECT | `eventDate` / `date` |
| `category` | INSERT/SELECT | `category` |
| `snapshot_json` | INSERT (교대 시간 등); SELECT 파싱 (~445–458) | `shiftStart`/`shiftEnd` |
| `archived_at` | SELECT (DB 기본값) | `archivedAt` |

**API:** `POST/GET/PATCH /api/knowledge/handover*` · Issue 완료 시 `PUT /api/issues/:id` 연동 UPDATE.  
**FE:** `frontend/src/api/issueApi.ts` · `/issue`, `/knowledge`.

---

## 6. `inquiries`

**라이브 컬럼:** `id`, `inquiry_code`, `category`, `visibility`, `status`, `title`, `content`, `author_user_id`, `author_name`, `author_email`, `answer`, `answered_at`, `answered_by_user_id`, `created_at`

| 파라미터 | 어디에 적혀 있나 | FE |
|----------|------------------|-----|
| `id` | `inquiry.service.ts` 내부 PK / ORDER (~197) | **미노출** (FE `id` = `inquiry_code`) |
| `inquiry_code` | INSERT/WHERE/SELECT (~124–286) | DTO `id` |
| `category` | WHERE/INSERT/`toDto` | `category` |
| `visibility` | 권한 `canViewFull` (~64–68); INSERT | `visibility` |
| `status` | WHERE; INSERT `'접수'`; UPDATE `'답변완료'` | `status` |
| `title` | search/INSERT/`toDto` | `title` |
| `content` | search/INSERT/`toDto` | `content` |
| `author_user_id` | 비공개 판별; INSERT | **DTO 없음** |
| `author_name` | INSERT/`toDto.author` | `author` |
| `author_email` | INSERT | **DTO·목록 미노출** |
| `answer` | UPDATE/`toDto` | `answer` |
| `answered_at` | UPDATE NOW/`toDto` | `answeredAt` |
| `answered_by_user_id` | UPDATE (~293) | **DTO 없음** |
| `created_at` | 날짜 필터/ORDER/`toDto.date` | `date` |

**페이지:** `/inquiry` · `frontend/src/api/inquiryApi.ts`  
**스크립트:** `backend/scripts/migrate-inquiries.ts`, `seed-inquiries.ts`

---

## 7. `issues`

**라이브 컬럼:** `issue_id`, `lot_id`, `occurred_at`, `risk_level`, `status`, `title`, `action_content`, `assignee_user_id`, `completed_at`

| 파라미터 | 어디에 적혀 있나 | FE DTO |
|----------|------------------|--------|
| `issue_id` | `issue.service.ts` 전역; 자동채번 (~402+); `lot.service.ts` 위험 LOT 이슈 생성; rollback/seed | `issueId` |
| `lot_id` | list 필터/INSERT/JOIN | `lotId` |
| `occurred_at` | DATE 필터/SELECT/INSERT | `occurredAt` |
| `risk_level` | 필터/INSERT/SELECT | `riskLevel` |
| `status` | 필터/UPDATE/INSERT; past-issues는 `완료` | `status` |
| `title` | SELECT/INSERT | `title` |
| `action_content` | UPDATE (~233); detail SELECT | `actionContent` |
| `assignee_user_id` | UPDATE; JOIN `users` 이름 (~172,289289); handover용 INSERT | `assigneeUserId` + `assigneeName` |
| `completed_at` | UPDATE CASE; past 목록 | `completedAt` / `completed` |

**API:** `/api/issues*` · `GET /api/knowledge/past-issues*` (**FE `issueApi` 미연결**)  
**페이지:** `/issue` — 목록/상태 등은 API, **SPC·`defectProbability`·`processData`는 UI mock** (`frontend/src/app/(shell)/issue/page.tsx` ~552–844, `MOCK_ISSUES_BY_ID`). mock 필드는 **DB 컬럼이 아님**.

---

## 8. `lot_results` — **제거됨 (2026-08-05)**

피더 결과 테이블은 `SPC_LOT_results`. DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql).

---

## 9. `lot_spc_results` — **제거됨 (2026-08-05)**

앱 SPC는 `spcEngine` + `spcPhase1Limits.json` → `analysis_lots.spc_status`. DROP: 동일 SQL.

---

## 10. `lots`

**라이브 컬럼 (QC CSV, 2026-08-05):**  
`id`, `timestamp`, `d50`, `d90`, `metal_impurity`, `lithium_input`, `additive_ratio`, `process_time`, `sintering_temp`, `humidity`, `tank_pressure`, `operator_id`  
(`residual_li` DROP — API는 `judgment_lots.residual_li`)

앱 SELECT 별칭: `id AS lot_id`, `timestamp AS recorded_at`, `j.residual_li AS residual_lithium`, `0 AS quality_defect`.  
JOIN: `analysis_lots` + `judgment_lots` on `lot_id = lots.id`. 이슈 ID 규칙 `ISS-yyMMdd-001` 유지.  
재적재: `npm run reload:lots-qc` ← `cathode_qc_reg_data.csv` (residual 미적재).

| 파라미터 | 어디에 적혀 있나 | FE / 페이지 |
|----------|------------------|--------------|
| `lot_id` | `lot.service.ts`, `dashboard.service.ts`, `issue.service.ts`(JOIN/시스템 LOT), score/rollback 스크립트 | `lotId` · `/dashboard`, `/issue` |
| `recorded_at` | SELECT/INSERT/ORDER/DATE 필터; CSV 내보내기 | `recordedAt` |
| `d50` ~ `tank_pressure` | LOT_SELECT; CSV upsert; score INSERT; dashboard | camelCase 공정값 |
| `operator_id` | 동일 | |
| `quality_defect` | SELECT `0 AS` (판정 테이블 미연동) | |
| `defect_prob` | `analysis_lots`; score UPDATE; 필터; detail | `defectProb` · Issue mock `defectProbability`와 **별개** |
| `residual_lithium` | `judgment_lots.residual_li` JOIN; score NULL-fill UPSERT; 마진 계산; export | `residualLithium` |
| `residual_margin` **(DB 컬럼)** | **SQL 컬럼 미사용**. API/CSV는 **계산값** (`dashboard.service.ts` export) | `residualMargin` (계산) |
| `spc_status` | `analysis_lots`; score UPDATE; LIKE 필터; SPC 상세 | `spcStatus` |
| `risk_level` | `analysis_lots`; risk-top / ensureIssues / 시스템 LOT | `riskLevel` |
| `risk_reason` | `analysis_lots`; UPDATE/SELECT/export | `riskReason` |
| `clf_model_version` | **앱 미참조** (라이브만 / schema.sql 없음) | — |
| `residual_model_version` | **앱 미참조** | — |
| `spc_limit_version` | **앱 미참조** | — |
| `scored_at` | `analysis_lots`; score `NOW()`; 목록 필터; daily status; rollback | |
| `created_at` | **앱 SELECT 목록 없음** (DB 기본값) | — |
| `updated_at` | **앱 SELECT 목록 없음** | — |

**주의:** `plant_feeder_live.py` 기본은 `SPC_LOT` / `SPC_LOT_results` (운영 `lots`와 별개 스키마).

---

## 11. `spc_limits` — **제거됨 (2026-08-05)**

파일 대체: `backend/config/spcPhase1Limits.json` ← `spcEngine.ts`. DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql).

---

## 12. `SPC_LOT`

**라이브 컬럼:** `seq`, `lot_id`, `produced_at`, `d50`, `d90`, `metal_impurity`, `lithium_input`, `additive_ratio`, `process_time`, `sintering_temp`, `humidity`, `tank_pressure`, `operator_id`

| 파라미터 | 어디에 적혀 있나 |
|----------|------------------|
| `seq` | `plant_feeder_live.py` CREATE/INSERT/MAX (~157–227), 기본 `LOTS_TABLE=SPC_LOT` |
| `lot_id` | 동일 |
| `produced_at` | 동일 (**`recorded_at` 아님**) |
| `d50` ~ `tank_pressure` | `NUM_VARS` |
| `operator_id` | 동일 |

**backend/src · frontend/src · ai-service:** 앱 런타임 미참조.  
**스크립트:** `backend/scripts/sync-spc-lots.ts` (`npm run sync:spc-lots`) — `lot_id`→`lots.id`, `produced_at`→`timestamp`, 공정 미러 후 score.

---

## 13. `SPC_LOT_results`

**라이브 컬럼:** `seq`, `lot_id`, `quality_defect`, `residual_li`, `measured_at`

| 파라미터 | 어디에 적혀 있나 |
|----------|------------------|
| 전부 | `plant_feeder_live.py` 기본 `RESULTS_TABLE=SPC_LOT_results` (~163–201) |
| 그 외 | **앱 미참조** |

---

## 14. `user_chat_messages`

**라이브 컬럼:** `id`, `thread_id`, `role`, `content`, `mode`, `provider`, `sources`, `created_at`

| 파라미터 | 어디에 적혀 있나 | FE |
|----------|------------------|-----|
| `id` | `ai-service/agent/chat_history_store.py` INSERT/`LAST_INSERT_ID` (~450–476); 메시지 목록 SELECT에는 보통 미포함 | UI 복원 키로 **거의 미사용** |
| `thread_id` | INSERT/WHERE (~310, 450+) | thread API |
| `role` | SELECT/INSERT | |
| `content` | SELECT/INSERT | 말풍선 |
| `mode` | SELECT/INSERT | |
| `provider` | SELECT/INSERT | |
| `sources` | SELECT/INSERT (JSON) | RAG 소스 패널 |
| `created_at` | SELECT/INSERT | `created_at` |

**경유:** Express 챗/스레드 라우트 → ai-service.  
**UI:** `GlobalChatbot` (`/main` 등), `SecurityChatbot` (`/security`).  
**DDL:** `DB/schema.sql`, `DB/user_chat_tables.sql`

---

## 15. `user_chat_threads`

**라이브 컬럼:** `id`, `user_id`, `channel`, `title`, `created_at`, `updated_at`

| 파라미터 | 어디에 적혀 있나 | FE |
|----------|------------------|-----|
| `id` | `chat_history_store.py` SELECT/INSERT/UPDATE (~174–189, 468) | `id` |
| `user_id` | INSERT; 목록 WHERE; 소유권 | `user_id` |
| `channel` | INSERT; 필터 (`security` \| `general`) | `channel` |
| `title` | INSERT (대개 NULL); list SELECT | `title` · **항상 NULL 수준** |
| `created_at` | INSERT/SELECT | |
| `updated_at` | INSERT; 메시지 시 touch (~181, 468); ORDER | |

Prisma 스키마 매핑이 있어도 **FE는 Prisma 직접 미호출**.

---

## 16. `user_settings`

**라이브 컬럼:** `user_id`, `font_size`, `theme_mode`, `refresh_interval`, `updated_at`

| 파라미터 | 어디에 적혀 있나 | FE |
|----------|------------------|-----|
| `user_id` | `backend/src/services/userSettings.service.ts` INSERT/SELECT (~64–104) | 로그인 사용자 |
| `font_size` | SELECT/INSERT/UPDATE → `fontSize` | `/setting` |
| `theme_mode` | → `themeMode` | |
| `refresh_interval` | → `refreshInterval` | |
| `updated_at` | SELECT → `updatedAt` | |

**API:** `/api/auth/settings*`. 레거시 컬럼 제거: `backend/scripts/migrate-schema-cleanup.ts`.

---

## 17. `users`

**라이브 컬럼:** `id`, `user_id`, `password`, `name`, `phone`, `email`, `created_at`, `updated_at`

| 파라미터 | 어디에 적혀 있나 | FE / 페이지 |
|----------|------------------|--------------|
| `id` | `auth.service.ts` UPDATE/DELETE WHERE `id` (~137–225) | 미노출 |
| `user_id` | 로그인/가입/프로필; FK (settings, chat, issues, inquiries) | `userId` · `/login` |
| `password` | hash 비교 / UPDATE | 로그인 · PersonalInfoModal (변경) |
| `name` | INSERT/SELECT/`toAuthUser`; 이슈 assignee JOIN | 헤더 · 인수인계 이름 |
| `phone` | INSERT/UPDATE/아이디찾기 | PersonalInfoModal |
| `email` | INSERT/UPDATE/profile | PersonalInfoModal |
| `created_at` | `SELECT *`로 올 수 있으나 **DTO/UI 미노출** | — |
| `updated_at` | 동일 | — |

**API:** `/api/auth/*` · PersonalInfoModal (`AUTH_CHANGED_EVENT`).

---

## 18. `v_spc_charts` — **제거됨 (2026-08-05)**

VIEW DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql).  
대시보드 SPC는 `lots`(+`analysis_lots`) 이력 + `spcPhase1Limits.json` (`getLotSpcDetail` 등).

---

## 부록 A. `DB/schema.sql` ↔ 라이브 갭

| 라이브만 (schema.sql 없음) | 내용 |
|----------------------------|------|
| 테이블 | `SPC_LOT`, `SPC_LOT_results` (피더) |
| *(제거됨)* | `control_bounds`, `lot_results`, `lot_spc_results`, `spc_limits`, `v_spc_charts` |

제어한계 SSOT = JSON (`control_bounds.json`). SPC Phase1 = `spcPhase1Limits.json`.

---

## 부록 B. Issue UI mock (DB 컬럼 아님)

`frontend/src/app/(shell)/issue/page.tsx`:

| UI 필드 | 출처 | DB 대응 |
|---------|------|---------|
| `processData` | `createProcessData` / `MOCK_ISSUES_BY_ID` (~552–844) | `lots` 공정 컬럼과 **미연결** |
| `defectProbability` | mock 숫자 | `lots.defect_prob`와 **미연결** |
| 목록 `issueId` 등 | `issueApi` → `issues` | 연동됨 |

과거 이슈 API `GET /api/knowledge/past-issues*` — **FE 미배선**.

---

## 부록 C. FE 페이지 ↔ 테이블

| 페이지 | API | DB |
|--------|-----|-----|
| `/login` · PersonalInfoModal | `/api/auth/*` | `users` |
| `/setting` | auth settings + control-bounds | `user_settings` + **JSON** |
| `/dashboard` | `/api/dashboard/*` | `lots` |
| `/issue` | `/api/issues*`, handover | `issues`, `handover_history`, (`lots` 일부) |
| `/knowledge` | handover-history | `handover_history` (완료) |
| `/inquiry` | `/api/inquiries*` | `inquiries` |
| 챗 `/main`·`/security` | chat routes → ai-service | `user_chat_*` |

---

*문서 생성: 2026-08-05 · 코드·라이브 DB 재대조 · Documents/Public*
