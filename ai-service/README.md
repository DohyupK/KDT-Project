# ai-service

양극재 품질 **O/X 진단 ML** · **FastAPI** · (예정) **챗봇 Agent**.

사람용 실행·스택 안내입니다. AI 규칙은 [`AGENTS.md`](./AGENTS.md),  
연동 경로 지도는 [`docs/plans/2026-07-23-chatbot-integration.md`](../docs/plans/2026-07-23-chatbot-integration.md).

---

## 실행

챗봇을 **화면과 함께** 쓰려면 루트 README  
**[로컬 실행 — 챗봇 (터미널 2개)](../README.md#로컬-실행--챗봇-터미널-2개)**  
처럼 frontend(:3000) + 이 서비스(:8000)를 **각각** 켭니다.

```bash
cd ai-service
pip install -r requirements.txt
# 학습 (승인 후): python train_pipeline.py
# API:
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- Health: `GET http://127.0.0.1:8000/health`
- Predict: `POST http://127.0.0.1:8000/predict`
- Chat: `POST http://127.0.0.1:8000/chat` (프론트는 `/ai/chat`로 rewrite)
- Docs: `http://127.0.0.1:8000/docs`
- **CWD는 항상 `ai-service/`** (`models/` 상대 경로)

---

## 기술 스택

### 런타임 · API
- Python 3.11+
- FastAPI, Uvicorn, Starlette, Pydantic

### Agent · LLM
- LangGraph, LangChain Core
- (선택) LangChain OpenAI — `CHAT_USE_LLM=1` + `OPENAI_API_KEY`

### ML · 데이터
- Polars
- NumPy, scikit-learn, joblib
- XGBoost, CatBoost
- Optuna (SQLite resume)
- SHAP

### 예정
- (고도화) ReAct free-form Tool Calling, RAG

### 주요 산출물 경로
- 학습 스크립트: `train_pipeline.py`
- 모델: `models/` (`xgb_model.json`, `cat_model.cbm`, …)
- API: `app/main.py` (`/health`, `/predict`, `/chat`)
- Agent: `agent/` (LangGraph)

---

## 사용할 라이브러리 (requirements.txt 기준)

**직접 의존성:** polars, numpy, scikit-learn, xgboost, catboost, optuna, shap, joblib, fastapi, uvicorn[standard], pydantic, langgraph, langchain-core, langchain-openai

**설치 시 따라온 주요 패키지(참고):** polars-runtime, sqlalchemy, alembic, numba, llvmlite, slicer, cloudpickle, starlette, httptools, watchfiles, websockets, python-dotenv, graphviz, plotly, langgraph-checkpoint, langgraph-prebuilt, langgraph-sdk, langsmith, openai, tiktoken, orjson, tenacity, jsonpatch 등

---

## 개발 기록

상세는 루트 일지: [`docs/work-log/`](../docs/work-log/)  
오늘: [`docs/work-log/2026-07-23.md`](../docs/work-log/2026-07-23.md)
