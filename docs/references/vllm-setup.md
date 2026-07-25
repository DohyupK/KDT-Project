# 로컬 vLLM 수동 기동 안내 (보안 탭)

최종 갱신: 2026-07-24  
앱 코드는 **OpenAI 호환 엔드포인트만** 호출한다.  
`ai-service` 안에서 HuggingFace `transformers`로 모델을 로드하지 않는다.

## 포트

| 서비스 | 포트 |
|--------|------|
| Next.js frontend | 3000 |
| Express backend | 3001 |
| FastAPI ai-service | **8800** |
| vLLM (보안 탭) | **8001** |

환경 변수 (`ai-service/.env`):

```text
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
CHAT_VLLM_MODEL=<served-model-name>
```

## HuggingFace → vLLM (수동, 작업자용)

1. HF에서 원하는 오픈 가중치 모델을 로컬에 받는다 (예: `huggingface-cli download ...`).
2. vLLM을 OpenAI 호환 서버로 기동한다 (예시):

```bash
# 예시 — 실제 모델 ID/인자는 환경에 맞게 교체
python -m vllm.entrypoints.openai.api_server \
  --model <HF_MODEL_OR_LOCAL_PATH> \
  --host 127.0.0.1 \
  --port 8001
```

3. `CHAT_VLLM_MODEL`을 vLLM이 노출하는 model id와 맞춘다.
4. 앱은 재시작 없이(또는 ai-service 재기동 후) `/security` 탭에서 질문한다.

## 앱 경로

```text
SecurityChatbot → POST /api/security-chat → POST ai-service/security-chat
  → ChatOpenAI(base_url=CHAT_VLLM_BASE_URL, api_key=EMPTY)
```

vLLM이 꺼져 있으면 **클라우드 폴백 없음** — offline 안내 문구만 반환.

## 관련 코드

- `ai-service/agent/secure_llm.py`
- `frontend/src/components/chat/SecurityChatbot.tsx`
- `backend/src/routes/securityChat.ts`
