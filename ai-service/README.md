# ai-service

양극재 품질 **O/X 진단 ML** · **전지 용량(reg)** · **FastAPI** · **LangGraph 챗봇**.

사람용 실행·스택 안내입니다. AI 규칙은 [`AGENTS.md`](./AGENTS.md),  
기능·단가: [`docs/references/ai-service-feature-catalog.md`](../docs/references/ai-service-feature-catalog.md).

---

## 실행

화면·세션·보안 게이트까지 쓰려면 루트 README  
**[로컬 실행 — 챗봇 (터미널 3개)](../README.md#로컬-실행--챗봇-터미널-3개)**  
처럼 frontend(:3000) + backend(:3001) + 이 서비스(:8800)를 켭니다.

```bash
cd ai-service
pip install -r requirements.txt
# copy .env.example .env 후 CHAT_USE_LLM=1 (회사 API 키는 .env에 두지 않음)
# 학습 (승인 후):
#   python train_pipeline.py
#   python train_reg_pipeline.py
#   python train_residual_pipeline.py
uvicorn app.main:app --host 127.0.0.1 --port 8800
```

- Health: `GET http://127.0.0.1:8800/health` (`registry_ready`에 활성 헤드 id)
- Predict (clf): `POST http://127.0.0.1:8800/predict`
- Capacity (reg): `POST http://127.0.0.1:8800/predict-capacity`
- Residual: `POST http://127.0.0.1:8800/predict-residual`
- Chat: `POST http://127.0.0.1:8800/chat` — features 있으면 **ready 헤드 전부 자동 호출** (clf+reg+residual+확장)
- Docs: `http://127.0.0.1:8800/docs`
- **CWD는 항상 `ai-service/`** (`models/` 상대 경로)

### LLM compose — 키는 보안 탭 / DB만

일반 챗 API 키(Groq, Gemini, Claude 등)는 **`ai-service/.env`에 두지 않습니다.**  
프론트 **`/security`** 에서 저장 → Express가 암호화 → [`DB/data/llm_keys.sqlite`](../DB/data/).

```text
CHAT_USE_LLM=1
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
CHAT_VLLM_MODEL=local-model
```

- `CHAT_USE_LLM=1` + **등록된 키** → Auto(단가·100자 티어) / 수동
- 키 없음 → template + 「보안 탭에서 API 키를 저장」안내
- `CHAT_VLLM_*` 는 **보안 탭 전용**
- 마스터 암호 키: **`backend/.env`의 `LLM_KEYS_ENCRYPTION_KEY`**
- 기동 시 `app/main.py`가 `ai-service/.env`를 `load_dotenv`로 읽음

---

## clf 학습 방식·기준 (현재 `/predict`)

상세 계약: [`docs/references/cathode-clf-schema.md`](../docs/references/cathode-clf-schema.md)  
스크립트: [`train_pipeline.py`](./train_pipeline.py) · 산출: [`models/`](./models/) (예: `metadata.json`)

| 항목 | 내용 |
|------|------|
| 데이터 | `data/cathode_clf_data.csv` |
| 타깃 | `quality_defect` ∈ {0,1} (0=정상, 1=불량) |
| Feature | 수치 공정 9개 + `operator_id`(범주) + v1.2.0 도메인 피처(온도 편차·플래그 등) |
| 제외 | `id`, `timestamp` |
| 전처리 | Polars, seed **42**, Train 기준 수치 평균 imputer, 범주 결측 `__MISSING__` |
| CV / 튜닝 | **TimeSeriesSplit**, Optuna **100** trial, study `xgb_ox_clf` / `cat_ox_clf` |
| 목적 | Fold 평균 **ROC-AUC maximize** |
| 모델 | XGBoost + CatBoost, 최종 앙상블 **0.5 / 0.5** |
| 불균형 | `scale_pos_weight` = 정상수/불량수 |
| 임계값 | Test에서 cost = FP + FN×가중치로 선택 (`fillThreshold` 필드명 유지) |
| 설명 | 전역 SHAP → predict 시 Top-4 요인 **이름** |
| 실행 | `cd ai-service` 후 **승인 받고** `python train_pipeline.py` |

참고 실측 산출(`models/metadata.json`): `model_version` 1.2.0, `test_roc_auc` ≈ 0.94, `applied_eval_threshold` 0.4, `device_mode` cpu.

---

## reg 학습 방식·기준 (capacity → `/predict-capacity`)

상세 계약: [`docs/references/cathode-reg-schema.md`](../docs/references/cathode-reg-schema.md)  
스크립트: [`train_reg_pipeline.py`](./train_reg_pipeline.py) · 산출: [`models/reg/`](./models/reg/)  
레지스트리: [`models/registry.json`](./models/registry.json) (`reg.ready`는 학습 성공 후 `true`)

| 항목 | 내용 |
|------|------|
| 데이터 | `data/cathode_reg_data.csv` (Feature에 결측 가능 → Train 평균 imputer) |
| 타깃 | `capacity` (전지 용량 **mAh/g**, 연속) |
| Feature | clf와 동일 공정 9개 + `operator_id` + 동일 도메인 피처 |
| 제외 | `id`, `timestamp` |
| 전처리 | Polars, seed **42**, Train 수치 평균 imputer, 범주 `__MISSING__` |
| CV / 튜닝 | **TimeSeriesSplit**, Optuna **100** trial, study `xgb_cap_reg_v1` / `cat_cap_reg_v1` |
| Optuna DB | `optuna_reg.db` (clf의 `optuna.db`와 분리) |
| 목적 | Fold 평균 **RMSE minimize** (MAE·R²는 Test 로그) |
| 모델 | **XGBRegressor** + **CatBoostRegressor**, 앙상블 **0.5 / 0.5** |
| 불균형/임계값 | 해당 없음 (회귀) |
| 설명 | 전역 SHAP → `top_factors` Top-4 이름 |
| 실행 | `cd ai-service` 후 **승인 받고** 아래 명령 |

```bash
cd ai-service
set USE_GPU=0
set OPTUNA_TRIALS=100
python train_reg_pipeline.py
```

예상 시간: Optuna 100×2 + SHAP → **수십 분~수 시간**. 로그: `logs/train_reg.log`.

clf와 **같은 뼈대**, 다른 점만: 타깃·Regressor·RMSE minimize·산출 경로 `models/reg/`.

### 챗봇 다중 헤드 (확장)

`models/registry.json`에서 `ready: true`인 헤드를 features 채팅 시 **전부** 돌린다.

| 헤드 | API | 역할 |
|------|-----|------|
| `clf` | `/predict` | O/X 불량 확률 |
| `reg` | `/predict-capacity` | 전지 용량 mAh/g |
| `residual` | `/predict-residual` | 잔여 리튬 (ppm 예시) |

새 학습 데이터/모델 추가 시: `models/<name>/` 학습 산출 + registry에 헤드 추가 + `agent/tools.py`에 `register_builtin` (또는 features→DataFrame 어댑터). 챗 UI 모델 피커 없이 자동 포함.

용량·잔여 리튬·불량 비율의 **실측 상관**은 compose의 `data_note`로만 설명하고, clf는 capacity/residual을 입력으로 쓰지 않는다.

---

## residual 학습 방식·기준 (residual_li → `/predict-residual`)

상세 계약: [`docs/references/cathode-residual-schema.md`](../docs/references/cathode-residual-schema.md)  
스크립트: [`train_residual_pipeline.py`](./train_residual_pipeline.py) · 산출: [`models/residual/`](./models/residual/)  
레지스트리: `residual.ready`는 학습 성공 후 `true`

| 항목 | 내용 |
|------|------|
| 데이터 | `data/cathode_qc_reg_data.csv` |
| 타깃 | `residual_li` (잔여 리튬, 단위 **ppm** 예시) |
| Feature | clf/reg와 동일 공정 9개 + `operator_id` + 동일 도메인 피처 |
| CV / 튜닝 | TimeSeriesSplit, Optuna **100**, study `xgb_residual_reg_v1` / `cat_residual_reg_v1` |
| Optuna DB | `optuna_residual.db` |
| 목적 | Fold 평균 **RMSE minimize** |
| 모델 | XGBRegressor + CatBoostRegressor, 앙상블 **0.5 / 0.5** |
| 실행 | `cd ai-service` 후 **승인 받고** `USE_GPU=0 OPTUNA_TRIALS=100 python train_residual_pipeline.py` |

What-if 선정: 불량 확률 최소 → 동률 시 residual 최소 → 동률 시 capacity 최대.

---

## 기술 스택

### 런타임 · API
- Python 3.11+
- FastAPI, Uvicorn, Starlette, Pydantic
- python-dotenv

### Agent · LLM
- LangGraph, LangChain Core
- LangChain OpenAI (OpenAI-compatible)
- LangChain Google GenAI (Gemini)
- Anthropic Messages: 표준 라이브러리 HTTP (추가 pip 없음)
- Auto/수동: 보안 탭 등록 키만 (`.env` API 키 폴백 없음)
- **Secure RAG:** Qdrant · BM25 · RRF fusion · bge-m3 / bge-reranker-v2-m3 (**CPU**) · LlamaIndex SentenceSplitter

### ML · 데이터
- Polars
- NumPy, scikit-learn, joblib
- XGBoost, CatBoost
- Optuna (SQLite resume)
- SHAP
- sentence-transformers, rank-bm25, qdrant-client, torch, llama-index-core, llama-index-llms-openai, llama-index-vector-stores-qdrant, pypdf, openpyxl, watchdog, SQLAlchemy, PyMySQL

### 예정
- TS 불량률(기상 데이터 후)

### 주요 산출물 경로
- 학습: `train_pipeline.py` (clf) · `train_reg_pipeline.py` (reg) · `train_residual_pipeline.py` (residual)
- 모델: `models/` (clf) · `models/reg/` · `models/residual/` · `models/registry.json`
- API: `app/main.py` (`/predict`, `/predict-capacity`, `/predict-residual`, `/chat`, `/security-chat`)
- Agent: `agent/` (`model_registry.py` · tools · graph · whatif · `rag_engine` · `secure_graph`)
- Secure docs: repo `Documents/` (`SECURE_DOCS_DIR`) · ingest: `ingest_secure.py` (`.md`/`.txt`/`.pdf`)
- Secure RAG E2E smoke: `python scripts/smoke_secure_rag_e2e.py` (needs vLLM `:8001`)

---

## 사용할 라이브러리 (requirements.txt 기준)

**직접 의존성:** polars, numpy, scikit-learn, xgboost, catboost, optuna, shap, joblib, fastapi, uvicorn[standard], pydantic, langgraph, langchain-core, langchain-openai, langchain-google-genai, python-dotenv, qdrant-client, sentence-transformers, rank-bm25, torch, llama-index-core, llama-index-llms-openai, llama-index-vector-stores-qdrant, pypdf, openpyxl, watchdog, SQLAlchemy, PyMySQL

**설치 시 따라온 주요 패키지(참고):** polars-runtime, sqlalchemy, alembic, numba, llvmlite, slicer, cloudpickle, starlette, httptools, watchfiles, websockets, graphviz, plotly, langgraph-checkpoint, langgraph-prebuilt, langgraph-sdk, langsmith, openai, tiktoken, orjson, tenacity, jsonpatch, google-generativeai, transformers, huggingface-hub 등

---

## 개발 기록

상세는 루트 일지: [`docs/work-log/`](../docs/work-log/)  
관련: [`docs/work-log/2026-07-28.md`](../docs/work-log/2026-07-28.md)
