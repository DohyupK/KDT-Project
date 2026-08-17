# 시나리오 스모크 체크리스트

최종 갱신: 2026-08-14  
실행은 [kdt-project](../../.cursor/rules/kdt-project.mdc) 승인 후. 자동 테스트 강제 아님.

전제: frontend `:3000`, backend `:3001`, ai-service `:8800`, `models/` 학습 산출물 존재.  
제어 로그 상태값: `approved` / `reverted`.

화면 컨텍스트 일반 챗: [`general-chatbot-page-context.md`](./general-chatbot-page-context.md)

## 1. 보안 게이트

- 메시지에 보안 키워드 → `mode=security_redirect`, `ai_proxied=false`, ai-service `/health`의 `chat_requests` 증가 없음

## 2. 유사 질문 가이드

- 같은 요지 질문 연속 3회 → `need_guideline` / reply에 `[사용 가이드]`

## 3. 화면 컨텍스트 일반 챗

- 페이지 이동·버튼 클릭 시 콘솔 `[page-chat]` (route / focusId / payload sizes)
- Main「이 화면 KPI 요약해줘」→ pagePayload 인용
- Main risk-top 행 클릭 후「이거 왜 심각이야?」→ focusPayload(LOT) 우선
- 칩「이 화면 요약」→ 현재 route pagePayload
- 1턴: features 없이 page_context+RAG 중심 · 같은 스레드 추가질문 또는 features 첨부 시 heads·whatif
- features 첨부 시 predict 경로

## 4. What-if

- 고습도/이상 LOT + features → `recommendation.suggestion`
- 정상 샘플(`SAMPLE_CHAT_FEATURES`) → suggestion null + “유지” note
- Setting API로 max 온도를 낮춘 뒤 이상 LOT 진단 → `boundary_hit` / `limit_reason` (`PUT /api/settings/control-bounds`)

## 5. Approve 로그

- `POST /api/control/approve` → `status=approved`, `event_id`
- `DB/data/control.sqlite` 행 `status=approved`
- `POST /api/control/approve/:id/revert` → `status=reverted` (행 유지)
- 챗봇 5초 Undo 스낵바

## 6. 한계치 API

- `GET|PUT /api/settings/control-bounds` → `control_bounds.json` 갱신 (Setting 페이지 UI 없음)

## 7. LLM

- 짧은 메시지 + 등록 키 → `mode=llm`
- 중문(301+) Gemini 쿼터 없으면 Groq 폴백 + `[안내]`
