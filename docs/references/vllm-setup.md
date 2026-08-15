# 로컬 vLLM 수동 기동 안내 (보안 탭)

최종 갱신: 2026-08-15  
앱 코드는 **OpenAI 호환 엔드포인트만** 호출한다.  
`ai-service` 안에서 HuggingFace `transformers`로 모델을 로드하지 않는다.

확정 운영: vLLM은 **이 PC GPU**. 보안 챗은 AWS가 `:8001`을 치지 않는다. 이 PC 워커가 로컬 vLLM을 부른다. [`security-chatbot-guide.md`](./security-chatbot-guide.md)

앱 포트·기동 주체: [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md). vLLM만 **8001** (수동, 모델 기동은 무거워서 원샷 스크립트가 재시작하지 않음).

환경 변수 (모노레포 루트 `.env`):

```text
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
CHAT_VLLM_MODEL=<served-model-name>
```

워커(이 PC)만 이 루프백을 쓴다. AWS `npm run dev`는 vLLM을 호출하지 않는다.

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
4. 이 PC에서 워커를 켠다: `npm run security-pc`. 운영 순서: [`aws-pc-security-worker.md`](../guides/aws-pc-security-worker.md)

## Lightsail일 때 (이 PC)

vLLM은 이 PC에서만 켠다. AWS Qdrant·MariaDB면 `npm run security-pc`에 키·호스트를 넘겨 `ssh -L 6333`과 `ssh -L 3306`을 같이 연다. 이 PC `.env`는 `DB_HOST=127.0.0.1`.

```powershell
npm run security-pc -- -KeyPath "C:\Users\OWNER\Downloads\키.pem" -PublicHost "<16GB공인IP>"
```

라우팅: [`security-chatbot-guide.md`](./security-chatbot-guide.md). vLLM이 꺼져 있으면 **클라우드 폴백 없음**.  
`ingest_secure.py` 는 vLLM이 아니다. 컬렉션 없을 때 한 번. [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md) §6.

코드: `ai-service/agent/secure_llm/llm.py` · `frontend/src/components/chat/SecurityChatbot.tsx` · `backend/src/routes/securityChat.ts`
