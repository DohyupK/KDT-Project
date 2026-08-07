# Chat history Qdrant collection (Layer-2 long-term memory)

## Collection

- Name: `chat_history_collection` (env `CHAT_HISTORY_QDRANT_COLLECTION`)
- Vectors: cosine, dim = BAAI/bge-m3 (same as secure RAG), **CPU only**
- Payload indexes (KEYWORD): `thread_id`, `user_id`, `channel`, `role`

## Payload schema

| Field | Type | Notes |
|-------|------|--------|
| thread_id | string | Filter key for semantic pruning |
| user_id | string | Owner |
| channel | string | `security` \| `general` |
| role | string | `user` \| `assistant` |
| message_id | string | MariaDB `user_chat_messages.id` when known |
| text | string | Full message body (embedded) |
| created_at | string | ISO-8601 |

Point id: prefer numeric `message_id`; else md5 hash of thread+text prefix.

## Runtime

- Module: `ai-service/agent/chat_history_vector.py`
- Upsert: FastAPI `BackgroundTasks` from `/chat` and `/security-chat` (soft-fail)
- Search: Top-K default 3 (`CHAT_HISTORY_SEMANTIC_TOP_K`), filter `thread_id`
- Merge: heuristic compact → prepend as `[장기기억 유사]` above `[단기 윈도우]`
- **No LLM summarization**

## Env

```text
CHAT_HISTORY_QDRANT_COLLECTION=chat_history_collection
CHAT_HISTORY_SEMANTIC_TOP_K=3
CHAT_HISTORY_WINDOW=6
CHAT_HISTORY_MSG_MAX_CHARS=400
CHAT_HISTORY_MAX_CHARS=2000
QDRANT_URL=http://127.0.0.1:6333
```

## Notes

- Secure docs stay in collection `secure_docs` (unchanged).
- Layer-1 sliding window + `heuristic_truncate` remain in `chat_history_store.py`.
- `SECURE_GENERATE=0` / `no_docs` untouched.
