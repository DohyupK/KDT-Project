# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-08-01 (보안 RAG 다문서·거절출처·요약)

모노레포 기준입니다. `frontend` / `backend` / `ai-service`를 모두 포함합니다.

**기능·단가:** [`docs/references/ai-service-feature-catalog.md`](./references/ai-service-feature-catalog.md)  
**clf 스키마:** [`docs/references/cathode-clf-schema.md`](./references/cathode-clf-schema.md)  
**reg 스키마:** [`docs/references/cathode-reg-schema.md`](./references/cathode-reg-schema.md)  
**residual 스키마:** [`docs/references/cathode-residual-schema.md`](./references/cathode-residual-schema.md)  
**control/outcome:** [`docs/references/optimization-event-schema.md`](./references/optimization-event-schema.md)  
**보안 골격:** [`docs/references/security-chat-skeleton.md`](./references/security-chat-skeleton.md)  
**보안 RAG:** [`docs/references/secure-rag.md`](./references/secure-rag.md)  
**vLLM 수동 기동:** [`docs/references/vllm-setup.md`](./references/vllm-setup.md)  
**보안 챗 타임아웃 플랜:** [`docs/plans/2026-07-30-secure-chat-timeout-selfquery.md`](./plans/2026-07-30-secure-chat-timeout-selfquery.md)  
**일지:** [`docs/work-log/2026-08-01.md`](./work-log/2026-08-01.md) · [`2026-07-31`](./work-log/2026-07-31.md) · [`2026-07-30`](./work-log/2026-07-30.md) · [`2026-07-29`](./work-log/2026-07-29.md)

---

## 제품 방향

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
일반 챗: 등록 LLM + registry ready 헤드(clf · capacity · residual) · whatif.  
보안·기밀: **`/security` · 전체화면 오버레이** → 로컬 OpenAI 호환 LLM + **보안 전용 RAG** (일반 Knowledge와 분리).

---

## 완료 (최근 · 08-01)

- 보안 RAG: 자연 흐름(요약도 retrieve) · `[NO_DOC]` 통제 토큰 · doc당 2청크 · 쿼리 확장/prior 폴백
- 옛 CSV 풀 MD 정리 재ingest · FE 칩 doc_id dedupe / 다중 청크 패널

## 완료 (07-31)

- 보안 문서 경로 → 루트 `Documents/` · PDF/다포맷 ingest  
- `user_chat_threads` / `user_chat_messages` + Prisma · BigInt JSON 패치  
- 멀티턴 B: FE는 `message`+`thread_id`+`user_id`만 · Express 패스스루 · ai-service MariaDB 문맥 (`SECURE_GENERATE=0` · `no_docs` 유지)
- 채팅 스레드 복원 API/UI · Documents pdf/txt/csv/xlsx → `Documents/ai-service/*.md` + watchdog ingest

## 다음 우선순위

1. TS 불량률 모델 — 기상 CSV 확보 후  
2. Login/MariaDB 정식 연동 점검 (멀티턴은 `user_id` 필요)
3. Maximize / 보안 챗 수동 E2E (요약·다문서·거절 출처)

## 제약

- `AppData.fillThreshold` 필드명 변경 금지  
- 회사 API 키는 `/security` → DB  
- 가짜 outcome/CSV 금지 · outcome은 수동(또는 추후 MES) 입력만  
- 보안 채널 클라우드 폴백 금지 · RAG 무히트(+ prior sources 없음) 시 환각 금지  
- clf는 capacity/residual을 입력으로 쓰지 않음  
- 레거시 control/chat `CHAT_STORE` sqlite 병행 가능 · 멀티턴 SSOT는 `user_chat_*`  
- embed/rerank는 **CPU 강제** (채팅 LLM은 외부 로컬 서버)  
- SelfQuery 교체 시에도 **unfiltered 재시도 + min_score** 제거 금지  
- `.env` 시크릿 커밋 금지
