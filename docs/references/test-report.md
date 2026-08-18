# 테스트 리포트 (증거자료)

기간: **2026-07-21 ~ 2026-08-15**  
작성: 2026-08-18  
근거: `docs/work-log/` · `docs/references/` · `backend/tests/` · 스모크 스크립트. **일지·명세에 없는 PASS·수치는 만들지 않음.**  
이 문서를 쓸 때 `npm test` · 학습 · 스모크를 **재실행하지 않음** (실행 전 승인 룰).

관련: [`bug-fix-report.md`](./bug-fix-report.md) · [`scenario-smoke-checklist.md`](./scenario-smoke-checklist.md) · [`issue-lot-api.md`](./issue-lot-api.md)

명령: `backend`에서 `npm test` → `package.json` `test` 스크립트가 아래 5개 파일을 지정한다.

---

## 1. 단위 테스트 (`backend/tests/`)

파일에 **정의된 검증 항목**만 적는다. 일지에 `npm test` 전체 PASS 기록은 없다.

### 1.1 [`issue.validation.test.ts`](../../backend/tests/issue.validation.test.ts)

| 케이스 | 검증 |
|--------|------|
| 이슈 목록 필터 | 지원하는 쿼리 파라미터를 수락 |
| 잘못된 날짜 | 목록 조회 날짜 형식 거부 |
| 위험 필터 | 지원하지 않는 `risk` 값 거부 |
| 잘못된 PUT | DB 조회 전에 말형 업데이트 값 거부 |

### 1.2 [`lotScore.spc.test.ts`](../../backend/tests/lotScore.spc.test.ts)

| 케이스 | 검증 |
|--------|------|
| risk 어휘 | 위험 라벨 정규화 |
| defect / residual | 불량·잔류 Li 구간 |
| worst-of | 축 중 최악 위험 |
| `combineLotScore` | worst-of + USL 사유 |
| Phase I | 한계선 로드 · OOC |
| Nelson 2 | 현재 관측 한쪽 연속, 과거 연속 무시, 마지막 9점이 같은 CL 쪽일 때만 발화 |

### 1.3 [`docxPreview.test.ts`](../../backend/tests/docxPreview.test.ts)

| 케이스 | 검증 |
|--------|------|
| 빈 문단 | self-closing 빈 문단이 다음 개정 이력을 삼키지 않음 |
| plain-text | 개정 이력 표를 다시 만듦 |
| 서명란 | 빈 작성/검토/승인 표를 미리보기 HTML에서 뺌 |
| QMS docx | 원본이 개정 이력을 3열 표로 유지 (파일 I/O) |

### 1.4 [`lotRecommendedAction.summary.test.ts`](../../backend/tests/lotRecommendedAction.summary.test.ts)

| 케이스 | 검증 |
|--------|------|
| 안정 | 모니터링 템플릿 |
| raiser | 값·증가/감소, 상위 3개 |
| leftover | 「하락」→「감소하여」, 「권장 45%RH」 생략 |

### 1.5 [`issueReportHtml.test.ts`](../../backend/tests/issueReportHtml.test.ts)

| 케이스 | 검증 |
|--------|------|
| LOT 보고서 HTML | JSON이 아니고 print 스크립트 없음 |
| `JSON.parse` | HTML이면 throw (`mail_contents`는 JSON 아님) |
| KPI | 심각 · SPC 이상 건수 |
| callback secret | 불일치 거부 |

---

## 2. 스모크 스크립트

스크립트가 **검사하는 범위**와, 일지에 **남은 실행 결과**를 구분한다. 결과가 없으면 「일지 없음」.

| 스크립트 | 검사 범위 | 일지에 남은 결과 |
|----------|-----------|------------------|
| [`ai-service/scripts/smoke_secure_rag_e2e.py`](../../ai-service/scripts/smoke_secure_rag_e2e.py) | `/health`, 보안 RAG HIT(`security_rag`+`sources`+`[출처:]`) · MISS(`security_no_docs`). 브라우저 없음 | **07-30** `CHAT_VLLM_MODEL=gemma` **SMOKE_PASS** (소성 HIT · 점심 MISS). `SECURE_SELF_QUERY=0` 재측정: 소성 ~105s · 코팅 ~141s · 점심 ~5s · **SMOKE_PASS**. 모델명 미설정은 SMOKE_FAIL ([`2026-07-30.md`](../work-log/2026-07-30.md)) |
| [`backend/scripts/smoke-full-features.ts`](../../backend/scripts/smoke-full-features.ts) | AI health · `/predict-voting` · LOTS/JUDGMENT/ANALYSIS 체인 · mock LOT 3단 채점 · `spc_chart_json` · bootScore · vLLM 호출 가능 여부 | 일지에 전체 PASS/FAIL 숫자 **없음** |
| [`backend/scripts/smoke-issue-content.ts`](../../backend/scripts/smoke-issue-content.ts) | 심각+(주의\|이탈) LOT 5건, `risk_reason`을 API LLM으로 요약 후 `ISSUES` INSERT | **08-08** 스모크 5건을 이 스크립트로 생성. PASS 표는 없음 ([`2026-08-08.md`](../work-log/2026-08-08.md)) |
| [`backend/scripts/smoke-send-email.ts`](../../backend/scripts/smoke-send-email.ts) | `SEND_EMAIL` · HTML 왕복 · `email_check` · n8n 콜백. Gmail 실발송은 webhook+env가 있을 때만 | 일지 없음 |
| [`backend/scripts/smoke-header-notif-state.ts`](../../backend/scripts/smoke-header-notif-state.ts) | 헤더 알림 read/dismiss 병합·중복 제거·DB 유지 후 스모크 ID 정리 | 일지 없음 |
| [`backend/scripts/check-risk-reason-smoke.ts`](../../backend/scripts/check-risk-reason-smoke.ts) | `ANALYSIS_LOTS` 50건에서 심각/주의인데 사유에 「기준 범위」가 있는지 출력 (exit 0, 자동 fail 아님) | 일지 없음 |

---

## 3. 시나리오 체크리스트

명세: [`scenario-smoke-checklist.md`](./scenario-smoke-checklist.md)  
항목: 보안 게이트 · 유사 질문 3회 · 화면 컨텍스트 일반 챗 · What-if · Approve/Undo · 한계치 API · LLM 길이 라우팅.

**일지에 적힌 실행만:**

| 일자 | 결과 | 근거 |
|------|------|------|
| 07-21 | `npm run build` 성공. 개발 서버 8 라우트(`/`, `/dashboard`, `/login`, `/issue`, `/inquiry`, `/knowledge`, `/management`, `/setting`) HTTP 200 | [`2026-07-21.md`](../work-log/2026-07-21.md) |
| 07-23 | 시나리오 3건 **PASS**: (1) 보안 키워드 → Express redirect, AI 미호출 (`chat_requests` 불변) (2) 유사 질문 3회 → `[사용 가이드]` (`chat_store=sqlite`) (3) 샘플 LOT predict + Top-4·확률 + 한국어 답 (**template**; LLM 키 없어 `mode=llm` 미검증). CDP `/main` 챗봇 버튼 **PASS** | [`2026-07-23.md`](../work-log/2026-07-23.md) |
| 07-24 | API 스모크 **14/14** (보안·유사3·진단·what-if·approve·Groq) | [`2026-07-24.md`](../work-log/2026-07-24.md) |
| 07-29 | Outcome 스모크 **PASS** 5건: 정상 200 echo, capacity 범위 밖 400, residual 소수 3자리 400, residual 범위 밖 400, revert 후 outcome 400. Secure RAG: `소성 온도 SOP` hit score≈0.997, `점심 메뉴` no-docs | [`2026-07-29.md`](../work-log/2026-07-29.md) |

체크리스트의 화면 컨텍스트·Setting 한계치 UI 등, 위 표에 없는 항목은 **이 기간 일지에 PASS가 없다**.

---

## 4. 운영 · 학습 실측

일지·명세에 숫자가 있는 것만.

| 일자 | 항목 | 실측 | 근거 |
|------|------|------|------|
| 07-23 | clf Optuna 2-trial 스모크 | Test ROC 0.931 / PR 0.671 | [`2026-07-23.md`](../work-log/2026-07-23.md) |
| 07-23 | clf Optuna 100 trial | Test ROC-AUC **0.940**, PR-AUC **0.709**, accuracy 0.840, F1 0.529 @ thr **0.4**. Top-4: metal_impurity, temp_dev_from_800, humidity, temp_x_humidity | 동일 |
| 07-24 | 100-trial 모델 복구 | `test_roc_auc` ≈ **0.9404**, threshold **0.4** | [`2026-07-24.md`](../work-log/2026-07-24.md) |
| 07-28 | residual 로컬 smoke | `predict_residual_li` 샘플 → `residual_li` ≈ **1567 ppm**, `unit: ppm` | [`2026-07-28.md`](../work-log/2026-07-28.md) |
| 08-10 | `score:lots-to-temp` | `lots` 1만 → `` `temp` `` **ok=10000 failed=0** (~277s). `combineLotScore` `defect_prob` 수정 후 | [`2026-08-10.md`](../work-log/2026-08-10.md) |
| 08-15 | 채점 3단 라이브 | 오늘 LOT **99건**이 `LOTS` / `JUDGMENT_LOTS` / `ANALYSIS_LOTS` 최신 ID까지 일치 (`LOT-20260815-31607`) | [`issue-lot-api.md`](./issue-lot-api.md) · [`2026-08-15.md`](../work-log/2026-08-15.md) |
| 08-15 | 심각 → 이슈 | 오늘 심각 **39건** 전부 이슈 있음, 최신 `ISS-260815-039` | 동일 라이브 대조 · [`bug-fix-report.md`](./bug-fix-report.md) §5 |

08-15 `spc_chart_json`은 당시 실시간 경로에서 NULL이 많았다. 채움 코드는 그 이후 UPSERT에 넣었다. 배포 전 오늘 분 전부가 채워졌다는 기록은 없다.

---

## 5. 시각자료 (캡처 설명)

본문에는 이미지를 넣지 않는다. 아래에 화면·로그 설명을 적고 캡처를 붙인다.

| 번호 | 설명 | 캡처 |
|------|------|------|
| T1 | 07-21: 개발 서버 8 라우트 HTTP 200 또는 `npm run build` 성공 로그 | (캡처 붙여 넣을 자리) |
| T2 | 07-23: 시나리오 3건 PASS (보안 redirect · 유사 질문 · 샘플 predict) | (캡처 붙여 넣을 자리) |
| T3 | 07-23: Optuna 100 trial Test ROC-AUC 0.940 학습 로그/메타 | (캡처 붙여 넣을 자리) |
| T4 | 07-24: API 스모크 14/14 콘솔 | (캡처 붙여 넣을 자리) |
| T5 | 07-28: residual ≈ 1567 ppm 응답 | (캡처 붙여 넣을 자리) |
| T6 | 07-29: Outcome 스모크 5건 HTTP 표에 해당하는 요청/응답 | (캡처 붙여 넣을 자리) |
| T7 | 07-30: `smoke_secure_rag_e2e.py` SMOKE_PASS (소성 HIT · 점심 MISS) | (캡처 붙여 넣을 자리) |
| T8 | 08-10: `temp` ok=10000 failed=0 콘솔 | (캡처 붙여 넣을 자리) |
| T9 | 08-15: 당일 LOT 99건이 세 테이블 최신 ID까지 같은 SQL 결과 (`LOT-20260815-31607`) | (캡처 붙여 넣을 자리) |
| T10 | 08-15: 오늘 심각 39건 · `ISS-260815-039` | (캡처 붙여 넣을 자리) |
| T11 | `backend` `npm test` 5파일 실행 로그 (이 문서 작성 시에는 돌리지 않음) | (캡처 붙여 넣을 자리) |
