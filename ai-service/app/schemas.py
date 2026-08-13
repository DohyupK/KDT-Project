"""Request/response schemas for predict API (raw features only)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    """Raw LOT/process features. Engineered columns are computed inside predict()."""

    d50: float
    d90: float
    metal_impurity: float
    lithium_input: float
    additive_ratio: float
    process_time: float
    sintering_temp: float
    humidity: float
    tank_pressure: float
    operator_id: str
    fillThreshold: float | None = Field(
        default=None,
        description="Defect probability cutoff. If omitted, ensemble_config.default_threshold is used.",
    )
    id: str | None = None
    timestamp: str | None = None


class PredictResponse(BaseModel):
    defect_status: int
    probability: float
    applied_threshold: float
    top_risk_factors: list[str]


class CapacityResponse(BaseModel):
    capacity: float
    unit: str = "mAh/g"
    top_factors: list[str] = Field(default_factory=list)


class ResidualResponse(BaseModel):
    residual_li: float
    unit: str = "ppm"
    top_factors: list[str] = Field(default_factory=list)


class VotingPredictResponse(BaseModel):
    """Cascade voting: capacity, residual_li, probability (+ optional quality_defect)."""

    capacity: float
    residual_li: float
    probability: float
    quality_defect: int | None = None
    applied_threshold: float | None = None
    unit_capacity: str = "mAh/g"
    unit_residual: str = "ppm"
    probability_denominator: float | None = None
    member_scores: dict[str, float] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    model_version: str | None = None
    models_dir: str
    chat_requests: int = 0
    registry_ready: list[str] = Field(
        default_factory=list,
        description="Ready model head ids from models/registry.json",
    )
    chat_history_db_ok: bool = Field(
        default=False,
        description="MariaDB user_chat_* store reachable (SQLAlchemy + PyMySQL)",
    )
    chat_history_db_error: str | None = Field(
        default=None,
        description="Set when chat_history_db_ok is false",
    )


class ChatFeatures(BaseModel):
    """Same raw features as PredictRequest (optional id/timestamp)."""

    d50: float
    d90: float
    metal_impurity: float
    lithium_input: float
    additive_ratio: float
    process_time: float
    sintering_temp: float
    humidity: float
    tank_pressure: float
    operator_id: str
    id: str | None = None
    timestamp: str | None = None


class PageContextModel(BaseModel):
    """Screen context from FE (not shown in UI). Hybrid with optional BE supplement."""

    route: str = "/"
    focus_id: str | None = None
    focus_payload: Any | None = None
    page_payload: Any | None = None
    supplement: dict[str, Any] | None = None
    supplement_hints: list[str] | None = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User chat text")
    thread_id: str | None = Field(
        default=None,
        description="user_chat_threads.id — FE sends this; history loaded server-side",
    )
    user_id: str | None = Field(
        default=None,
        description="users.user_id — required to persist multi-turn history",
    )
    features: ChatFeatures | None = Field(
        default=None,
        description=(
            "If set on follow-up / explicit diagnosis, agent runs registry heads. "
            "First-turn page Q&A prefers page_context + RAG."
        ),
    )
    fillThreshold: float | None = Field(
        default=None,
        description="Passed to predict. If omitted, ensemble_config.default_threshold.",
    )
    need_guideline: bool = Field(
        default=False,
        description="If true, append usage guideline (similar questions ≥ 3).",
    )
    llm_mode: str | None = Field(
        default="auto",
        description='"auto" or a registered credential id from /security vault.',
    )
    llm_credentials: list[dict[str, Any]] | None = Field(
        default=None,
        description="Decrypted credentials from Express (never stored in ai-service).",
    )
    page_context: PageContextModel | None = Field(
        default=None,
        description="Current screen focus/page payloads for context-aware Q&A.",
    )
    enable_api_llm: bool | None = Field(
        default=None,
        description=(
            "Legacy flag. Learning heads run whenever features exist; "
            "RAG is gated by document/analysis intent instead."
        ),
    )


class WhatIfSuggestion(BaseModel):
    deltas: dict[str, float]
    after_features: ChatFeatures
    probability: float
    defect_status: int
    applied_threshold: float
    boundary_hit: bool = False
    limit_reason: str | None = None
    ideal_values: dict[str, float] | None = None
    clipped_values: dict[str, float] | None = None
    residual_before: float | None = None
    residual_after: float | None = None
    residual_unit: str | None = "ppm"
    capacity_before: float | None = None
    capacity_after: float | None = None
    unit: str | None = "mAh/g"


class RecommendationBaseline(BaseModel):
    probability: float
    defect_status: int
    applied_threshold: float
    features: ChatFeatures
    capacity: float | None = None
    residual_li: float | None = None


class ChatRecommendation(BaseModel):
    method: str = Field(description="e.g. whatif_grid")
    baseline: RecommendationBaseline
    suggestion: WhatIfSuggestion | None = None
    note: str | None = None


class ChatResponse(BaseModel):
    reply: str
    mode: str = Field(description="'template' | 'llm' | 'security_redirect'")
    provider: str = Field(
        default="template",
        description="'groq' | 'gemini_flash' | 'gemini_pro' | 'template' | 'security_redirect'",
    )
    thread_id: str | None = Field(
        default=None,
        description="Persisted user_chat_threads.id when multi-turn store is used",
    )
    predict: PredictResponse | None = None
    capacity: CapacityResponse | None = None
    residual: ResidualResponse | None = None
    heads: dict[str, Any] | None = Field(
        default=None,
        description="Extensible bag of registry head results (clf/reg/residual/future).",
    )
    recommendation: ChatRecommendation | None = None
    error: str | None = None
    timing: dict[str, Any] | None = Field(
        default=None,
        description="Optional [chat-timing] breakdown (predict/rag/compose ms).",
    )


class KnowledgeAnalyzeRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Knowledge library materials + instruction")
    llm_mode: str | None = Field(
        default="auto",
        description='"auto" or a registered credential id from /security vault.',
    )
    llm_credentials: list[dict[str, Any]] | None = Field(
        default=None,
        description="Decrypted credentials from Express (never stored in ai-service).",
    )


class KnowledgeAnalyzeResponse(BaseModel):
    reply: str
    mode: str = Field(description="'llm' | 'error'")
    provider: str | None = None
    error: str | None = None


class SecurityChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Security-tab user text")
    thread_id: str | None = Field(
        default=None,
        description="user_chat_threads.id — history loaded server-side from MariaDB",
    )
    user_id: str | None = Field(
        default=None,
        description="users.user_id for per-user thread ownership",
    )


class SecurityChatSource(BaseModel):
    doc_id: str | None = None
    title: str | None = None
    category: str | None = None
    process: str | None = None
    source_path: str | None = None
    chunk_index: int | None = None
    text: str = ""


class SecurityChatResponse(BaseModel):
    reply: str
    mode: str = Field(
        description="'security_rag' | 'security_no_docs' | 'security_vllm' | 'template'",
    )
    provider: str = Field(
        default="offline",
        description="'vllm' | 'rag' | 'offline'",
    )
    thread_id: str | None = Field(
        default=None,
        description="Persisted user_chat_threads.id",
    )
    error: str | None = None
    sources: list[SecurityChatSource] = Field(default_factory=list)
    trace: list[dict[str, Any]] | None = Field(
        default=None,
        description="Stage diagnostics: [{stage, ms, ok, detail}, ...]",
    )


class ChatThreadItem(BaseModel):
    id: str
    user_id: str
    channel: str
    title: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ChatThreadListResponse(BaseModel):
    threads: list[ChatThreadItem] = Field(default_factory=list)


class ChatThreadMessageItem(BaseModel):
    role: str
    content: str
    mode: str | None = None
    provider: str | None = None
    sources: list[Any] | None = None
    created_at: str | None = None


class ChatThreadMessagesResponse(BaseModel):
    thread_id: str
    messages: list[ChatThreadMessageItem] = Field(default_factory=list)
