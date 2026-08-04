# ai-service

양극재 품질 **O/X 진단 ML** · **전지 용량(reg)** · **잔여 Li** · **FastAPI** · **LangGraph 챗봇** · **Secure RAG**.

사람용 기능·설계·실행 안내입니다. AI 규칙은 [`AGENTS.md`](./AGENTS.md).  
기능·단가 카탈로그: [`docs/references/ai-service-feature-catalog.md`](../docs/references/ai-service-feature-catalog.md).  
**기술 스택**은 [루트 README](../README.md#기술-스택-모노레포).

---

## 한 줄 역할

진단·일반/보안 챗·RAG·정형 분석을 제공하는 **AI HTTP 서비스** (:8800). CWD는 항상 `ai-service/`.

---

## 기능 요약

| 기능 | 경로 / 모듈 | 비고 |
|------|-------------|------|
| Health | `GET /health` | `registry_ready` 헤드 |
| O/X 분류 | `POST /predict` | `fillThreshold` 유지 |
| 용량 회귀 | `POST /predict-capacity` | |
| 잔여 Li | `POST /predict-residual` | |
| 일반 챗 | `POST /chat` | ready 헤드 전부 + LLM(등록 키) / template · what-if |
| 보안 챗 JSON | `POST /security-chat` | 스모크·하위호환 · 클라우드 폴백 없음 |
| 보안 챗 SSE | `POST /security-chat/stream` | `meta`/`delta`/`replace`/`done`/`error` |
| Secure RAG | `secure_graph` · Qdrant `secure_docs` | Hybrid + BM25 + RRF + CPU rerank |
| Analytics | `node_analytics` · `csv_lake` | Polars 집계 · Smart Fallback→RAG |
| Ingest | `ingest_secure.py` · watchdog | Documents → MD/인덱스 · BM25 핫리로드 |

상세 목록: [`ai-service-feature-catalog.md`](../docs/references/ai-service-feature-catalog.md)

---

## 실행 방법

**권장:** 저장소 루트에서 `npm run dev`  
([로컬 실행 — 챗봇](../README.md#로컬-실행--챗봇)) — frontend(:3000) + backend(:3001) + 이 서비스(:8800).

### 개별 기동

```bash
cd ai-service
pip install -r requirements.txt
# 루트 .env: CHAT_USE_LLM=1 · CHAT_VLLM_* (보안) · SECURE_* (RAG)
# 학습 (승인 후): train_pipeline.py / train_reg_pipeline.py / train_residual_pipeline.py
python -m uvicorn app.main:app --host 127.0.0.1 --port 8800
```

- Health: `GET http://127.0.0.1:8800/health`
- Docs: `http://127.0.0.1:8800/docs`
- **CWD는 항상 `ai-service/`** (`models/` 상대 경로)
- 기동 시 `app/main.py`가 모노레포 루트 `.env`를 `load_dotenv`로 읽음

### LLM compose — 키는 보안 탭 / DB만

일반 챗 API 키는 **루트 `.env`에 두지 않습니다.**  
프론트 `/security` → Express 암호화 → [`DB/data/llm_keys.sqlite`](../DB/data/llm_keys.sqlite).

```text
CHAT_USE_LLM=1
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
CHAT_VLLM_MODEL=local-model
```

- `CHAT_USE_LLM=1` + 등록 키 → Auto(단가·티어) / 수동
- 키 없음 → template + 「보안 탭에서 API 키를 저장」안내
- `CHAT_VLLM_*` = 보안 탭 전용 · 마스터: 루트 `.env`의 `LLM_KEYS_ENCRYPTION_KEY`

---

## 세부 설계

### clf 학습 (`/predict`)

상세: [`cathode-clf-schema.md`](../docs/references/cathode-clf-schema.md) · [`train_pipeline.py`](./train_pipeline.py) · `models/`

| 항목 | 내용 |
|------|------|
| 데이터 | `data/cathode_clf_data.csv` |
| 타깃 | `quality_defect` ∈ {0,1} (1=불량) |
| Feature | 수치 공정 9개 + `operator_id` + v1.2.0 도메인 피처 |
| 제외 | `id`, `timestamp` |
| 전처리 | Polars, seed **42**, Train 평균 imputer, 범주 `__MISSING__` |
| CV / 튜닝 | TimeSeriesSplit, Optuna **100**, `xgb_ox_clf` / `cat_ox_clf` |
| 목적 | Fold 평균 **ROC-AUC maximize** |
| 모델 | XGBoost + CatBoost, 앙상블 **0.5 / 0.5** |
| 임계값 | cost = FP + FN×가중치 (`fillThreshold` 필드명 유지) |
| 설명 | 전역 SHAP → Top-4 요인 **이름** |
| 실행 | **승인 후** `python train_pipeline.py` |

참고: `model_version` 1.2.0, `test_roc_auc` ≈ 0.94, `device_mode` cpu.

### reg 학습 (`/predict-capacity`)

상세: [`cathode-reg-schema.md`](../docs/references/cathode-reg-schema.md) · `train_reg_pipeline.py` · `models/reg/` · `models/registry.json`

| 항목 | 내용 |
|------|------|
| 데이터 | `data/cathode_reg_data.csv` |
| 타깃 | `capacity` (mAh/g) |
| Feature | clf와 동일 공정·도메인 피처 |
| CV / 목적 | TimeSeriesSplit, Optuna 100, **RMSE minimize** |
| Optuna DB | `optuna_reg.db` (clf와 분리) |
| 모델 | XGBRegressor + CatBoostRegressor, 0.5 / 0.5 |
| 실행 | **승인 후** `USE_GPU=0 OPTUNA_TRIALS=100 python train_reg_pipeline.py` |

### residual 학습 (`/predict-residual`)

상세: [`cathode-residual-schema.md`](../docs/references/cathode-residual-schema.md) · `train_residual_pipeline.py` · `models/residual/`

| 항목 | 내용 |
|------|------|
| 데이터 | `data/cathode_qc_reg_data.csv` |
| 타깃 | `residual_li` (ppm 예시) |
| CV / 목적 | TimeSeriesSplit, Optuna 100, RMSE minimize |
| Optuna DB | `optuna_residual.db` |
| 실행 | **승인 후** `USE_GPU=0 OPTUNA_TRIALS=100 python train_residual_pipeline.py` |

### 챗봇 다중 헤드

`models/registry.json`에서 `ready: true`인 헤드를 features 채팅 시 **전부** 호출.

| 헤드 | API | 역할 |
|------|-----|------|
| `clf` | `/predict` | O/X 불량 확률 |
| `reg` | `/predict-capacity` | 전지 용량 |
| `residual` | `/predict-residual` | 잔여 리튬 |

clf는 capacity/residual을 입력으로 쓰지 않는다. What-if: 불량 최소 → residual 최소 → capacity 최대.

### Secure RAG · SSE · analytics (요약)

- 하이브리드 검색 + rerank soft fallback · chunk 400/50 · `min_score` 기본 0.15
- BM25 핫리로드(워처) · `[SYS_RAG_EMPTY_RESULT]` hard override
- SSE 스마트 버퍼 · `SECURE_GENERATE=0` 기본(문서 발췌)
- `csv_lake` 정형 분석 Smart Fallback → RAG
- 운영: [`secure-rag.md`](../docs/references/secure-rag.md) · [`LLM 튜닝.md`](../docs/references/LLM%20튜닝.md) · [`security-chatbot-guide.md`](../docs/references/security-chatbot-guide.md)

### 주요 경로

- API: `app/main.py`
- Agent: `agent/` (`model_registry` · tools · graph · whatif · `rag_engine` · `secure_graph` · `analytics_engine`)
- Secure docs: repo `Documents/` (`SECURE_DOCS_DIR`) · `ingest_secure.py` · `scripts/rebuild_secure_rag_clean.py`
- E2E smoke: `python scripts/smoke_secure_rag_e2e.py` (vLLM `:8001` 필요할 수 있음)

### 제약 (요약)

- 가짜 outcome/CSV 금지 · 보안 채널 클라우드 폴백 금지
- embed/rerank **CPU 강제** · `fillThreshold` 이름 변경 금지
- 학습·pip·장시간 명령은 승인 후 ([`ask-before-run`](../.cursor/rules/ask-before-run.mdc))

---

## 기술 스택

모노레포 스택 SSOT: [루트 README — 기술 스택](../README.md#기술-스택-모노레포)  
직접 의존성 원본: [`requirements.txt`](./requirements.txt)

---

## 개발 기록

[`docs/work-log/`](../docs/work-log/) · [`2026-08-02`](../docs/work-log/2026-08-02.md) · [`2026-08-01`](../docs/work-log/2026-08-01.md) · [`2026-07-28`](../docs/work-log/2026-07-28.md)
