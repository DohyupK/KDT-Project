# 시나리오 스모크 체크리스트

최종 갱신: 2026-07-24  
실행은 [ask-before-run](../../.cursor/rules/ask-before-run.mdc) 승인 후. 자동 테스트 강제 아님.

전제: frontend `:3000`, backend `:3001`, ai-service `:8800`, `models/` 학습 산출물 존재.

**API 스모크 (2026-07-24):** backend·ai-service 재기동 후 **14/14 PASS**  
(`POST /api/chat` · `/api/control/approve` · `control.sqlite` 확인. Main UI 클릭은 브라우저 수동.)

## 1. 보안 게이트

- [x] 메시지에 보안 키워드 → `mode=security_redirect`, `ai_proxied=false`, ai-service `/health`의 `chat_requests` 증가 없음

## 2. 유사 질문 가이드

- [x] 같은 요지 질문 연속 3회 → `need_guideline` / reply에 `[사용 가이드]`

## 3. LOT 피처 주입 (Step 1)

- [ ] Main → 위험 LOT 상세 → **챗봇에 연결** → 패널에 `연결 LOT: …` *(브라우저 수동)*
- [x] 「이거 지금 어때?」+ features → `predict` 비null (연결 센서 + 기본 d50/d90/OP01)
- [x] features 없음 → predict 없이 피처 요청 안내
- [x] 「샘플 LOT 진단」 features → predict 동작

## 4. What-if (Step 2)

- [x] 고습도/이상 LOT → `recommendation.suggestion` 존재 (reply에 제안 수치)
- [x] 정상 샘플(`SAMPLE_CHAT_FEATURES`) → suggestion null + “유지” note

## 5. Approve 로그 (Step 3)

- [x] `POST /api/control/approve` 성공, `event_id` 반환
- [x] `backend/data/control.sqlite`에 `optimization_events` 1행, `status=approved_logged`
- [x] 미승인 시 insert 없음 *(승인 API만 호출했을 때 insert — UI 미클릭 경로는 수동)*

## 6. LLM (선택)

- [x] 짧은 메시지 + Groq → `mode=llm` / `provider=groq`
- [ ] 중문(301+) Gemini 쿼터 없으면 Groq 폴백 + `[안내]` *(이번 스모크에서 생략; 이전 검증 이력 있음)*
