# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-08-03 (BM25 핫리로드 · 로그 회전 · SSE · analytics · 3단계)

모노레포 기준입니다. `frontend` / `backend` / `ai-service`를 모두 포함합니다.

**기능·단가:** [`docs/references/ai-service-feature-catalog.md`](./references/ai-service-feature-catalog.md)  
**clf 스키마:** [`docs/references/cathode-clf-schema.md`](./references/cathode-clf-schema.md)  
**reg 스키마:** [`docs/references/cathode-reg-schema.md`](./references/cathode-reg-schema.md)  
**residual 스키마:** [`docs/references/cathode-residual-schema.md`](./references/cathode-residual-schema.md)  
**control/outcome:** [`docs/references/optimization-event-schema.md`](./references/optimization-event-schema.md)  
**보안 골격:** [`docs/references/security-chat-skeleton.md`](./references/security-chat-skeleton.md)  
**보안 RAG:** [`docs/references/secure-rag.md`](./references/secure-rag.md)  
**LLM·RAG 튜닝 총정리:** [`docs/references/LLM 튜닝.md`](./references/LLM%20튜닝.md)  
**챗봇 가이드(스택·이용):** [`docs/references/security-chatbot-guide.md`](./references/security-chatbot-guide.md)  
**vLLM 수동 기동:** [`docs/references/vllm-setup.md`](./references/vllm-setup.md)  
**보안 챗 타임아웃 플랜:** [`docs/plans/2026-07-30-secure-chat-timeout-selfquery.md`](./plans/2026-07-30-secure-chat-timeout-selfquery.md)  
**일지:** [`docs/work-log/2026-08-08.md`](./work-log/2026-08-08.md) · [`2026-08-06`](./work-log/2026-08-06.md) · [`2026-08-05`](./work-log/2026-08-05.md) · [`2026-08-02`](./work-log/2026-08-02.md) · [`2026-08-01`](./work-log/2026-08-01.md) · [`2026-07-31`](./work-log/2026-07-31.md) · [`2026-07-30`](./work-log/2026-07-30.md)

> LLM/RAG 세팅·기법·다음 할 일 SSOT: [`docs/references/LLM 튜닝.md`](./references/LLM%20튜닝.md) §0·§4·§9

---

## 제품 방향

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
일반 챗: 등록 LLM + registry ready 헤드(clf · capacity · residual) · whatif.  
보안·기밀: **`/security` · 전체화면 오버레이** → 로컬 OpenAI 호환 LLM + **보안 전용 RAG** (일반 Knowledge와 분리).

---

## 완료 (최근 · 08-02)

- 보안 챗 1단계: `EXPLAIN_SUFFIX` + SSE · DB 단일 책임 · SYS partial-hold · FE 말풍선 id 핫픽스
- **2단계 analytics:** `node_analytics` (Polars `csv_lake`) · Smart Fallback→RAG · XGB 안내 · 기능 목록 반영
- **RAG 품질 핫픽스:** rerank soft fallback(fused 상위 1–2) · `FOLLOWUP_RE`에서 `그럼|그래서|…` 제거(도메인 명사 하드코딩 없음) · 동작 검증됨
- **3단계 검색 튜닝:** chunk 400/50 · `SECURE_RERANK_MIN_SCORE` 기본 0.15 · `top_k=12`/`rerank_top_n=6` · soft_fallback `max_score` 로그 · full rebuild ingest
- **운영 보완:** BM25 `reload_bm25` 핫리로드(워처) · `RotatingFileHandler` 10MB×5 · CLI ingest는 재시작
- 기법 총정리: [`docs/references/LLM 튜닝.md`](./references/LLM%20튜닝.md) (코드 대조·문서 교정 포함)
- JSON `/security-chat` 유지 · UI는 스트림 경로
- 스택·변경 스냅샷: [`docs/work-log/2026-08-02.md`](./work-log/2026-08-02.md)

## 완료 (08-01)

- 보안 RAG: 자연 흐름 라우팅 · `[SYS_RAG_EMPTY_RESULT]` hard override · doc당 2청크 · 쿼리 확장/prior 폴백
- 인덱스 CSV 풀 MD 정리 · FE 칩 dedupe / 다중 청크 패널
- 가이드 문서: [`security-chatbot-guide.md`](./references/security-chatbot-guide.md)

## 완료 (07-31)

- 보안 문서 경로 → 루트 `Documents/` · PDF/다포맷 ingest  
- `user_chat_threads` / `user_chat_messages` + Prisma · BigInt JSON 패치  
- 멀티턴 B: FE는 `message`+`thread_id`+`user_id`만 · Express 패스스루 · ai-service MariaDB 문맥 (`SECURE_GENERATE=0` · `no_docs` 유지)
- 채팅 스레드 복원 API/UI · Documents pdf/txt/csv/xlsx → `Documents/<Clearance>/Markdown/*.md` + watchdog ingest

## 다음 우선순위

1. TS 불량률 모델 — 기상 CSV 확보 후  
2. Login/MariaDB 정식 연동 점검 (멀티턴은 `user_id` 필요)
3. Maximize / 보안 챗 SSE·analytics E2E (`csv_lake`에 실CSV 올린 뒤 집계)

## 제약

- `AppData.fillThreshold` 필드명 변경 금지  
- 회사 API 키는 `/security` → DB  
- 가짜 outcome/CSV 금지 · outcome은 수동(또는 추후 MES) 입력만  
- 보안 채널 클라우드 폴백 금지 · RAG 무히트(+ prior sources 없음) 시 환각 금지  
- clf는 capacity/residual을 입력으로 쓰지 않음  
- 레거시 control/chat `CHAT_STORE` sqlite 병행 가능 · 멀티턴 SSOT는 `user_chat_*`  
- embed/rerank는 **CPU 강제** (채팅 LLM은 외부 로컬 서버)  
- SelfQuery 교체 시에도 **unfiltered 재시도 + min_score** 제거 금지  
- 모노레포 루트 `.env`만 사용 · 시크릿 커밋 금지
