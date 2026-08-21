# 챗봇 보안 수정 전/후 요약

작성일: 2026-08-20

| 변경 파일 | 수정 전 | 수정 후 | 변경 이유 |
| --- | --- | --- | --- |
| `backend/src/routes/chat.ts`<br>`backend/src/routes/securityChat.ts`<br>`backend/src/services/chatStore.ts`<br>`backend/src/services/aiProxy.ts` | 채팅 요청의 사용자·스레드 값을 클라이언트 기준으로 사용하고, 보조 대화 저장소의 세션도 사용자·메뉴 구분 없이 조회. AI의 접근 거부 상태를 500으로 변환 | JWT의 `userId`만 사용하고, 보조 세션을 `사용자 + 메뉴 + thread_id` 범위로 분리. AI의 403 상태를 그대로 전달 | 타인 대화 및 일반/보안 메뉴 간 대화 혼입 방지, 정확한 접근 거부 응답 제공 |
| `backend/src/routes/chatThreads.ts` | 대화 목록·메시지 조회에 인증이 없고 사용자 값을 요청에서 받음. 삭제 API 없음 | 전체 라우트에 JWT 인증을 적용하고 서버가 사용자 값을 결정. 소유한 서버 대화를 삭제하는 API 추가 | 타인 대화 조회·삭제 방지 및 실제 삭제 제공 |
| `backend/src/routes/llmKeys.ts` | 키 목록·추가·삭제 API가 인증 없이 호출 가능 | 목록은 로그인 사용자만, 추가·삭제는 관리 권한 사용자만 호출 가능 | 키 설정 파괴와 API 비용 악용 방지 |
| `ai-service/agent/chat_history_store.py`<br>`ai-service/agent/security_queue_store.py` | 전달된 `thread_id`가 이미 존재해도 소유자 확인 없이 사용 | 기존 스레드의 `user_id`를 검사하고 불일치 시 접근 거부. 소유자 조건이 포함된 삭제 함수 추가 | 타인의 대화 문맥 조회·재사용·삭제 방지 |
| `ai-service/app/main.py`<br>`ai-service/agent/chat_history_vector.py` | 소유권 없는 스레드 접근을 차단하지 못하고 서버 대화·벡터 기록 삭제 경로가 없음 | 소유권을 먼저 검사한 뒤 DB 대화와 `thread_id + user_id + 메뉴`에 해당하는 벡터 기록을 삭제 | 서버와 의미 기억 저장소에 남는 대화 데이터 제거 및 교차 사용자 삭제 방지 |
| `frontend/src/api/aiApi.ts`<br>`frontend/src/api/securityChatApi.ts` | 브라우저가 `user_id`를 만들어 전송하고 대화 삭제 API가 없음 | `user_id` 전송을 제거하고 JWT 인증 요청만 사용. 서버 대화 삭제 호출 추가 | 사용자 신원 위조 방지 및 UI 삭제를 서버 삭제와 연결 |
| `frontend/src/components/chat/SecurityChatbot.tsx` | 보안 대화와 원문 출처 청크를 `localStorage`에 지속 저장하고 삭제 시 로컬에서만 숨김 | 메시지·출처의 영구 브라우저 저장을 제거하고 서버에서만 복원. 삭제 성공 후에만 UI에서 제거 | 공용 PC·XSS 노출 범위 축소 및 삭제 의미 일치 |
| `frontend/src/components/chat/GlobalChatbot.tsx` | 일반 대화 삭제 시 로컬 목록만 정리 | 서버 삭제 성공 후 로컬 캐시와 UI를 정리하고, 실패 시 대화를 유지 | 서버 데이터가 남았는데 삭제된 것처럼 보이는 문제 방지 |
| `frontend/next.config.ts` | 브라우저가 `/ai` 경로로 FastAPI에 직접 접근 가능 | 공개 `/ai` rewrite를 제거하고 모든 챗봇 요청을 인증 백엔드 `/api`로 통일 | 인증 백엔드를 우회하는 직접 접근 경로 제거 |
