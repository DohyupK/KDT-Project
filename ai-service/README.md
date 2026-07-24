# ai-service

양극재 품질 **O/X 진단 ML** · **FastAPI** · **LangGraph 챗봇** (LLM compose).

사람용 실행·스택 안내입니다. AI 규칙은 [`AGENTS.md`](./AGENTS.md),  
연동 경로 지도는 [`docs/plans/2026-07-23-llm-formal-integration.md`](../docs/plans/2026-07-23-llm-formal-integration.md).

---

## 실행

화면·세션·보안 게이트까지 쓰려면 루트 README  
**[로컬 실행 — 챗봇 (터미널 3개)](../README.md#로컬-실행--챗봇-터미널-3개)**  
처럼 frontend(:3000) + backend(:3001) + 이 서비스(:8800)를 켭니다.

```bash
cd ai-service
pip install -r requirements.txt
# (선택) copy .env.example .env
# 학습 (승인 후): python train_pipeline.py
uvicorn app.main:app --host 127.0.0.1 --port 8800
```

- Health: `GET http://127.0.0.1:8800/health`
- Predict: `POST http://127.0.0.1:8800/predict`
- Chat: `POST http://127.0.0.1:8800/chat` (프론트는 backend `/api/chat` 경유)
- Docs: `http://127.0.0.1:8800/docs`
- **CWD는 항상 `ai-service/`** (`models/` 상대 경로)

### LLM compose (선택) — 키는 `.env`만

**실키를 코드·GitHub·채팅에 넣지 마세요.**  
`copy .env.example .env` 후 로컬 `.env`에만 값을 적습니다 (`.gitignore`가 `.env` 제외).

```bat
cd ai-service
copy .env.example .env
notepad .env
```

```text
CHAT_USE_LLM=1
GROQ_API_KEY=...           # usually gsk_...
GOOGLE_API_KEY=...
CHAT_LEN_GEMINI=300
CHAT_LEN_PRO=500
CHAT_GROQ_MODEL=llama-3.1-8b-instant
CHAT_GEMINI_FLASH_MODEL=gemini-2.0-flash
CHAT_GEMINI_PRO_MODEL=gemini-2.5-pro
```

**길이 라우팅** (사용자 `message` 글자 수):

| 길이 | 프로바이더 |
|------|------------|
| ≤ 300 | **Groq** (Llama) |
| 301–500 | **Gemini Flash** |
| > 500 | **Gemini Pro** |

- Gemini 한도/오류 시 → **Groq 폴백** + `[안내] … Groq이 답변했습니다.`
- Groq/둘 다 실패 → **template**
- `gsk_` 키는 **Groq** (xAI Grok 아님). 변수명 `GROQ_API_KEY` 사용
- `CHAT_VLLM_BASE_URL`은 **보안 탭 전용(이후)**
- 기동 시 `app/main.py`가 `ai-service/.env`를 `load_dotenv`로 읽음

---

## 기술 스택

### 런타임 · API
- Python 3.11+
- FastAPI, Uvicorn, Starlette, Pydantic
- python-dotenv

### Agent · LLM
- LangGraph, LangChain Core
- LangChain OpenAI (Groq OpenAI-compatible)
- LangChain Google GenAI (Gemini Flash/Pro)
- 길이 라우팅: Groq → Gemini Flash → Gemini Pro (`agent/llm.py`)

### ML · 데이터
- Polars
- NumPy, scikit-learn, joblib
- XGBoost, CatBoost
- Optuna (SQLite resume)
- SHAP

### 예정
- 보안 탭 vLLM, ReAct Tool Calling, RAG

### 주요 산출물 경로
- 학습 스크립트: `train_pipeline.py`
- 모델: `models/`
- API: `app/main.py` (`/health`, `/predict`, `/chat`)
- Agent: `agent/` (`graph.py`, `llm.py`, `prompts.py`, `tools.py`)

---

## 사용할 라이브러리 (requirements.txt 기준)

**직접 의존성:** polars, numpy, scikit-learn, xgboost, catboost, optuna, shap, joblib, fastapi, uvicorn[standard], pydantic, langgraph, langchain-core, langchain-openai, langchain-google-genai, python-dotenv

**설치 시 따라온 주요 패키지(참고):** polars-runtime, sqlalchemy, alembic, numba, llvmlite, slicer, cloudpickle, starlette, httptools, watchfiles, websockets, graphviz, plotly, langgraph-checkpoint, langgraph-prebuilt, langgraph-sdk, langsmith, openai, tiktoken, orjson, tenacity, jsonpatch, google-generativeai 등

---

## 개발 기록

상세는 루트 일지: [`docs/work-log/`](../docs/work-log/)  
오늘: [`docs/work-log/2026-07-23.md`](../docs/work-log/2026-07-23.md)
