# 시나리오 스모크 체크리스트

최종 갱신: 2026-07-24  
실행은 [ask-before-run](../../.cursor/rules/ask-before-run.mdc) 승인 후. 자동 테스트 강제 아님.

전제: frontend `:3000`, backend `:3001`, ai-service `:8800`, `models/` 학습 산출물 존재.

**API 스모크 (2026-07-24 오전):** backend·ai-service 재기동 후 **14/14 PASS** (당시 `approved_logged`).  
이후 상태값은 **`approved` / `reverted`** 로 변경됨 — 재스모크 시 아래 7·8항 확인.

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
- [ ] 한계치 타협: Setting에서 max 온도를 낮춘 뒤 이상 LOT 진단 → `boundary_hit` / `limit_reason` *(재스모크)*

## 5. Approve 로그 (Step 3)

- [ ] `POST /api/control/approve` → `status=approved`, `event_id` 반환
- [ ] `backend/data/control.sqlite` 행 `status=approved`
- [ ] `POST /api/control/approve/:id/revert` → `status=reverted` (행 유지)
- [ ] 챗봇 5초 Undo 스낵바 *(브라우저)*

## 6. Setting 한계치

- [ ] Setting 「공정 제어 한계치」저장 → `GET /api/settings/control-bounds` 반영 · `control_bounds.json` 갱신

## 7. LLM (선택)

- [x] 짧은 메시지 + Groq → `mode=llm` / `provider=groq`
- [ ] 중문(301+) Gemini 쿼터 없으면 Groq 폴백 + `[안내]`
