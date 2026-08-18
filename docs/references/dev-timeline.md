# 개발 통합 리포트

기간: **2026-07-15 ~ 2026-08-18**  
근거: [`docs/work-log/`](../work-log/)만. 일지 원문은 그대로 둔다. 없는 수치·PASS는 적지 않음.

증거 자료: [`bug-fix-report.md`](./bug-fix-report.md) · [`test-report.md`](./test-report.md)

---

## 2026-07-15

원문: [`2026-07-15.md`](../work-log/2026-07-15.md)

- **Vite React 초기화** — TypeScript, Tailwind, Axios·Zustand·Recharts
- **8페이지 라우팅** — Main·Dashboard·Login·Issue·Inquiry·Knowledge·Management·Setting
- **`fillThreshold` 보존** — `AppData` 타입·API 뼈대·가상 TS 데이터

---

## 2026-07-21

원문: [`2026-07-21.md`](../work-log/2026-07-21.md)

- **Next App Router 이전** — Vite/`react-router` 제거, 개발 주소 `:3000`
- **8 라우트 HTTP 200** — `/`·`/dashboard`·`/login`·`/issue`·`/inquiry`·`/knowledge`·`/management`·`/setting`
- **`npm run build` 성공**

---

## 2026-07-22

원문: [`2026-07-22.md`](../work-log/2026-07-22.md)

- **루트 `docs/`** — 방향·일지·명세를 모노레포 기준으로 모음, README/AGENTS 역할 분리
- **AppShell** — 사이드바·헤더 통합, 헤더에서 `/login` 이동
- **Issue / Knowledge / Inquiry / Dashboard UI** — Vite 원본을 Next로 이전, `npm run build` 성공
- **clf 스키마·학습 프롬프트** — O/X 진단 1단계 문서화 (학습 코드는 당일 미구현)

---

## 2026-07-23

원문: [`2026-07-23.md`](../work-log/2026-07-23.md)

- **clf Optuna 100** — Test ROC-AUC 0.940, PR 0.709, acc 0.840, F1 0.529 @ thr 0.4
- **FastAPI `/predict` · `/chat`** — Production `train_pipeline`, GlobalChatbot Main 실연동
- **시나리오 3건 PASS** — 보안 redirect, 유사 질문 3회, 샘플 predict(template)

---

## 2026-07-24

원문: [`2026-07-24.md`](../work-log/2026-07-24.md)

- **LLM 길이 라우팅** — ≤300 Groq, 301+ Gemini, 실패 시 Groq 폴백
- **LOT 진단 · What-if · Approve/Undo · 한계치 API** — 챗봇 E2E 연결
- **API 스모크 14/14** — 보안·유사3·진단·what-if·approve·Groq

---

## 2026-07-28

원문: [`2026-07-28.md`](../work-log/2026-07-28.md)

- **3헤드 레지스트리** — clf → capacity → residual, ready 헤드 전부 자동 호출
- **residual 본학습** — 로컬 smoke ≈ 1567 ppm
- **보안 탭 API 금고** — LLM 키는 DB만, `.env` API 폴백 없음

---

## 2026-07-29

원문: [`2026-07-29.md`](../work-log/2026-07-29.md)

- **Outcome 파이프라인** — capacity 130–250, residual 500–8000, Undo 가드, 스모크 5건 PASS
- **보안 전체화면 + RAG** — Qdrant/BM25/RRF, bge-m3·reranker CPU

---

## 2026-07-30

원문: [`2026-07-30.md`](../work-log/2026-07-30.md)

- **보안 RAG E2E** — fixture 6건, 가드레일, `smoke_secure_rag_e2e.py` SMOKE_PASS
- **관련 질의 HTTP 500 RCA** — LM Studio 지연, FE/BE 타임아웃 180s
- **`SECURE_GENERATE=0`** — 발췌 모드로 안정화

---

## 2026-07-31

원문: [`2026-07-31.md`](../work-log/2026-07-31.md)

- **`Documents/` ingest** — PDF/TXT/MD → Qdrant `secure_docs`, 듀얼 엔진(문서/표)
- **멀티턴 MariaDB** — `user_chat_threads` / `user_chat_messages`
- **단기·장기 기억** — 윈도우 6 + Qdrant `chat_history` Top-K=3

---

## 2026-08-01

원문: [`2026-08-01.md`](../work-log/2026-08-01.md)

- **보안 RAG 자연 흐름** — 요약 의도여도 retrieve 유지
- **문서 다양성** — 동일 `doc_id`당 최대 2청크
- **follow-up / `no_docs`** — 짧은 후속은 쿼리 확장, 주제 전환+0건은 prior 금지

---

## 2026-08-02

원문: [`2026-08-02.md`](../work-log/2026-08-02.md)

- **보안 챗 SSE** — EXPLAIN + `meta`/`delta`/`done`, UI는 스트림 경로
- **csv_lake analytics** — Polars 스캔, 실패 시 RAG 폴백
- **RAG 핫픽스** — rerank soft fallback, `FOLLOWUP_RE` 정리, retrieve `top_k` 8→12

---

## 2026-08-04

원문: [`2026-08-04.md`](../work-log/2026-08-04.md)

- **Knowledge 사내 문서 열람** — `Documents/` READ-ONLY, 경로 샌드박스
- **인수인계 DB** — `handover_history`, 로그인 `users.name`
- **이슈 ID `ISS-yyMMdd-001`** — 인수인계 등록 시 자동 발급
- **한글 `X-Doc-Path` 500** — `encodeURIComponent`로 수정

---

## 2026-08-05

원문: [`2026-08-05.md`](../work-log/2026-08-05.md)

- **SPC → LOT 폴링** — `SPC_LOT` 미러 후 60초 채점
- **`judgment_lots.probability`** — 대시보드 불량확률 바 연동
- **대시보드 residual** — `judgment_lots.residual_li` JOIN

---

## 2026-08-06

원문: [`2026-08-06-07.md`](../work-log/2026-08-06-07.md)

- **생산 추이** — 파란 막대=생산량, 빨간 선=불량률, 일/주/월
- **judgment 품질 기록** — 운영 임계 0.4, Recall ~0.91, Precision ~0.35
- **블렌딩·상관** — 설계 메모만 (운영은 `/predict-voting`)

---

## 2026-08-07

원문: [`2026-08-06-07.md`](../work-log/2026-08-06-07.md)

- **학습 방법 SSOT** — 시간순 80/20, Optuna, Test는 메트릭·임계만
- **model0/1/2 병렬 비교** — 단일 best 없음, 블렌딩/투표 아님

---

## 2026-08-08

원문: [`2026-08-08.md`](../work-log/2026-08-08.md)

- **위험 LOT Top · 당일 KPI** — 최근 3일·심각·SPC 이탈, 양품/불량 임계 0.8
- **대시보드 위험등급·생산 상세** — 실데이터, CSV 목업 제거
- **이슈 리팩터** — 저장=완료 필수, 목업 삭제, 완료 건은 Knowledge 과거 자료
- **머지 conflict** — `Mainpage_API`↔hotfix, 대시보드 JSX·`lotScore.ts`

---

## 2026-08-10

원문: [`2026-08-10.md`](../work-log/2026-08-10.md)

- **`N_FOLDS` 5→6** — clf/reg/residual Optuna 공유, 당일 재학습은 안 함
- **학습 SSOT** — [`model-training-methods.md`](./model-training-methods.md)
- **`temp` 채점 10000/0** — `combineLotScore` `defect_prob` 수정 후 ~277s, `judgment_lots` 미변경

---

## 2026-08-13

원문: [`2026-08-13.md`](../work-log/2026-08-13.md)

- **이슈 보고서 메일** — n8n 웹훅 → Gmail OAuth
- **포트 기동 주체** — `npm run dev` vs Docker(n8n·Qdrant)

---

## 2026-08-14

원문: [`2026-08-14.md`](../work-log/2026-08-14.md)

- **Lightsail 16GB** — 앱·DB·n8n·Qdrant는 CPU, vLLM은 이 PC
- **Grafana env** — `NEXT_PUBLIC_GRAFANA_HOST` / `PORT`
- **문서·룰 정리** — 미구현 계획 삭제, 패키지 README→`packages.md`
- **대시보드 공란** — `next dev` `allowedDevOrigins` (공인 IP)

---

## 2026-08-15

원문: [`2026-08-15.md`](../work-log/2026-08-15.md)

- **보안 챗 = DB 큐 + PC 워커** — AWS는 질문만, 이 PC가 검색+vLLM. `ssh -R` 제거
- **기동 분리** — AWS `npm run dev`, 이 PC `npm run security-pc`
- **`JUDGMENT_LOTS.` 한정자** — Linux 소문자면 INSERT 실패 → 대시보드/이슈가 어제 LOT에 고정
- **이슈는 채점보다 늦음** — 부트 `skipIssues` + AWS vLLM 타임아웃 (버그 아님)
- **`spc_chart_json`** — 실시간 채점 시 NULL이면 채움

---

## 2026-08-18

원문: [`2026-08-18.md`](../work-log/2026-08-18.md)

- **버그수정·테스트 증거 리포트** — [`bug-fix-report.md`](./bug-fix-report.md) · [`test-report.md`](./test-report.md)
- **이 통합 리포트** — 일지 날짜별 요약
