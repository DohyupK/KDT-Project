# ai-service 기능 목록 (카탈로그)

최종 갱신: 2026-08-03 (BM25 핫리로드 · 로그 회전 · 3단계 검색 튜닝)

단가·우선순위 메모용. 상세 운영은 [`security-chatbot-guide.md`](./security-chatbot-guide.md) · [`secure-rag.md`](./secure-rag.md).  
기법·과정 총정리: [`LLM 튜닝.md`](./LLM%20튜닝.md) · 일지: [`docs/work-log/2026-08-02.md`](../work-log/2026-08-02.md).

---

## 예측 API

| 기능 | 경로 | 비고 |
|------|------|------|
| O/X 분류 | `POST /predict` | `fillThreshold` 유지 |
| 용량 회귀 | `POST /predict-capacity` | |
| residual | `POST /predict-residual` | |
| 일반 챗 + 헤드 | `POST /chat` | Groq/Gemini · whatif · registry |

---

## 보안 챗 (로컬 vLLM · 클라우드 폴백 없음)

| 기능 | 경로 / 모듈 | 상태 |
|------|-------------|------|
| JSON 보안 챗 | `POST /security-chat` | 유지 (스모크·하위호환) |
| SSE 스트리밍 | `POST /security-chat/stream` | **1단계** · Express `/api/security-chat/stream` |
| Secure RAG | `secure_graph` · Qdrant `secure_docs` | Hybrid + diversify + prior |
| Rerank soft fallback | `_rerank` · fused RRF 상위 1–2 · `max_score` 로그 | `min_score` 기본 0.15 · diversify 유지 |
| 청크 / 검색량 | ingest 400/50 · `top_k=12` · `rerank_top_n=6` | **3단계** |
| **BM25 핫리로드** | `reload_bm25` · `_bm25_lock`(RLock) | 워처 ingest 성공 후 · CLI는 재시작 필요 |
| **로그 회전** | `app/main` `RotatingFileHandler` | 10MB × backup 5 · `logs/ai-service.log` · `AI_SERVICE_LOG_FILE` |
| 빈 근거 통제 | `[SYS_RAG_EMPTY_RESULT]` hard override | |
| EXPLAIN / SUMMARY suffix | 짧은 질문·요약 의도 | EXPLAIN/SUMMARY 시 `max_tokens=256` |
| 후속 쿼리 확장 | `FOLLOWUP_RE` (지시대명사·문맥만) | `그럼|그래서|…` 제거 · 도메인 명사 미하드코딩 |
| SSE 스마트 버퍼 | SYS 토큰 prefix hold · `replace` | |
| DB 단일 책임 | MariaDB=ai-service · 레거시=Express | |
| **정형 분석 우회** | `node_analytics` · `analytics_engine` | **2단계** (아래) |

### 2단계 — csv_lake 정형 분석 (2026-08-02)

| 항목 | 내용 |
|------|------|
| 의도 | `통계\|평균\|예측\|예상\|불량률\|추이\|집계\|상관\|히스토그램` (`데이터` 제외) |
| 엔진 | Polars `scan_csv` on `ai-service/data/csv_lake/**/*.csv` |
| 예측 | `models/xgb_model.json` 시도 · 실패 시 통계+안내 문구 (clf/`fillThreshold` 미사용) |
| Smart Fallback | lake 비어 있거나 컬럼 집계 실패 → **에러 문구 대신 RAG(`node_retrieve`)** |
| LLM 프롬프트 | `[사내 정형 데이터 집계 결과]` + 「위 집계 결과만 근거로 답하라」 |
| 출처 칩 | `{title: 사내 CSV 데이터, doc_id: csv_lake}` |
| 연동 | LangGraph + `stream_secure_chat` 동기 · `SECURE_GENERATE=0`이면 집계 텍스트 직반환 |
| 가짜 CSV | **생성하지 않음** |

---

## 문서 · 인제스트

| 기능 | 비고 |
|------|------|
| PDF/TXT → MD | Documents dual-engine |
| CSV/XLSX → lake + profile MD | `csv_lake` + watchdog |
| BM25 핫리로드 | 워처 ingest 후 `get_engine().reload_bm25()` · CLI 수동 ingest는 **재시작** |
| 멀티턴 | MariaDB `user_chat_*` · semantic history |
| 서버 로그 | `logs/ai-service.log` Rotating 10MB×5 |

---

## 로드맵 (미구현)

| 단계 | 내용 |
|------|------|
| ~~3~~ | ~~chunk size / `min_score` 튜닝~~ → **완료** (400/50 · 0.15 · top_k=12) |
| — | TS 불량률 모델 (기상 CSV) |
| — | analytics × 기존 clf registry 연결 (선택) |
