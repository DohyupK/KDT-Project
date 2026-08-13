# 일반 챗 지연 개선 (A~E) — 확정

최종 갱신: 2026-08-13

## 요약

- RAG: 문서·분석 의도일 때만 (경량 top_k=4 / rerank=2)
- 학습 모델: features 있으면 **항상** predict/whatif
- compose: page_context 중복 제거, truncate 강화, LLM timeout 20s, SSE `/chat/stream`
- 계측: `[chat-timing]` enrich/rag/predict/compose

자세한 설계: Cursor plan `chat_latency_diagnosis`.
