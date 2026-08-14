# docs (프로젝트 전체)

모노레포(`frontend` / `backend` / `ai-service`) 공통 문서입니다.  
프론트만의 실행 방법은 `frontend/README.md`를 보세요.

| 경로 | 용도 |
|------|------|
| [direction.md](./direction.md) | **현재 작업 방향** (전체 기준, 항상 최신 1개) |
| [work-log/](./work-log/) | 날짜별 작업 상세 · 일일업무보고용 |
| [plans/](./plans/) | 확정된 계획 요약 |
| [prompts/](./prompts/) | Cursor에 다시 넣을 프롬프트 |
| [references/](./references/) | 중요 경로 · 참조 · [LLM 튜닝 총정리](./references/LLM%20튜닝.md) |
| [guides/login-ubuntu-mariadb.md](./guides/login-ubuntu-mariadb.md) | 로그인 · Ubuntu MariaDB 공용 DB 연동 절차 |
| [guides/aws-lightsail-docker.md](./guides/aws-lightsail-docker.md) | Lightsail에 n8n·Qdrant Docker |
| [guides/aws-lightsail-gpu-tunnel.md](./guides/aws-lightsail-gpu-tunnel.md) | Lightsail 16GB 앱 + 이 PC GPU SSH 터널 |
| [references/login-auth-tech-stack.md](./references/login-auth-tech-stack.md) | 로그인 Auth 기술스택·패키지 기록 |

## docs vs 룰·스킬

| 구분 | 역할 |
|------|------|
| **docs/** | 사람·팀이 보는 방향·일지·계획 |
| **전체 룰·스킬** | AI가 **모든 패키지** 작업 시 공통으로 따름 |
| **개별 룰·스킬** | 특정 중요 페이지·API 파일에만 추가 적용 |

룰·스킬이 어떻게 돌아가는지: [루트 README — 문서와 AI 규칙](../README.md#문서와-ai-규칙-어떻게-나뉘나)

작업 일지: [work-log/](./work-log/) · [2026-07-31](./work-log/2026-07-31.md) · [2026-07-30](./work-log/2026-07-30.md) · [2026-07-29](./work-log/2026-07-29.md)

관련 계획·참조: [LLM 튜닝](./references/LLM%20튜닝.md) · [보안 RAG](./references/secure-rag.md) · [일반 챗 · 페이지 컨텍스트](./references/general-chatbot-page-context.md) · [Documents 워처 · Qdrant · 포트](./references/documents-watcher-qdrant.md) · [vLLM 기동](./references/vllm-setup.md) · [AWS 앱 + PC vLLM](./plans/2026-08-14-aws-app-pc-vllm.md) · [챗봇·연동 작업서](./plans/2026-07-23-chatbot-integration.md) · [모델 학습 방법 SSOT](./references/model-training-methods.md) · [다중 모델 투표](./references/multi-model-voting.md) · [clf 스키마](./references/cathode-clf-schema.md) · [reg 스키마](./references/cathode-reg-schema.md) · [residual 스키마](./references/cathode-residual-schema.md) · [중요 경로](./references/important-paths.md)
