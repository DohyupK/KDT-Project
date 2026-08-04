"""
ai-service FastAPI entrypoint.

Run from ai-service/ (CWD must be ai-service so models/ resolves):
  uvicorn app.main:app --host 0.0.0.0 --port 8800 --reload

API keys: load from ai-service/.env (never commit). See .env.example.
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load ai-service/.env before reading os.environ in this module / agent.
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH, override=False)

import polars as pl
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.schemas import (
    CapacityResponse,
    ChatRecommendation,
    ChatRequest,
    ChatResponse,
    ChatThreadListResponse,
    ChatThreadMessagesResponse,
    HealthResponse,
    PredictRequest,
    PredictResponse,
    ResidualResponse,
    SecurityChatRequest,
    SecurityChatResponse,
)
from agent.graph import run_chat
from agent.model_registry import list_ready_heads
from agent.secure_llm import compose_secure
from train_pipeline import MODELS_DIR, predict


@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop_watch = None
    try:
        from agent.document_watcher import start_document_watcher

        stop_watch = start_document_watcher()
    except Exception as exc:  # noqa: BLE001
        print(f"[document_watcher] start skipped: {exc}")
    yield
    if stop_watch is not None:
        try:
            stop_watch()
        except Exception as exc:  # noqa: BLE001
            print(f"[document_watcher] stop: {exc}")


app = FastAPI(
    title="KDT ai-service",
    description="O/X + capacity + residual_li diagnosis API (registry-extensible).",
    version="1.4.0",
    lifespan=lifespan,
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


@app.get("/chat/threads", response_model=ChatThreadListResponse)
def list_chat_threads(
    user_id: str,
    channel: str = "general",
    limit: int = 50,
) -> ChatThreadListResponse:
    """List persisted threads for general|security chatbot restore UI."""
    from agent import chat_history_store as store

    ch = (channel or "general").strip().lower()
    if ch not in ("general", "security"):
        raise HTTPException(status_code=400, detail="channel must be general|security")
    threads = store.list_threads(user_id=user_id, channel=ch, limit=limit)
    return ChatThreadListResponse(threads=threads)


@app.get("/chat/threads/{thread_id}/messages", response_model=ChatThreadMessagesResponse)
def get_chat_thread_messages(
    thread_id: str,
    user_id: str,
    limit: int = 200,
) -> ChatThreadMessagesResponse:
    """Load messages for a thread owned by user_id (UI hydrate)."""
    from agent import chat_history_store as store

    msgs = store.load_messages_for_ui(
        thread_id, user_id=user_id, limit=limit
    )
    if msgs is None:
        raise HTTPException(status_code=404, detail="thread not found")
    return ChatThreadMessagesResponse(thread_id=thread_id, messages=msgs)


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


@app.post("/predict-residual", response_model=ResidualResponse)
def predict_residual_endpoint(body: PredictRequest) -> ResidualResponse:
    """
    Single-row residual_li inference.
    Same raw features as /predict; domain engineering inside train_residual_pipeline.
    """
    from train_residual_pipeline import MODELS_DIR as RES_DIR
    from train_residual_pipeline import predict_residual_li

    required = RES_DIR / "xgb_model.json"
    if not required.exists():
        raise HTTPException(
            status_code=503,
            detail="Residual model artifacts missing. Train first (ai-service/models/residual/).",
        )

    row: dict = {k: getattr(body, k) for k in RAW_FEATURE_KEYS}
    if body.id is not None:
        row["id"] = body.id
    if body.timestamp is not None:
        row["timestamp"] = body.timestamp

    df = pl.DataFrame([row])
    try:
        result = predict_residual_li(df)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"predict-residual failed: {exc}"
        ) from exc

    return ResidualResponse(**result)


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(
    body: ChatRequest,
    background_tasks: BackgroundTasks,
) -> ChatResponse:
    """
    Minimal LangGraph chatbot.
    features가 있으면 registry ready heads(clf+reg+residual+…)를 자동 다중 호출 후 답변.
    CHAT_USE_LLM=1 + provider keys → Groq/Gemini length-based compose.
    Multi-turn: FE sends message + thread_id + user_id only; history loaded from MariaDB.
    Layer-2: Qdrant chat_history_collection upsert in BackgroundTasks (soft-fail).
    """
    global _chat_request_count
    _chat_request_count += 1

    from agent import chat_history_store as store
    from agent import chat_history_vector as vec

    features = body.features.model_dump(exclude_none=True) if body.features else None
    tid = store.ensure_thread(
        thread_id=body.thread_id,
        user_id=body.user_id,
        channel="general",
    )
    history = store.load_messages(tid) if tid else []
    window_text = store.format_history_text_compact(history)
    semantic = vec.search_similar(thread_id=tid, query=body.message) if tid else []
    history_text = vec.merge_history_with_semantic(
        window_text,
        semantic,
        heuristic_truncate_fn=store.heuristic_truncate,
        format_compact_fn=store.format_history_text_compact,
    )
    if tid and body.user_id:
        mid = store.insert_message(
            thread_id=tid,
            role="user",
            content=body.message,
            mode="general_user",
            provider="general",
        )
        background_tasks.add_task(
            vec.upsert_chat_message,
            thread_id=tid,
            user_id=body.user_id,
            channel="general",
            role="user",
            text=body.message,
            message_id=mid,
        )

    try:
        out = run_chat(
            message=body.message,
            features=features,
            fillThreshold=body.fillThreshold,
            need_guideline=body.need_guideline,
            llm_mode=body.llm_mode,
            llm_credentials=body.llm_credentials,
            history_text=history_text,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"chat failed: {exc}") from exc

    if tid and body.user_id:
        reply = out.get("reply") or ""
        mid_a = store.insert_message(
            thread_id=tid,
            role="assistant",
            content=reply,
            mode=out.get("mode"),
            provider=out.get("provider"),
        )
        background_tasks.add_task(
            vec.upsert_chat_message,
            thread_id=tid,
            user_id=body.user_id,
            channel="general",
            role="assistant",
            text=reply,
            message_id=mid_a,
        )

    predict_payload = out.get("predict")
    capacity_payload = out.get("capacity")
    residual_payload = out.get("residual")
    rec_payload = out.get("recommendation")
    recommendation = (
        ChatRecommendation.model_validate(rec_payload) if rec_payload else None
    )
    return ChatResponse(
        reply=out["reply"],
        mode=out.get("mode") or "template",
        provider=out.get("provider") or "template",
        thread_id=tid,
        predict=PredictResponse(**predict_payload) if predict_payload else None,
        capacity=CapacityResponse(**capacity_payload) if capacity_payload else None,
        residual=ResidualResponse(**residual_payload) if residual_payload else None,
        heads=out.get("heads"),
        recommendation=recommendation,
        error=out.get("error"),
    )


@app.post("/security-chat", response_model=SecurityChatResponse)
def security_chat_endpoint(
    body: SecurityChatRequest,
    background_tasks: BackgroundTasks,
) -> SecurityChatResponse | JSONResponse:
    """
    Security-tab channel: local vLLM only (CHAT_VLLM_BASE_URL).
    Never routes to Groq/Gemini. Failures return offline template.
    Unhandled exceptions return JSON 500 with stage/trace (not HTML).
    Multi-turn: message + thread_id + user_id; history/sources from MariaDB.
    Layer-2 Qdrant upsert via BackgroundTasks (does not touch SECURE_GENERATE / no_docs).
    """
    from agent import chat_history_vector as vec
    import time as _time

    def _schedule_upsert(**kwargs: object) -> None:
        background_tasks.add_task(vec.upsert_chat_message, **kwargs)

    t0 = _time.perf_counter()
    try:
        out = compose_secure(
            body.message,
            thread_id=body.thread_id,
            user_id=body.user_id,
            schedule_upsert=_schedule_upsert,
        )
        elapsed_ms = int((_time.perf_counter() - t0) * 1000)
        logger_msg = (
            f"[security-chat] endpoint ok elapsed_ms={elapsed_ms} "
            f"mode={out.get('mode')} provider={out.get('provider')} "
            f"n_sources={len(out.get('sources') or [])}"
        )
        print(logger_msg)
        return SecurityChatResponse(
            reply=out["reply"],
            mode=out.get("mode") or "template",
            provider=out.get("provider") or "offline",
            thread_id=out.get("thread_id"),
            error=out.get("error"),
            sources=out.get("sources") or [],
            trace=out.get("trace"),
        )
    except Exception as exc:  # noqa: BLE001
        elapsed_ms = int((_time.perf_counter() - t0) * 1000)
        detail = str(exc)[:400]
        print(f"[security-chat] endpoint fail elapsed_ms={elapsed_ms} err={detail}")
        return JSONResponse(
            status_code=500,
            content={
                "reply": "",
                "mode": "template",
                "provider": "offline",
                "error": detail,
                "sources": [],
                "stage": "unhandled",
                "elapsed_ms": elapsed_ms,
                "trace": [
                    {
                        "stage": "unhandled",
                        "ms": elapsed_ms,
                        "ok": False,
                        "detail": detail,
                    }
                ],
            },
        )


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "ai-service",
        "docs": "/docs",
        "health": "/health",
        "predict": "POST /predict",
        "predict_capacity": "POST /predict-capacity",
        "predict_residual": "POST /predict-residual",
        "chat": "POST /chat",
        "security_chat": "POST /security-chat",
    }
