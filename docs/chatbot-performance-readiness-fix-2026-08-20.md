# 챗봇 성능·준비 상태·모델 설명 개선

작성일: 2026-08-20  
범위: 일반 챗봇, 보안 챗봇, 챗봇 API 프록시와 챗봇 UI만 수정

## 백업

기존 챗봇 파일 16개를 수정 전에 아래 경로에 복사했고, 복사 직후 원본과 SHA-256이 모두 일치하는지 확인했다.

`chatbot-backups/20260820-before-performance-readiness/`

## 수정 전·후와 변경 이유

| 항목 | 수정 전 | 수정 후 | 변경 이유 |
| --- | --- | --- | --- |
| 일반 챗봇 RAG 초기화 | RAG가 필요하지 않은 요청에서도 시작 시 BGE-M3·Qdrant 초기화를 시도 | `CHAT_RAG_WARM_ON_STARTUP=1`일 때만 시작 시 준비하고, 기본값은 실제 RAG 요청 시 지연 초기화 | 일반 대화의 첫 응답 지연과 Qdrant 재시도 지연 제거 |
| 대화 의미 검색 | 일반 대화마다 Qdrant 의미 이력 검색을 시도 | `CHAT_HISTORY_SEMANTIC_ENABLED=1`인 경우에만 사용하며 기본값은 비활성 | 일반 채팅이 BGE/Qdrant 가용성에 종속되지 않도록 함 |
| timing | AI 그래프 실행 시간만 표시해 이력 DB·벡터 검색 시간이 빠짐 | `history_db_ms`, `history_vector_ms`, `history_ms`, `graph_ms`, 실제 `total_ms`를 분리 기록 | 화면 체감 시간과 서버 지표를 일치시킴 |
| 다회차 이력 | 백엔드 저장소와 AI MariaDB가 다르면 화면에는 대화가 있어도 모델은 기억하지 못함 | AI DB 이력이 없거나 연결되지 않으면 인증된 백엔드 채팅 저장소의 최근 이력을 전달 | SQLite·메모리·MariaDB 저장 모드에서 대화 기억 일관성 확보 |
| 보안 챗봇 준비 상태 | MariaDB·Qdrant·vLLM 장애가 실제 요청 후 오류 코드로만 노출 | 인증된 준비 상태 API와 UI 경고 배너를 추가하고 장애 구성 요소를 구분 | 사용자가 전송 전에 운영 준비 상태를 확인할 수 있도록 함 |
| 보안 오류 문구 | `enqueue_failed`, `worker_timeout` 같은 내부 코드 중심 | MariaDB 큐, PC 워커, Qdrant, vLLM 중 확인할 항목을 사용자 문구로 변환 | 오류 원인과 다음 확인 항목을 이해하기 쉽게 제공 |
| 모델 위험 요인 | 응답의 `top_risk_factors`가 비어 있고 템플릿은 잘못된 `top_factors` 키를 읽음 | voting 구성에 실제 포함된 모델들의 전역 SHAP 중요도를 가중 집계하고, 올바른 키와 한국어 항목명을 사용 | “왜 이런 판정이 나왔는지” 설명 가능하게 함 |
| 판정 확률 일관성 | 최종 판정은 blend 또는 symbolic의 OR인데 blend 확률만 표시 | blend 확률·임계값과 symbolic 점수·임계값, 실제 발동 규칙을 분리 표시 | 낮은 blend 확률인데 불량으로 보이는 경우의 혼동 방지 |
| 모델 검증 한계 | 최종 독립 holdout 부재가 답변에 드러나지 않음 | 모델 메타데이터를 읽어 6-fold 교차검증 중심이며 독립 holdout이 없다는 경고 표시 | 현재 모델 수치를 과신하지 않도록 함 |
| 프런트 챗봇 lint | effect의 동기 상태 갱신, 렌더 중 ref 갱신, 렌더 중 비결정적 시간 호출 오류 | 초기화·ref·시간 측정 경로를 React 규칙에 맞게 정리 | 챗봇 컴포넌트 정적 검사 통과 |

## 변경 파일

### AI 서비스

- `ai-service/app/main.py`
- `ai-service/app/schemas.py`
- `ai-service/agent/chat_history_vector.py`
- `ai-service/agent/api_llm/history_context.py` — 신규
- `ai-service/agent/api_llm/tools.py`
- `ai-service/agent/api_llm/model_registry.py`
- `ai-service/agent/api_llm/graph.py`
- `ai-service/agent/secure_llm/readiness.py` — 신규

### 백엔드 챗봇 경로

- `backend/src/services/chatStore.ts`
- `backend/src/services/aiProxy.ts`
- `backend/src/routes/chat.ts`
- `backend/src/routes/securityChat.ts`

### 프런트 챗봇 경로

- `frontend/src/api/aiApi.ts`
- `frontend/src/api/securityChatApi.ts`
- `frontend/src/components/chat/GlobalChatbot.tsx`
- `frontend/src/components/chat/SecurityChatbot.tsx`
- `frontend/src/context/PageChatContext.tsx`

## 검증 결과

- 일반 비-RAG 요청: 벽시계 222ms, `rag_ms=0`, `history_source=backend_chat_store`, `history_vector_ms=0`
- RAG 저장소 미준비 요청: 오류 없이 공개 문서를 찾지 못했다는 응답, `rag_ms=0`
- 보안 준비 상태: 약 969ms에 `degraded` 응답, MariaDB·Qdrant·vLLM 상태를 각각 반환
- 인증 통합: 미인증 준비 상태 요청은 401, 인증 요청은 200
- 다회차 통합: 같은 스레드의 두 번째 요청에서 `history_source=backend_chat_store`, 의미 검색 0ms 확인
- 실제 voting 샘플: `top_risk_factors` 4개, OR 판정 근거, 독립 holdout 경고 반환
- 예측 지연: 모델이 준비된 요청에서 `predict_ms=551ms`; 프로세스 첫 모델 로드는 약 2.9초
- Python 챗봇 모듈 `py_compile`: 통과
- 프런트 챗봇 대상 ESLint: 통과
- 백엔드 챗봇 대상 TypeScript 컴파일: 통과

## 남은 제한

- 실제 생성형 LLM 품질은 활성 API 키 또는 실행 중인 vLLM이 없어 검증하지 못했다. 현재 검증은 예측 모델·템플릿·RAG 장애 처리 경로 기준이다.
- voting 모델은 기존 학습 산출물을 변경하지 않았다. 독립 holdout 재검증은 모델 재학습 범위이므로, 이번 챗봇 전용 수정에서는 사용자 경고만 추가했다.
- 전체 백엔드 production build는 비챗봇 파일 `backend/src/services/analysisLotSyncPoller.ts`의 `fillRecommendedActionsForLots` 미정의 오류로 실패한다.
- 프런트 production build는 컴파일과 TypeScript 검사를 통과한 뒤 비챗봇 `/issue` 페이지의 `useSearchParams` Suspense 오류로 정적 생성 단계에서 실패한다.

위 두 build 오류는 사용자가 지정한 “챗봇 외 코드 수정 금지” 범위에 따라 수정하지 않았다.
