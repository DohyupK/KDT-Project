# 시나리오 스모크 체크리스트

최종 갱신: 2026-08-13  
실행은 [kdt-project](../../.cursor/rules/kdt-project.mdc) 승인 후. 자동 테스트 강제 아님.

전제: frontend `:3000`, backend `:3001`, ai-service `:8800`, `models/` 학습 산출물 존재.

**API 스모크 (2026-07-24 오전):** backend·ai-service 재기동 후 **14/14 PASS** (당시 `approved_logged`).  
이후 상태값은 **`approved` / `reverted`** 로 변경됨 — 재스모크 시 아래 7·8항 확인.

화면 컨텍스트 일반 챗: [`general-chatbot-page-context.md`](./general-chatbot-page-context.md)

## 1. 보안 게이트

- [x] 메시지에 보안 키워드 → `mode=security_redirect`, `ai_proxied=false`, ai-service `/health`의 `chat_requests` 증가 없음

## 2. 유사 질문 가이드

- [x] 같은 요지 질문 연속 3회 → `need_guideline` / reply에 `[사용 가이드]`

## 3. 화면 컨텍스트 일반 챗

- [ ] 페이지 이동·버튼 클릭 시 콘솔 `[page-chat]` (route / focusId / payload sizes) *(브라우저)*
- [ ] Main「이 화면 KPI 요약해줘」→ pagePayload(dailyKpi 등) 인용 답 *(브라우저)*
- [ ] Main risk-top 행 클릭 후「이거 왜 심각이야?」→ focusPayload(LOT) 우선 *(브라우저)*
- [ ] 칩「이 화면 요약」→ 현재 route pagePayload 기반 답 *(브라우저)*
- [ ] 1턴: features 없이 predict null(또는 생략) · page_context+RAG 중심
- [ ] 같은 스레드 추가질문(또는 features 첨부) → `enable_api_llm` / heads·whatif 가능
- [x] features 첨부 시 predict 경로 동작 (회귀)
- [x] 「샘플 LOT 진단」칩은 제거됨 → 「이 화면 요약」으로 대체

## 4. What-if (Step 2 · follow-up / features)

- [x] 고습도/이상 LOT + features → `recommendation.suggestion` 존재 (reply에 제안 수치)
- [x] 정상 샘플(`SAMPLE_CHAT_FEATURES`) → suggestion null + “유지” note
- [ ] 한계치 타협: Setting에서 max 온도를 낮춘 뒤 이상 LOT 진단 → `boundary_hit` / `limit_reason` *(재스모크)*

## 5. Approve 로그 (Step 3)

- [ ] `POST /api/control/approve` → `status=approved`, `event_id` 반환
- [ ] `DB/data/control.sqlite` 행 `status=approved`
- [ ] `POST /api/control/approve/:id/revert` → `status=reverted` (행 유지)
- [ ] 챗봇 5초 Undo 스낵바 *(브라우저)*

## 6. Setting 한계치

- [ ] Setting 「공정 제어 한계치」저장 → `GET /api/settings/control-bounds` 반영 · `control_bounds.json` 갱신

## 7. LLM (선택)

- [x] 짧은 메시지 + Groq → `mode=llm` / `provider=groq`
- [ ] 중문(301+) Gemini 쿼터 없으면 Groq 폴백 + `[안내]`
