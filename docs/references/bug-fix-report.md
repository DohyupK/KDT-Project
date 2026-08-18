# 버그 수정 리포트 (증거자료)

기간: **2026-07-21 ~ 2026-08-15**  
작성: 2026-08-18  
근거: `docs/work-log/` · `docs/references/` · 해당 소스. **일지·명세에 없는 수치·PASS는 적지 않음.**

관련: [`test-report.md`](./test-report.md) · [`issue-lot-api.md`](./issue-lot-api.md) · [`scenario-smoke-checklist.md`](./scenario-smoke-checklist.md)

---

## 1. 요약

모노레포(`frontend` / `backend` / `ai-service`) 개발 중 재현된 장애·충돌을 원인·조치와 함께 모았다.  
브랜치 머지 충돌, Linux MariaDB 대소문자, Next.js `next dev` origin, 보안 RAG 타임아웃, 채점 파이프라인 NULL/한정자가 반복 이슈였다.

이슈 INSERT가 채점보다 늦은 현상(08-15)은 **버그가 아니라** 부트 `skipIssues` + 폴러 순서 + AWS vLLM 타임아웃이다. §5에 구분해서 적는다.

---

## 2. 프론트 · 연동

| ID | 일자 | 증상 | 원인 | 조치 | 근거 |
|----|------|------|------|------|------|
| B-FE-01 | 07-21 | Vite 앱을 Next App Router로 옮기는 중 라우트·빌드 확인 필요 | 프레임워크 전환 (`react-router` → App Router, `:5173` → `:3000`) | 8개 라우트 HTTP 200, `npm run build` 성공 | [`2026-07-21.md`](../work-log/2026-07-21.md) |
| B-FE-02 | 07-23 | Express가 기동하지 않음 | `backend/src/db.ts` mariadb import 문법 오류 | import 수정 후 기동 | [`2026-07-23.md`](../work-log/2026-07-23.md) §10 |
| B-FE-03 | 07-23 | 챗 세션 카운트가 MariaDB에서 안 됨 | root 비밀번호 없음 | `CHAT_STORE=sqlite` (memory/mariadb도 지원) | 동일 |
| B-FE-04 | 07-24 | 챗봇이 LOT 진단만 반복 | 안내 칩이 LLM 경로로 감 | 「챗봇 안내」칩은 API 없이 로컬 문구 | [`2026-07-24.md`](../work-log/2026-07-24.md) §6 |
| B-FE-05 | 08-02 | 보안 챗 SSE가 사용자 말풍선을 덮어씀 | React 배치로 `idRef`가 user/ai에 같은 id | `userId`/`aiId`를 setState 전 상수로 고정, 스트림은 `role==='ai'`만 | [`2026-08-02.md`](../work-log/2026-08-02.md) |
| B-FE-06 | 08-04 | 한글 문서 경로 열람 시 HTTP 500 | `X-Doc-Path`에 한글 → `ERR_INVALID_CHAR` | `encodeURIComponent` ([`docs.ts`](../../backend/src/routes/docs.ts)) | [`2026-08-04.md`](../work-log/2026-08-04.md) |
| B-FE-07 | 08-14 | Lightsail 공인 IP로 `/dashboard` HTML 200, 표 0건, API 호출 없음 | `next dev`가 공인 IP origin의 `/_next`를 막아 클라이언트 JS 미실행 | `allowedDevOrigins`에 공인 IP 후 재시작 | [`aws-dashboard-empty-next-dev.md`](./aws-dashboard-empty-next-dev.md) · [`2026-08-14.md`](../work-log/2026-08-14.md) |
| B-FE-08 | 08-15 | 챗봇 팝업에서 출처 패널이 대화를 밀어 UI 깨짐 | `activeDocChunks` 시 `flex-row` + 원문 aside | `showSources={isExpanded}` — 전체화면에서만 칩·패널·클릭 출처 | [`SecurityChatbot.tsx`](../../frontend/src/components/chat/SecurityChatbot.tsx) · [`GlobalChatbot.tsx`](../../frontend/src/components/chat/GlobalChatbot.tsx) |

---

## 3. 브랜치 충돌

| ID | 일자 | 증상 | 원인 | 조치 | 근거 |
|----|------|------|------|------|------|
| B-MR-01 | 08-08 | 머지 후 대시보드·채점 파일이 깨짐 | `Mainpage_API` ↔ hotfix PR 머지, JSX footer/Grafana · `lotScore.ts` conflict marker | 충돌 마커 제거·정리 | [`2026-08-08.md`](../work-log/2026-08-08.md) |
| B-MR-02 | 08-14 | compose·컨테이너가 여러 벌로 남음 | `docker-compose.yml` Git 충돌 (n8n 버전·Windows env) | n8n `2.34.5` + `127.0.0.1` 바인드 해소. 남는 컨테이너 `kdt-n8n` · `kdt-qdrant` | [`2026-08-14.md`](../work-log/2026-08-14.md) |

---

## 4. AI · RAG · 보안 챗

| ID | 일자 | 증상 | 원인 | 조치 | 근거 |
|----|------|------|------|------|------|
| B-AI-01 | 07-30 | 관련 질의만 오래 기다리다 「연결 실패」/`[500]`. 무관 질의는 `security_no_docs` | LM Studio(Gemma) generate 지연 → 프록시 500 | 타임아웃/trace 진단, `SECURE_GENERATE=0` 발췌 모드. `=1`이어도 실패 시 extractive 폴백 | [`2026-07-30.md`](../work-log/2026-07-30.md) |
| B-AI-02 | 07-31 | 보안챗 socket hang up, generate가 비거나 `.`만 | Next→Express hang-up + 프롬프트 과다. Q2_K는 `content: ""` / `finish_reason=stop` | proxyTimeout 190s · Express 200s · 단기 history만 generate. **파싱 버그 아님** — `.env` `SECURE_GENERATE=0` | [`2026-07-31.md`](../work-log/2026-07-31.md) |
| B-AI-03 | 08-02 | rerank `min_score` 컷 후 히트 0 | 컷이 너무 빡셈 | fused 상위 1–2건 soft fallback, 문서당 2건 캡 | [`2026-08-02.md`](../work-log/2026-08-02.md) |
| B-AI-04 | 08-02 | `그럼 EDA 분석…`이 후속질문으로 오탐 | `FOLLOWUP_RE`에 `그럼`/`관련` 등 | 화제 전환 표현 제거, 문맥 의존만 유지 | 동일 |
| B-AI-05 | 08-02 | 문서·엔진은 `top_k=12`인데 retrieve만 8 | `node_retrieve` 불일치 | [`secure_graph.py`](../../ai-service/agent/secure_graph.py) `top_k=12` | 동일 |

---

## 5. 채점 · DB

| ID | 일자 | 증상 | 원인 | 조치 | 근거 |
|----|------|------|------|------|------|
| B-DB-01 | 08-10 | `score:lots-to-temp` 재실행 필요 | `combineLotScore`의 `defect_prob` 미정의 | 필드 수정 후 재실행. `lots` 1만 → `` `temp` `` **ok=10000 failed=0** (~277s) | [`2026-08-10.md`](../work-log/2026-08-10.md) |
| B-DB-02 | 08-15 | 대시보드·이슈가 `LOT-20260814` / `ISS-260814`에 고정. `SPC_LOT`/`LOTS`는 당일 있음 | Linux `lower_case_table_names=0`에서 `COALESCE(judgment_lots.col)` → Unknown column, **JUDGMENT INSERT 전체 실패** | `COALESCE(JUDGMENT_LOTS.col, VALUES(...))`. AWS backend 재기동 후 당일 LOT 채점 | [`issue-lot-api.md`](./issue-lot-api.md) · [`2026-08-15.md`](../work-log/2026-08-15.md) |
| B-DB-03 | 08-15 | `ANALYSIS_LOTS.spc_chart_json` NULL 다수 | 실시간 `scoreAllLots`가 차트 스냅샷을 계산만 하고 UPSERT에 안 넣음 | `updateLotScore` → `upsertAnalysisScore(..., spcChart)`, NULL일 때만 `COALESCE` 채움 | [`lot.service.ts`](../../backend/src/services/lot.service.ts) · [`issue-lot-api.md`](./issue-lot-api.md) |

### 버그 아님 (오인 가능)

| 현상 | 설명 | 근거 |
|------|------|------|
| 이슈 INSERT가 JUDGMENT/ANALYSIS보다 늦음 | 부트 채점 `skipIssues: true`. 폴러는 채점 → risk_reason vLLM → 권고조치 → `ensureIssuesForRiskLots`. AWS `:8001` 없으면 LOT마다 `SECURE_VLLM_TIMEOUT`(90초) 대기. 이슈 ID 날짜 = `LOTS.timestamp` | [`issue-lot-api.md`](./issue-lot-api.md) · [`2026-08-15.md`](../work-log/2026-08-15.md) |
| 대시보드가 `JUDGMENT_LOTS INNER JOIN LOTS` | 피더 `LOTS`만 있고 판정이 없으면 목록 0건. 08-15는 한정자 버그로 판정이 안 들어가 같은 증상 | [`issue-lot-api.md`](./issue-lot-api.md) |

재기동 후 라이브 대조(08-15): 오늘 LOT 99건이 `LOTS` / `JUDGMENT_LOTS` / `ANALYSIS_LOTS` 최신 ID까지 일치, 심각 39건 이슈 존재(`ISS-260815-039`). `spc_chart_json`은 당시 오늘 분 전부 NULL(채움 코드 배포 전).

---

## 6. 시각자료 (캡처 설명)

본문에는 이미지를 넣지 않는다. 아래에 화면·로그 설명을 적고 캡처를 붙인다.

| 번호 | 설명 | 캡처 |
|------|------|------|
| V1 | B-FE-07: 공인 IP `/dashboard` 표 0건, Network에 `/api/dashboard/lot-risks` 없음 | (캡처 붙여 넣을 자리) |
| V2 | B-FE-07 복구 후 같은 URL에 LOT 위험 테이블이 채워진 화면 | (캡처 붙여 넣을 자리) |
| V3 | B-FE-08: 챗봇 팝업에서 출처 패널이 대화를 가른 화면 | (캡처 붙여 넣을 자리) |
| V4 | B-FE-08 수정 후 팝업(출처 없음) vs 전체화면(출처 패널) | (캡처 붙여 넣을 자리) |
| V5 | B-MR-01: 머지 conflict marker가 남은 `lotScore.ts` 또는 대시보드 JSX | (캡처 붙여 넣을 자리) |
| V6 | B-AI-01: 보안 챗 관련 질의 HTTP 500 / 연결 실패 UI | (캡처 붙여 넣을 자리) |
| V7 | B-DB-02: 이슈·대시보드가 08-14 LOT에 멈춘 화면 | (캡처 붙여 넣을 자리) |
| V8 | B-DB-02 재기동 후 `JUDGMENT_LOTS`/`ISS-260815-*`가 따라잡힌 화면 또는 SQL 결과 | (캡처 붙여 넣을 자리) |
| V9 | B-DB-03: `ANALYSIS_LOTS.spc_chart_json` NULL 건수 조회 | (캡처 붙여 넣을 자리) |
| V10 | 터미널: `[spc-sync]` / `[analysis-sync]` 또는 `Unknown column` 로그 | (캡처 붙여 넣을 자리) |
