# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-07-30 (보안 RAG E2E · Gemma 지연 대응 · 발췌 모드)

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
**일지:** [`docs/work-log/2026-07-30.md`](./work-log/2026-07-30.md) · [`2026-07-29`](./work-log/2026-07-29.md)

---

## 제품 방향

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
일반 챗: 등록 LLM + registry ready 헤드(clf · capacity · residual) · whatif.  
보안·기밀: **`/security` · 전체화면 오버레이** → 로컬 OpenAI 호환 LLM + **보안 전용 RAG** (일반 Knowledge와 분리).

---

## 완료 (최근 · 07-30)

- fixture 6건 · 가드레일 C/D · min_score 0.05 · Self-Query(A) · API E2E 스모크  
- FE/BE 보안 챗 **180s** · stage/trace 진단 · `SECURE_SELF_QUERY=0`  
- **관련 질의 500 해소:** `SECURE_GENERATE=0` → `rag_extractive` 발췌+출처 (Gemma 요약은 선택)

## 다음 우선순위

1. Maximize 수동 체크 (출처 패널) · (선택) 경량 로컬 모델 + `SECURE_GENERATE=1`  
2. TS 불량률 모델 — 기상 CSV 확보 후  
3. Login/MariaDB 정식 — 홀딩 유지  

## 제약

- `AppData.fillThreshold` 필드명 변경 금지  
- 회사 API 키는 `/security` → DB  
- 가짜 outcome/CSV 금지 · outcome은 수동(또는 추후 MES) 입력만  
- 보안 채널 클라우드 폴백 금지 · RAG 무히트 시 환각 금지  
- clf는 capacity/residual을 입력으로 쓰지 않음  
- control/chat 스토어는 **sqlite** 유지  
- embed/rerank는 **CPU 강제** (채팅 LLM은 외부 로컬 서버)  
- SelfQuery 교체 시에도 **unfiltered 재시도 + min_score** 제거 금지  
- `.env` 시크릿 커밋 금지
