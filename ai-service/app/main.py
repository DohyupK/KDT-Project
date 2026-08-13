"""
ai-service FastAPI entrypoint.

Run from ai-service/ (CWD must be ai-service so models/ resolves):
  uvicorn app.main:app --host 0.0.0.0 --port 8800 --reload

Env: monorepo root `.env` only (never commit).
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from pathlib import Path

from dotenv import load_dotenv

# Load repo-root .env before reading os.environ in this module / agent.
_AI_ROOT = Path(__file__).resolve().parent.parent
_REPO_ROOT = _AI_ROOT.parent
_ENV_PATH = _REPO_ROOT / ".env"
load_dotenv(_ENV_PATH, override=False)


def _configure_file_logging() -> None:
    """Rotating file log (10MB x 5). Skip if already attached (uvicorn --reload)."""
    log_path = Path(
        os.environ.get("AI_SERVICE_LOG_FILE")
        or str(_AI_ROOT / "logs" / "ai-service.log")
    )
    if not log_path.is_absolute():
        log_path = _AI_ROOT / log_path
    log_path.parent.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger()
    for h in root.handlers:
        if isinstance(h, RotatingFileHandler):
            return
    handler = RotatingFileHandler(
        log_path,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    handler.setLevel(logging.INFO)
    if root.level == logging.NOTSET or root.level > logging.INFO:
        root.setLevel(logging.INFO)
    root.addHandler(handler)


from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from app.schemas import (
    CapacityResponse,
    ChatRecommendation,
    ChatRequest,
    ChatResponse,
    ChatThreadListResponse,
    ChatThreadMessagesResponse,
    HealthResponse,
    KnowledgeAnalyzeRequest,
    KnowledgeAnalyzeResponse,
    LotRiskReasonRequest,
    LotRiskReasonResponse,
    ExplainLotRequest,
    ExplainLotResponse,
    LotRecommendedActionRequest,
    LotRecommendedActionResponse,
    PredictRequest,
    PredictResponse,
    ResidualResponse,
    SecurityChatRequest,
    SecurityChatResponse,
    VotingPredictResponse,
)
from agent.api_llm.graph import run_chat
from agent.api_llm.model_registry import list_ready_heads
from agent.secure_llm import compose_secure, compose_secure_stream
from train_pipeline import MODELS_DIR

# After train_pipeline (which may clear root handlers) attach rotating server log.
_configure_file_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _configure_file_logging()
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
    """Voting default_threshold from voting_config.json (fallback 0.4)."""
    cfg_path = MODELS_DIR / "voting_config.json"
    if cfg_path.exists():
        with open(cfg_path, encoding="utf-8") as f:
            cfg = json.load(f)
        thr = (cfg.get("threshold") or {}).get("default_threshold")
        if thr is not None:
            return float(thr)
    return 0.4


def _model_version() -> str | None:
    cfg_path = MODELS_DIR / "voting_config.json"
    if cfg_path.exists():
        return "2.0.0-voting"
    return None


def _features_row(body: PredictRequest) -> dict:
    row: dict = {k: getattr(body, k) for k in RAW_FEATURE_KEYS}
    if body.id is not None:
        row["id"] = body.id
    if body.timestamp is not None:
        row["timestamp"] = body.timestamp
    return row


def _run_voting(body: PredictRequest) -> dict:
    from voting_predict import predict_voting

    thr = body.fillThreshold if body.fillThreshold is not None else None
    return predict_voting(_features_row(body), fill_threshold=thr)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    from agent.chat_history_store import chat_history_db_status

    db = chat_history_db_status()
    return HealthResponse(
        status="ok",
        model_version=_model_version(),
        models_dir=str(MODELS_DIR.resolve()),
        chat_requests=_chat_request_count,
        registry_ready=[str(h["id"]) for h in list_ready_heads()],
        chat_history_db_ok=bool(db.get("ok")),
        chat_history_db_error=db.get("error"),
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


@app.post("/predict-voting", response_model=VotingPredictResponse)
def predict_voting_endpoint(body: PredictRequest) -> VotingPredictResponse:
    """Cascade multi-model voting (capacity → residual → probability /15)."""
    cfg_path = MODELS_DIR / "voting_config.json"
    if not cfg_path.exists():
        raise HTTPException(status_code=503, detail="voting_config.json missing")
    try:
        result = _run_voting(body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"predict-voting failed: {exc}") from exc
    return VotingPredictResponse(**result)


@app.post("/predict", response_model=PredictResponse)
def predict_endpoint(body: PredictRequest) -> PredictResponse:
    """O/X from cascade voting probability (legacy single-head models disconnected)."""
    cfg_path = MODELS_DIR / "voting_config.json"
    if not cfg_path.exists():
        raise HTTPException(
            status_code=503,
            detail="Voting models missing. Legacy clf artifacts removed; use voting under models/voting/.",
        )
    try:
        voted = _run_voting(body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"predict failed: {exc}") from exc

    thr = voted.get("applied_threshold")
    if thr is None:
        thr = (
            float(body.fillThreshold)
            if body.fillThreshold is not None
            else _default_threshold()
        )
    qd = voted.get("quality_defect")
    if qd is None:
        qd = 1 if float(voted["probability"]) >= float(thr) else 0
    return PredictResponse(
        defect_status=int(qd),
        probability=float(voted["probability"]),
        applied_threshold=float(thr),
        top_risk_factors=[],
    )


@app.post("/predict-capacity", response_model=CapacityResponse)
def predict_capacity_endpoint(body: PredictRequest) -> CapacityResponse:
    """Capacity from cascade voting (legacy models/reg disconnected)."""
    cfg_path = MODELS_DIR / "voting_config.json"
    if not cfg_path.exists():
        raise HTTPException(
            status_code=503,
            detail="Voting models missing. Legacy reg artifacts removed.",
        )
    try:
        voted = _run_voting(body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"predict-capacity failed: {exc}"
        ) from exc
    return CapacityResponse(capacity=float(voted["capacity"]), unit="mAh/g", top_factors=[])


@app.post("/predict-residual", response_model=ResidualResponse)
def predict_residual_endpoint(body: PredictRequest) -> ResidualResponse:
    """residual_li from cascade voting (legacy models/residual disconnected)."""
    cfg_path = MODELS_DIR / "voting_config.json"
    if not cfg_path.exists():
        raise HTTPException(
            status_code=503,
            detail="Voting models missing. Legacy residual artifacts removed.",
        )
    try:
        voted = _run_voting(body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"predict-residual failed: {exc}"
        ) from exc
    return ResidualResponse(
        residual_li=float(voted["residual_li"]), unit="ppm", top_factors=[]
    )


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


@app.post("/knowledge-analyze", response_model=KnowledgeAnalyzeResponse)
def knowledge_analyze_endpoint(body: KnowledgeAnalyzeRequest) -> KnowledgeAnalyzeResponse:
    """
    Knowledge library summarize — no /chat graph, SYSTEM_COMPOSE, predict, RAG, or history.
    Uses registered API LLM credentials from Express only.
    """
    from agent.api_llm.knowledge_compose import compose_knowledge

    reply, provider, err = compose_knowledge(
        body.message,
        llm_mode=body.llm_mode,
        llm_credentials=body.llm_credentials,
    )
    if not reply:
        logging.getLogger(__name__).warning(
            "[knowledge-analyze] empty_or_error: %s", err or "unknown"
        )
        return KnowledgeAnalyzeResponse(
            reply="",
            mode="error",
            provider=provider,
            error=err or "LLM 응답이 비어 있습니다.",
        )
    return KnowledgeAnalyzeResponse(
        reply=reply,
        mode="llm",
        provider=provider or "llm",
        error=err,
    )


@app.post("/lot-risk-reason", response_model=LotRiskReasonResponse)
def lot_risk_reason_endpoint(body: LotRiskReasonRequest) -> LotRiskReasonResponse:
    """analysis_lots.risk_reason via local vLLM only — no RAG / SYSTEM_COMPOSE."""
    from agent.api_llm.lot_risk_reason import compose_lot_risk_reason

    facts = {
        "lot_id": body.lot_id,
        "probability": body.probability,
        "spc_status": body.spc_status,
        "risk_level": body.risk_level,
        "residual_li": body.residual_li,
        "capacity": body.capacity,
        "quality_defect": body.quality_defect,
    }
    text, err = compose_lot_risk_reason(facts)
    if not text:
        logging.getLogger(__name__).warning(
            "[lot-risk-reason] empty_or_error lot=%s err=%s", body.lot_id, err
        )
        return LotRiskReasonResponse(risk_reason="", provider="vllm", error=err or "empty")
    return LotRiskReasonResponse(risk_reason=text, provider="vllm", error=None)


@app.post("/explain-lot", response_model=ExplainLotResponse)
def explain_lot_endpoint(body: ExplainLotRequest) -> ExplainLotResponse:
    """Per-LOT SHAP drivers for defect probability and residual Li models."""
    from agent.lot_explain import explain_lot_from_request

    try:
        drivers = explain_lot_from_request(body.model_dump())
        return ExplainLotResponse(drivers_json=drivers, error=None)
    except Exception as exc:  # noqa: BLE001
        logging.getLogger(__name__).warning("[explain-lot] fail: %s", exc)
        return ExplainLotResponse(drivers_json={}, error=str(exc)[:300])


@app.post("/lot-recommended-action", response_model=LotRecommendedActionResponse)
def lot_recommended_action_endpoint(
    body: LotRecommendedActionRequest,
) -> LotRecommendedActionResponse:
    """QMS-grounded recommended action from drivers + optional RAG/vLLM."""
    from agent.api_llm.lot_recommended_action import compose_lot_recommended_action

    try:
        result = compose_lot_recommended_action(body.model_dump())
        return LotRecommendedActionResponse(
            summary=result.get("summary") or "",
            steps=result.get("steps") or [],
            sources=result.get("sources") or [],
            drivers_json=result.get("drivers_json") or body.drivers_json,
            status=result.get("status") or "ready",
            error=result.get("error"),
        )
    except Exception as exc:  # noqa: BLE001
        logging.getLogger(__name__).warning(
            "[lot-recommended-action] fail lot=%s err=%s", body.lot_id, exc
        )
        return LotRecommendedActionResponse(
            summary="",
            steps=[],
            sources=[],
            drivers_json=body.drivers_json,
            status="error",
            error=str(exc)[:300],
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


def _format_sse(event: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event}\ndata: {payload}\n\n"


@app.post("/security-chat/stream")
async def security_chat_stream_endpoint(
    body: SecurityChatRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> StreamingResponse:
    """
    SSE stream: meta/delta/replace/done/error.
    MariaDB writes only inside compose_secure_stream (not Express).
    """
    from agent import chat_history_vector as vec

    def _schedule_upsert(**kwargs: object) -> None:
        background_tasks.add_task(vec.upsert_chat_message, **kwargs)

    async def event_gen():
        try:
            async for item in compose_secure_stream(
                body.message,
                thread_id=body.thread_id,
                user_id=body.user_id,
                schedule_upsert=_schedule_upsert,
                is_disconnected=request.is_disconnected,
            ):
                if await request.is_disconnected():
                    break
                ev = str(item.get("event") or "message")
                data = item.get("data") or {}
                yield _format_sse(ev, data)
        except Exception as exc:  # noqa: BLE001
            detail = str(exc)[:400]
            print(f"[security-chat/stream] fail err={detail}")
            yield _format_sse(
                "error",
                {"error": detail, "stage": "unhandled_stream"},
            )

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
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
        "knowledge_analyze": "POST /knowledge-analyze",
        "lot_risk_reason": "POST /lot-risk-reason",
        "security_chat": "POST /security-chat",
        "security_chat_stream": "POST /security-chat/stream",
    }
