# ai-service 기능 목록

최종 갱신: 2026-08-14

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
| SSE | `POST /security-chat/stream` |
| Secure RAG | `secure_graph` · Qdrant `secure_docs` |
| Analytics | `node_analytics` · Polars `csv_lake` (실패 시 RAG) |
| 멀티턴 | MariaDB `user_chat_*` (Express 레거시 store는 done/replace만) |

## 문서

| 기능 | 비고 |
|------|------|
| PDF/TXT → MD · CSV/XLSX → lake | Documents 듀얼 엔진 |
| ingest | `ingest_secure.py` · 워처 후 `reload_bm25()` |
| 로그 | `logs/ai-service.log` Rotating 10MB×5 |
