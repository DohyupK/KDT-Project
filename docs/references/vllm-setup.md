# 로컬 vLLM 수동 기동 안내 (보안 탭)

최종 갱신: 2026-08-14  
앱 코드는 **OpenAI 호환 엔드포인트만** 호출한다.  
`ai-service` 안에서 HuggingFace `transformers`로 모델을 로드하지 않는다.

확정 운영: vLLM은 **이 PC GPU**. Lightsail 16GB는 CPU이므로 서버에 vLLM을 설치하지 않는다.  
AWS 앱이 요약을 쓰려면 이 PC에서 역방향 터널을 연다. [`aws-lightsail-gpu-tunnel.md`](../guides/aws-lightsail-gpu-tunnel.md)

## 포트

| 서비스 | 포트 |
|--------|------|
| Next.js frontend | 3000 |
| Express backend | 3001 |
| FastAPI ai-service | **8800** |
| vLLM (보안 탭) | **8001** |

환경 변수 (모노레포 루트 `.env`):

```text
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
CHAT_VLLM_MODEL=<served-model-name>
```

PC에서 `npm run dev` 할 때와 **Lightsail 서버 `.env` 모두** 위 루프백 URL을 쓴다.  
서버가 GPU가 없어도, 이 PC가 `ssh -R 8001:127.0.0.1:8001` 로 붙여 주면 서버의 `:8001`이 이 PC vLLM이다.

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

## Lightsail에서 쓸 때 (이 PC → 서버 터널)

vLLM은 이 PC에서만 켠다 (`--host 127.0.0.1 --port 8001`). 그다음 터널을 유지한다.

```powershell
.\scripts\vllm-tunnel.ps1 -KeyPath "C:\Users\OWNER\Downloads\키.pem" -PublicHost "<16GB공인IP>"
```

서버 방화벽에 8001을 열지 않는다. `CHAT_VLLM_BASE_URL`은 서버에서도 `http://127.0.0.1:8001/v1`.

## 앱 경로

```text
SecurityChatbot → POST /api/security-chat → POST ai-service/security-chat
  → ChatOpenAI(base_url=CHAT_VLLM_BASE_URL, api_key=EMPTY)
```

vLLM이 꺼져 있으면 **클라우드 폴백 없음** — offline 안내 문구만 반환.

## 관련 코드

- `ai-service/agent/secure_llm/llm.py`
- `frontend/src/components/chat/SecurityChatbot.tsx`
- `backend/src/routes/securityChat.ts`
