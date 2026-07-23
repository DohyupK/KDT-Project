"""Request/response schemas for predict API (raw features only)."""

from __future__ import annotations

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


class HealthResponse(BaseModel):
    status: str
    model_version: str | None = None
    models_dir: str


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


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User chat text")
    features: ChatFeatures | None = Field(
        default=None,
        description="If set, agent runs predict Tool then replies citing that JSON only.",
    )
    fillThreshold: float | None = Field(
        default=None,
        description="Passed to predict. If omitted, ensemble_config.default_threshold.",
    )


class ChatResponse(BaseModel):
    reply: str
    mode: str = Field(description="'template' or 'llm'")
    predict: PredictResponse | None = None
    error: str | None = None
