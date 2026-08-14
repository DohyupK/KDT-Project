# 프로젝트 문서 목록 (사용자 작성)

최종 갱신: 2026-08-14  
범위: **이 저장소에서 직접 쓴 마크다운**. `node_modules` README·CHANGELOG(약 1400건)는 npm 패키지 설명이며 프로젝트 문서가 아니다. Git에도 없다.

`Documents/` 원본은 **삭제하지 않음** (RAG·등급 자료). 아래는 위치·한 줄 요지만.

진입: [`docs/README.md`](./README.md) · 방향: [`direction.md`](./direction.md) · 룰/스킬: [`references/agent-rules-and-skills.md`](./references/agent-rules-and-skills.md)

---

## 1. docs/ — 팀·운영 문서

### 방향 · 목록

| 파일 | 내용 |
|------|------|
| [`direction.md`](./direction.md) | 제품 방향 · 완료 요약 · 제약 |
| [`README.md`](./README.md) | docs 폴더 안내 |
| [`catalog.md`](./catalog.md) | 이 목록 |
| [`packages.md`](./packages.md) | frontend · backend · ai-service · DB (구 패키지 README) |

### 일지 (`work-log/`) — 유지

| 파일 | 내용 |
|------|------|
| [`2026-07-15.md`](./work-log/2026-07-15.md) | 초기 작업 |
| [`2026-07-21.md`](./work-log/2026-07-21.md) | Next.js App Router 마이그레이션 |
| [`2026-07-22.md`](./work-log/2026-07-22.md) | clf 스키마·학습 프롬프트 문서화 |
| [`2026-07-23.md`](./work-log/2026-07-23.md) | FastAPI `/chat` · GlobalChatbot 실연동 · LLM 게이트 |
| [`2026-07-24.md`](./work-log/2026-07-24.md) | 보안 탭·제어 한계치 |
| [`2026-07-28.md`](./work-log/2026-07-28.md) | 당일 작업 |
| [`2026-07-29.md`](./work-log/2026-07-29.md) | optimization_events · outcome |
| [`2026-07-30.md`](./work-log/2026-07-30.md) | 보안 RAG E2E · 타임아웃 180s |
| [`2026-07-31.md`](./work-log/2026-07-31.md) | Documents 경로 · 멀티턴 MariaDB |
| [`2026-08-01.md`](./work-log/2026-08-01.md) | 보안 RAG 자연 흐름 |
| [`2026-08-02.md`](./work-log/2026-08-02.md) | SSE · analytics · 검색 튜닝 |
| [`2026-08-04.md`](./work-log/2026-08-04.md) | 인수인계 DB · 이슈 ID |
| [`2026-08-05.md`](./work-log/2026-08-05.md) | LOT 폴링 · 대시보드 residual |
| [`2026-08-06-07.md`](./work-log/2026-08-06-07.md) | 08-06 생산 추이·품질 · 08-07 학습·실험 (`2026-08-06.md`는 포인터) |
| [`2026-08-08.md`](./work-log/2026-08-08.md) | 위험 LOT · KPI · issues 리팩터 |
| [`2026-08-10.md`](./work-log/2026-08-10.md) | N_FOLDS 6 · 학습 SSOT |
| [`2026-08-13.md`](./work-log/2026-08-13.md) | 이슈 메일 n8n · 포트 기동 주체 |
| [`2026-08-14.md`](./work-log/2026-08-14.md) | Lightsail 16GB · Grafana env · 문서 정리 · 대시보드 공란 |

### 가이드 (`guides/`) — 구현·운영 절차

| 파일 | 내용 |
|------|------|
| [`login-ubuntu-mariadb.md`](./guides/login-ubuntu-mariadb.md) | 로그인 · Ubuntu MariaDB 연동 |
| [`aws-lightsail-docker.md`](./guides/aws-lightsail-docker.md) | Lightsail에 n8n·Qdrant Docker |
| [`aws-lightsail-gpu-tunnel.md`](./guides/aws-lightsail-gpu-tunnel.md) | 앱은 Lightsail CPU, vLLM은 이 PC GPU (`ssh -R`) |

### 참조 (`references/`) — 구현된 동작 명세

| 파일 | 내용 |
|------|------|
| [`agent-rules-and-skills.md`](./references/agent-rules-and-skills.md) | 룰·스킬 한곳 정리 |
| [`issue-report.md`](./references/issue-report.md) | 이슈 보고서 메일 (n8n·Gmail) |
| [`issue-lot-api.md`](./references/issue-lot-api.md) | 이슈/LOT/과거 자료 API · 채점 3단 |
| [`general-chatbot-page-context.md`](./references/general-chatbot-page-context.md) | 일반 챗 · 화면 컨텍스트 |
| [`security-chatbot-guide.md`](./references/security-chatbot-guide.md) | 챗봇 이용·라우팅 |
| [`secure-rag.md`](./references/secure-rag.md) | 보안 RAG ingest·가드레일·스모크 |
| [`documents-watcher-qdrant.md`](./references/documents-watcher-qdrant.md) | OCR 워처 · Qdrant · 포트 |
| [`vllm-setup.md`](./references/vllm-setup.md) | 로컬 vLLM 수동 기동 |
| [`LLM 튜닝.md`](./references/LLM%20튜닝.md) | RAG 기본값·env·모듈 |
| [`ai-service-feature-catalog.md`](./references/ai-service-feature-catalog.md) | ai-service API 목록 |
| [`model-training-methods.md`](./references/model-training-methods.md) | clf/reg/residual 학습 방법 |
| [`multi-model-voting.md`](./references/multi-model-voting.md) | `/predict-voting` 앙상블 |
| [`cathode-clf-schema.md`](./references/cathode-clf-schema.md) | O/X CSV 스키마 |
| [`cathode-reg-schema.md`](./references/cathode-reg-schema.md) | 용량 CSV 스키마 |
| [`cathode-residual-schema.md`](./references/cathode-residual-schema.md) | 잔여 Li CSV 스키마 |
| [`optimization-event-schema.md`](./references/optimization-event-schema.md) | Approve/Undo · outcome 로그 |
| [`control-bounds-wiring.md`](./references/control-bounds-wiring.md) | 공정 한계치 Setting↔whatif |
| [`login-auth-tech-stack.md`](./references/login-auth-tech-stack.md) | 로그인 Auth 패키지 기록 |
| [`aws-dashboard-empty-next-dev.md`](./references/aws-dashboard-empty-next-dev.md) | Lightsail 대시보드 공란 (`next dev` origin) |
| [`important-paths.md`](./references/important-paths.md) | 자주 쓰는 코드 경로 |
| [`chat-history-qdrant.md`](./references/chat-history-qdrant.md) | 챗 장기기억 Qdrant 컬렉션 |
| [`scenario-smoke-checklist.md`](./references/scenario-smoke-checklist.md) | 시나리오 스모크 체크리스트 |

### 프롬프트 (`prompts/`)

| 파일 | 내용 |
|------|------|
| [`daily-work-log.md`](./prompts/daily-work-log.md) | 일지 정리용 재사용 문장 |
| [`train-pipeline-ox-classifier.md`](./prompts/train-pipeline-ox-classifier.md) | clf 학습 파이프라인 구현 프롬프트 |

### `plans/`

폴더는 비움. 미구현·중복 계획은 삭제. 구현 내용은 위 references·work-log·guides로 옮김. 안내: [`plans/README.md`](./plans/README.md)

---

## 2. 규약 · 에이전트 (docs 밖 · 시스템)

| 파일 | 내용 |
|------|------|
| [`README.md`](../README.md) | 모노레포 실행·스택 (유일한 전체 README) |
| [`AGENTS.md`](../AGENTS.md) | AI 공통 규칙 |
| [`frontend/AGENTS.md`](../frontend/AGENTS.md) · [`CLAUDE.md`](../frontend/CLAUDE.md) | FE AI 규칙 |
| [`ai-service/AGENTS.md`](../ai-service/AGENTS.md) | ML·챗봇 AI 규칙 |
| `.cursor/rules/kdt-project.mdc` · `frontend-ui.mdc` | Cursor 룰 |
| `.cursor/skills/project-control/` | 조율 스킬 |
| 패키지 `README.md` | `docs/packages.md`로 보내는 포인터만 |

---

## 3. Documents/ — RAG 원본 (삭제하지 않음)

등급 폴더 정책: [`Documents/README.md`](../Documents/README.md)

### Public (일반+보안 챗)

| 파일 | 내용 |
|------|------|
| `report.md` | 임계값별 검사·포착 |
| `model_quality.md` | judgment 확률 vs CSV |
| `model-blending-correlation.md` | 블렌딩·상관 |
| `judgment-probability-audit-2026-08-06.md` | 판정 확률 감사 |
| `judgment-prob-vs-csv-2026-08-06.md` | 확률 vs CSV |
| `db-table-parameter-rw-2026-08-05.md` | 테이블 파라미터 R/W |
| `db-table-column-callsite-audit-2026-08-05.md` | 컬럼 콜사이트 감사 |

Public의 `model_quality.md`와 TopSecret 동명 파일은 **공개/기밀 분리 사본**이다.

### Confidential (일반+보안)

SOP·매뉴얼·규칙: `sop-coating/humidity/sintering-v1`, `manual-metal/mixing-v1`, `rule-lithium-v1`, `양극재.md`  
프로파일: `cathode_clf/reg/ts/qc_reg(_리튬잔여량)-data-profile.md`  
분석: `EDA분석.md`, `리튬잔여량에-따른-불량률.md`, `리튬잔여량과-전지용량.md`, `Capacity에-따른-불량률.md`, `대구-경북-2025년-연-기후특성.md`  
`qms-source/README.md` — QMS 원본 안내

### Secret

`model-comparison-report.md` — 모델 비교 (보안 챗만)

### TopSecret (보안 챗만)

| 파일 | 내용 |
|------|------|
| `report.md` · `model_quality.md` | 기밀 품질 리포트 |
| `15_models_best_summary.md` | 15모델 best 요약 |
| `db-lot-table-interaction.md` | LOT 테이블 상호작용 |
| `thresholds/T-0.10.md` … `T-1.00.md` | 임계값별 리포트 18건 |

---

## 4. 이번 정리에서 지운 것

| 삭제 | 이유 |
|------|------|
| `docs/plans/*.md` (15개 계획) | 미구현이거나, 구현분이 references/guides/work-log와 중복 |
| 루트 `KDT-Documents-OCR-text_match-인수인계.md` | [`documents-watcher-qdrant.md`](./references/documents-watcher-qdrant.md) 사본 |
| `docs/references/LLM 튜닝.md` §9 「다음 할 일」 | 앞으로 할 계획 |
| `direction.md` 「다음 우선순위」 | 앞으로 할 계획 |
| 스텁 룰·스킬 · `.agents/skills/` | Cursor 룰을 `kdt-project` + `frontend-ui` + `project-control`로 통합 |
| 패키지 README 본문 · `frontend/docs/` · `secure_docs/README` · `DB/.../chat_history_qdrant.md` | [`packages.md`](./packages.md) · [`chat-history-qdrant.md`](./references/chat-history-qdrant.md)로 이동 |
| `docs/references/security-chat-skeleton.md` | [`security-chatbot-guide.md`](./references/security-chatbot-guide.md)에 라우팅·디렉터리 합침 |
| RAG 스택/포트/채점 3단 중복 표 | 숫자·env=`LLM 튜닝` · 포트=`documents-watcher-qdrant` · 3단=`issue-lot-api` |
| 명세의 예정·미구현·할 일 | 코드에 없는 로드맵(Step 4 export, TS 불량률, Setting 한계치 UI, `/predict*` voting 프록시 등) |

`node_modules` 문서는 손대지 않음 (의존성 패키지).
