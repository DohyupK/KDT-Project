# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-08-14 (문서 중복 정리)

모노레포 `frontend` / `backend` / `ai-service`.  
목록: [`catalog.md`](./catalog.md) · 패키지: [`packages.md`](./packages.md) · 룰: [`references/agent-rules-and-skills.md`](./references/agent-rules-and-skills.md)

---

## 제품 방향

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
일반 챗: 등록 LLM + registry ready 헤드(clf · capacity · residual) · whatif.  
보안·기밀: **`/security` · 전체화면 오버레이** → 로컬 OpenAI 호환 LLM + **보안 전용 RAG** (일반 Knowledge와 분리).

운영 인프라: Lightsail **16GB CPU** (앱·MariaDB·n8n·Qdrant) + **이 PC GPU** (`ssh -R` → 서버 `127.0.0.1:8001`). AWS에 vLLM 설치 안 함.

---

## 완료 (요약)

- Next.js App Router · Express · FastAPI 모노레포 기동 (`npm run dev`)
- O/X · 용량 · 잔여 Li 학습 · `/predict-voting` 3단 채점 (`lot_results` → `judgment_lots` → `analysis_lots`)
- 일반 챗 페이지 컨텍스트 · 보안 RAG(SSE · analytics · BM25 핫리로드)
- 이슈/LOT API · 위험 Top 메일(n8n→Gmail) · Documents 워처·Qdrant
- 로그인·프로필 모달 · 설정(시스템만) · Grafana SPC 임베드

상세는 [`catalog.md`](./catalog.md) · [`work-log/`](./work-log/).

---

## 제약

- `AppData.fillThreshold` 필드명 변경 금지  
- 회사 API 키는 `/security` → DB  
- 가짜 outcome/CSV 금지 · outcome은 수동 입력만  
- 보안 채널 클라우드 폴백 금지 · RAG 무히트(+ prior sources 없음) 시 환각 금지  
- clf는 capacity/residual을 입력으로 쓰지 않음  
- 레거시 control/chat `CHAT_STORE` sqlite 병행 가능 · 멀티턴 SSOT는 `user_chat_*`  
- embed/rerank는 **CPU 강제** (채팅 LLM은 외부 로컬 서버)  
- SelfQuery 교체 시에도 **unfiltered 재시도 + min_score** 제거 금지  
- 모노레포 루트 `.env`만 사용 · 시크릿 커밋 금지
- 새 **할 일 계획**은 `docs/plans/`에 쓰지 않는다. 구현 기록은 work-log, 동작 명세는 references.
