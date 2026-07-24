"""
Minimal LangGraph chatbot.

Flow: START → predict_node → compose_node → END

- predict Tool: train_pipeline.predict (features 있을 때만)
- compose: template by default; CHAT_USE_LLM=1 + keys → Groq/Gemini length routing
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from agent.llm import compose_with_failover, llm_enabled
from agent.prompts import USAGE_GUIDELINE
from agent.tools import run_predict_tool


class ChatState(TypedDict, total=False):
    message: str
    features: dict[str, Any] | None
    fillThreshold: float | None
    need_guideline: bool
    predict_result: dict[str, Any] | None
    error: str | None
    reply: str
    mode: Literal["template", "llm"]
    provider: str


def _append_guideline(reply: str, need_guideline: bool) -> str:
    if not need_guideline:
        return reply
    if "[사용 가이드]" in reply:
        return reply
    return reply.rstrip() + "\n\n" + USAGE_GUIDELINE


def _template_reply(
    message: str,
    predict_result: dict[str, Any] | None,
    error: str | None,
) -> str:
    if error:
        return (
            "진단을 완료하지 못했습니다. "
            f"사유: {error}\n"
            "공정 피처(d50, d90, metal_impurity, …, operator_id)를 확인한 뒤 다시 요청해 주세요."
        )
    if predict_result is None:
        return (
            "O/X 진단을 하려면 LOT의 공정 피처가 필요합니다. "
            "UI의 「샘플 LOT 진단」을 사용하거나, d50·sintering_temp·humidity 등 값을 함께 보내 주세요. "
            f"(요청 요약: {message[:120]})"
        )

    status = predict_result["defect_status"]
    label = "불량(O)" if int(status) == 1 else "정상(X)"
    prob = float(predict_result["probability"])
    thr = float(predict_result["applied_threshold"])
    factors = predict_result.get("top_risk_factors") or []
    factors_txt = ", ".join(str(f) for f in factors)
    pct = prob * 100.0

    return (
        f"predict Tool 기준 진단 결과입니다.\n\n"
        f"판정은 **{label}**(defect_status={status})이며, "
        f"불량 확률은 {prob:.4f}({pct:.1f}%, 임계값 {thr})입니다.\n"
        f"전역 Top-4 위험 요인은 {factors_txt} 입니다. "
        "이 수치는 모델 추론 결과만 인용한 것이며, Top-4는 전역 SHAP 중요도입니다 "
        "(이번 LOT 샘플별 원인이라고 단정하지 않습니다)."
    )


def predict_node(state: ChatState) -> dict[str, Any]:
    features = state.get("features")
    if not features:
        return {"predict_result": None, "error": None}

    try:
        result = run_predict_tool(
            features,
            fillThreshold=state.get("fillThreshold"),
        )
        return {"predict_result": result, "error": None}
    except Exception as exc:  # noqa: BLE001 — surface to compose
        return {"predict_result": None, "error": str(exc)}


def compose_node(state: ChatState) -> dict[str, Any]:
    message = state.get("message") or ""
    predict_result = state.get("predict_result")
    error = state.get("error")
    need_guideline = bool(state.get("need_guideline"))

    if llm_enabled():
        reply, provider = compose_with_failover(
            message,
            predict_result,
            error,
            need_guideline=need_guideline,
        )
        if reply:
            return {
                "reply": reply,
                "mode": "llm",
                "provider": provider or "llm",
            }

    return {
        "reply": _append_guideline(
            _template_reply(message, predict_result, error),
            need_guideline,
        ),
        "mode": "template",
        "provider": "template",
    }


def build_graph():
    g: StateGraph = StateGraph(ChatState)
    g.add_node("predict", predict_node)
    g.add_node("compose", compose_node)
    g.add_edge(START, "predict")
    g.add_edge("predict", "compose")
    g.add_edge("compose", END)
    return g.compile()


_GRAPH = None


def get_graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    return _GRAPH


def run_chat(
    message: str,
    features: dict[str, Any] | None = None,
    fillThreshold: float | None = None,
    need_guideline: bool = False,
) -> dict[str, Any]:
    """Run the minimal chat graph. Returns reply + optional predict JSON."""
    graph = get_graph()
    out: ChatState = graph.invoke(
        {
            "message": message,
            "features": features,
            "fillThreshold": fillThreshold,
            "need_guideline": need_guideline,
        }
    )
    return {
        "reply": out.get("reply") or "",
        "mode": out.get("mode") or "template",
        "provider": out.get("provider") or "template",
        "predict": out.get("predict_result"),
        "error": out.get("error"),
    }
