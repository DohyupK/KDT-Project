# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-07-24 (LOT 피처 주입 · What-if · 승인 로그)

모노레포 기준입니다. `frontend` / `backend` / `ai-service`를 모두 포함합니다.

**연동 계획:** [`docs/plans/2026-07-23-llm-formal-integration.md`](./plans/2026-07-23-llm-formal-integration.md)  
**보안 골격:** [`docs/references/security-chat-skeleton.md`](./references/security-chat-skeleton.md)  
**시나리오 스모크:** [`docs/references/scenario-smoke-checklist.md`](./references/scenario-smoke-checklist.md)  
**최적화 로그 계약:** [`docs/references/optimization-event-schema.md`](./references/optimization-event-schema.md)  
**일지:** [`docs/work-log/2026-07-23.md`](./work-log/2026-07-23.md) · [`docs/work-log/2026-07-24.md`](./work-log/2026-07-24.md)

---

## 제품 방향 (기능 전체)

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
데이터는 **이미 DB에 있으며**, 서비스는 DB에서 불러와 사용한다. (원본 파일은 당장 다루지 않음)

대략적인 흐름:

1. 정확한 분석  
2. 불량률 예측  
3. 어떤 파라미터를 조정하면 불량률이 내려가는지 유추 (**What-if Cold start → 이후 reg 모델**)  
4. 사용자에게 불량률 감소 방안 제시  
5. 사용자가 방안을 선택하면, 웹사이트에서 해당 방안 실행 (**제어 로그 → 이후 하드웨어**)

**LLM + RAG + Tool Calling** Agent.  
일반 챗봇: **frontend → backend(세션·보안 게이트) → ai-service(predict + whatif + LLM compose)**.  
보안·기밀: 키워드 시 redirect → `/security` (vLLM은 외부 모델 반입 후).

챗봇·연동 경로 지도: [`docs/plans/2026-07-23-chatbot-integration.md`](./plans/2026-07-23-chatbot-integration.md)

---

## 영역 (구현 현황)

| 패키지 | 역할 | 상태 |
|--------|------|------|
| `frontend/` | Next.js App Router UI | AppShell + LOT→챗봇 features + Approve UI |
| `backend/` | Express + 세션·제어 스토어 | 보안 게이트 · `/api/chat` · `/api/control/approve` |
| `ai-service/` | ML + FastAPI/챗봇 | `/predict` + whatif_grid + Groq/Gemini |

## 완료 (최근)

- Groq + Gemini Flash/Pro · Optuna 100-trial (2026-07-24)
- **Main LOT → chat features 자동 주입** (SelectedLotContext)
- **What-if 격자 탐색 Tool** (humidity / sintering_temp, `reg.csv` 없이 Cold start)
- **제안 승인 → optimization_events 로그** (sqlite/mariadb, 하드웨어 스텁)
- 시나리오 체크리스트 · optimization-event 스키마 (Step 4 reg 학습은 보류)

## 다음 우선순위 (할 일)

1. **시나리오 스모크 실행** — [`scenario-smoke-checklist.md`](./references/scenario-smoke-checklist.md) (브라우저 + Approve DB 확인)
2. **보안 탭 vLLM — 외부 모델 반입**
3. **frontend:** Login UI / 승인 권한 고도화
4. **실측 outcome 회수** → `outcome_quality_defect` 채우기 → (데이터 충분 시) **reg.csv + 회귀 파이프라인 (Step 4)**
5. **backend:** RAG / 자주 쓰는 명령  

## 제약

- `frontend/src/types`의 `AppData.fillThreshold` 필드명 변경 금지  
- README에는 상세 변경을 쓰지 않고, 기록은 `docs/work-log/`에 남긴다  
- 설치·학습·테스트는 [ask-before-run](../.cursor/rules/ask-before-run.mdc) 승인 후  
- **전체** 룰·스킬 = 프로젝트 전체, **개별** 룰·스킬 = 중요 페이지·모듈에만 적용  
- API 키는 `.env`만 (저장소 커밋 금지)  
- 가짜 `reg.csv` 대량 생성 금지
