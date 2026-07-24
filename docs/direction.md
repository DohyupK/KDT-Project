# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-07-24 (100-trial 복구 · Groq/Gemini 라우팅)

모노레포 기준입니다. `frontend` / `backend` / `ai-service`를 모두 포함합니다.

**연동 계획:** [`docs/plans/2026-07-23-llm-formal-integration.md`](./plans/2026-07-23-llm-formal-integration.md)  
**보안 골격:** [`docs/references/security-chat-skeleton.md`](./references/security-chat-skeleton.md)  
**일지:** [`docs/work-log/2026-07-23.md`](./work-log/2026-07-23.md) · [`docs/work-log/2026-07-24.md`](./work-log/2026-07-24.md)

---

## 제품 방향 (기능 전체)

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
데이터는 **이미 DB에 있으며**, 서비스는 DB에서 불러와 사용한다. (원본 파일은 당장 다루지 않음)

대략적인 흐름:

1. 정확한 분석  
2. 불량률 예측  
3. 어떤 파라미터를 조정하면 불량률이 내려가는지 유추  
4. 사용자에게 불량률 감소 방안 제시  
5. 사용자가 방안을 선택하면, 웹사이트에서 해당 방안 실행 (**제어 + 권한**)

**LLM + RAG + Tool Calling** Agent.  
일반 챗봇: **frontend → backend(세션·보안 게이트) → ai-service(predict + LLM compose)**.  
보안·기밀: 키워드 시 redirect → `/security` (vLLM은 외부 모델 반입 후).

챗봇·연동 경로 지도: [`docs/plans/2026-07-23-chatbot-integration.md`](./plans/2026-07-23-chatbot-integration.md)

---

## 영역 (구현 현황)

| 패키지 | 역할 | 상태 |
|--------|------|------|
| `frontend/` | Next.js App Router UI | AppShell + GlobalChatbot(`/api/chat`) + `/security` placeholder |
| `backend/` | Express + 세션 스토어 | 보안 게이트 · 연속 유사 3회 · ai-service 프록시 (`CHAT_STORE=sqlite` 기본, mariadb 가능) |
| `ai-service/` | ML + FastAPI/챗봇 | `/predict` + LangGraph `/chat` + **Groq/Gemini** 길이 라우팅 |

## 완료 (7/23 기준)

- React(Vite) → Next.js 마이그레이션, docs·룰·스킬 정리 (2026-07-22)
- Issue / Knowledge / Inquiry / Dashboard / AppShell /login 진입 (2026-07-22)
- ai-service O/X · Optuna · 챗봇 `/ai` 실연동 (2026-07-23)
- LLM 정식 연동 코드 · 보안 게이트 · 세션 가이드 (2026-07-23)
- 시나리오 API 스모크: 보안 미프록시 · 유사 3회 가이드 · predict template (2026-07-23 오후)
- LLM 길이 라우팅 + `.env` 안전 주입 (2026-07-24)
- Groq(`GROQ_API_KEY`) + Gemini Flash/Pro 라우팅 · GPT 제거 · Optuna **100-trial** 재학습 (2026-07-24)

## 다음 우선순위 (할 일)

1. **시나리오 테스트 보강** — 브라우저 채팅 · Gemini 쿼터 확인 후 장문 `mode=llm`
2. **보안 탭 vLLM — 외부 모델 반입**
3. **frontend:** Login UI  
4. **frontend:** LOT 선택 → chat `features` 자동 주입  
5. **backend:** RAG / 자주 쓰는 명령  

## 제약

- `frontend/src/types`의 `AppData.fillThreshold` 필드명 변경 금지  
- README에는 상세 변경을 쓰지 않고, 기록은 `docs/work-log/`에 남긴다  
- 설치·학습·테스트는 [ask-before-run](../.cursor/rules/ask-before-run.mdc) 승인 후  
- **전체** 룰·스킬 = 프로젝트 전체, **개별** 룰·스킬 = 중요 페이지·모듈에만 적용  
- API 키는 `.env`만 (저장소 커밋 금지)
