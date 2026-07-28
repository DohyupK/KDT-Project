"""
ai-service FastAPI entrypoint.

Run from ai-service/ (CWD must be ai-service so models/ resolves):
  uvicorn app.main:app --host 0.0.0.0 --port 8800 --reload

API keys: load from ai-service/.env (never commit). See .env.example.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

# Load ai-service/.env before reading os.environ in this module / agent.
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH, override=False)

import polars as pl
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import (
    CapacityResponse,
    ChatRecommendation,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    PredictRequest,
    PredictResponse,
    SecurityChatRequest,
    SecurityChatResponse,
)
from agent.graph import run_chat
from agent.model_registry import list_ready_heads
from agent.secure_llm import compose_secure
from train_pipeline import MODELS_DIR, predict

app = FastAPI(
    title="KDT ai-service",
    description="O/X + capacity diagnosis API (chatbot Tool backend; registry-extensible).",
    version="1.3.0",
)

# Incremented on POST /chat — used to verify Express security gate does not proxy.
_chat_request_count = 0

# Dev: allow Next.js origin; tighten later
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RAW_FEATURE_KEYS = (
    "d50",
    "d90",
    "metal_impurity",
    "lithium_input",
    "additive_ratio",
    "process_time",
    "sintering_temp",
    "humidity",
    "tank_pressure",
    "operator_id",
)


def _default_threshold() -> float:
    cfg_path = MODELS_DIR / "ensemble_config.json"
    if cfg_path.exists():
        with open(cfg_path, encoding="utf-8") as f:
            cfg = json.load(f)
        return float(cfg.get("default_threshold", 0.5))
    return 0.5


def _model_version() -> str | None:
    meta_path = MODELS_DIR / "metadata.json"
    if not meta_path.exists():
        return None
    with open(meta_path, encoding="utf-8") as f:
        return json.load(f).get("model_version")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        model_version=_model_version(),
        models_dir=str(MODELS_DIR.resolve()),
        chat_requests=_chat_request_count,
        registry_ready=[str(h["id"]) for h in list_ready_heads()],
    )


@app.post("/predict", response_model=PredictResponse)
def predict_endpoint(body: PredictRequest) -> PredictResponse:
    """
    Single-row O/X inference.
    Accepts raw process features; domain engineering runs inside train_pipeline.predict.
    """
    required = MODELS_DIR / "xgb_model.json"
    if not required.exists():
        raise HTTPException(
            status_code=503,
            detail="Model artifacts missing. Train first (ai-service/models/).",
        )

    row: dict = {k: getattr(body, k) for k in RAW_FEATURE_KEYS}
    if body.id is not None:
        row["id"] = body.id
    if body.timestamp is not None:
        row["timestamp"] = body.timestamp

    thr = body.fillThreshold if body.fillThreshold is not None else _default_threshold()
    df = pl.DataFrame([row])

    try:
        result = predict(df, fillThreshold=float(thr))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"predict failed: {exc}") from exc

    return PredictResponse(**result)


@app.post("/predict-capacity", response_model=CapacityResponse)
def predict_capacity_endpoint(body: PredictRequest) -> CapacityResponse:
    """
    Single-row capacity (mAh/g) inference.
    Same raw features as /predict; domain engineering inside train_reg_pipeline.
    """
    from train_reg_pipeline import MODELS_DIR as REG_DIR
    from train_reg_pipeline import predict_capacity

    required = REG_DIR / "xgb_model.json"
    if not required.exists():
        raise HTTPException(
            status_code=503,
            detail="Reg model artifacts missing. Train first (ai-service/models/reg/).",
        )

    row: dict = {k: getattr(body, k) for k in RAW_FEATURE_KEYS}
    if body.id is not None:
        row["id"] = body.id
    if body.timestamp is not None:
        row["timestamp"] = body.timestamp

    df = pl.DataFrame([row])
    try:
        result = predict_capacity(df)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"predict-capacity failed: {exc}"
        ) from exc

    return CapacityResponse(**result)


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(body: ChatRequest) -> ChatResponse:
    """
    Minimal LangGraph chatbot.
    features가 있으면 registry ready heads(clf+reg+…)를 자동 이중(다중) 호출 후 답변.
    CHAT_USE_LLM=1 + provider keys → Groq/Gemini length-based compose.
    """
    global _chat_request_count
    _chat_request_count += 1

    features = body.features.model_dump(exclude_none=True) if body.features else None
    try:
        out = run_chat(
            message=body.message,
            features=features,
            fillThreshold=body.fillThreshold,
            need_guideline=body.need_guideline,
            llm_mode=body.llm_mode,
            llm_credentials=body.llm_credentials,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"chat failed: {exc}") from exc

    predict_payload = out.get("predict")
    capacity_payload = out.get("capacity")
    rec_payload = out.get("recommendation")
    recommendation = (
        ChatRecommendation.model_validate(rec_payload) if rec_payload else None
    )
    return ChatResponse(
        reply=out["reply"],
        mode=out.get("mode") or "template",
        provider=out.get("provider") or "template",
        predict=PredictResponse(**predict_payload) if predict_payload else None,
        capacity=CapacityResponse(**capacity_payload) if capacity_payload else None,
        heads=out.get("heads"),
        recommendation=recommendation,
        error=out.get("error"),
    )


@app.post("/security-chat", response_model=SecurityChatResponse)
def security_chat_endpoint(body: SecurityChatRequest) -> SecurityChatResponse:
    """
    Security-tab channel: local vLLM only (CHAT_VLLM_BASE_URL).
    Never routes to Groq/Gemini. Failures return offline template.
    """
    out = compose_secure(body.message)
    return SecurityChatResponse(
        reply=out["reply"],
        mode=out.get("mode") or "template",
        provider=out.get("provider") or "offline",
        error=out.get("error"),
    )


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "ai-service",
        "docs": "/docs",
        "health": "/health",
        "predict": "POST /predict",
        "predict_capacity": "POST /predict-capacity",
        "chat": "POST /chat",
        "security_chat": "POST /security-chat",
    }
