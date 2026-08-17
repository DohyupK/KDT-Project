# ai-service 기능 목록

최종 갱신: 2026-08-15

단가·우선순위 메모용 API 목록.  
이용·라우팅: [`security-chatbot-guide.md`](./security-chatbot-guide.md) · RAG: [`secure-rag.md`](./secure-rag.md) · env·기법: [`LLM 튜닝.md`](./LLM%20튜닝.md)

## 예측

| 기능 | 경로 | 비고 |
|------|------|------|
| O/X 분류 | `POST /predict` | `fillThreshold` 유지 |
| 용량 회귀 | `POST /predict-capacity` | |
| residual | `POST /predict-residual` | |
| 투표 채점 | `POST /predict-voting` | [`multi-model-voting.md`](./multi-model-voting.md) |
| 일반 챗 + 헤드 | `POST /chat` | Groq/Gemini · whatif · registry |

## 보안 챗 (로컬 vLLM · 클라우드 폴백 없음)

| 기능 | 경로 / 모듈 |
|------|-------------|
| JSON | `POST /security-chat` |
| SSE | `POST /security-chat/stream` (AWS enqueue · PC 워커 답) |
| Secure RAG | PC 워커 `run_secure_chat` · Qdrant `secure_docs` |
| Analytics | `node_analytics` · Polars `csv_lake` (실패 시 RAG) |
| 멀티턴 | 일반 `USER_CHAT_*` · 보안 `USER_SECURITY_*` |

## 문서

| 기능 | 비고 |
|------|------|
| PDF/TXT → MD · CSV/XLSX → lake | Documents 듀얼 엔진 |
| ingest | CLI `ingest_secure.py` 는 최초/재색인만 · 워처 후 `reload_bm25()` · [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md) §6 |
| 로그 | `logs/ai-service.log` Rotating 10MB×5 |
