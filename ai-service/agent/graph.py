"""
Minimal LangGraph chatbot.

Flow: START → predict_node → compose_node → END

- predict Tool: train_pipeline.predict (features 있을 때만)
- compose: 기본은 템플릿 답변; OPENAI_API_KEY(+CHAT_USE_LLM=1)면 LLM 문장화
"""

from __future__ import annotations

import json
import os
from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from agent.prompts import SYSTEM_COMPOSE
from agent.tools import run_predict_tool


class ChatState(TypedDict, total=False):
    message: str
    features: dict[str, Any] | None
    fillThreshold: float | None
    predict_result: dict[str, Any] | None
    error: str | None
    reply: str
    mode: Literal["template", "llm"]


def _template_reply(
    message: str,
    predict_result: dict[str, Any] | None,
    error: str | None,
) -> str:
    if error:
        return (
            "진단을 수행하지 못했습니다. "
            f"사유: {error}\n"
            "공정 피처(d50, d90, metal_impurity, …, operator_id)를 확인해 주세요."
        )
    if predict_result is None:
        return (
            "안녕하세요. O/X 진단을 하려면 현재 LOT의 공정 피처가 필요합니다. "
            "features를 함께 보내 주시면 predict Tool로 진단한 뒤 결과를 말씀드립니다. "
            f"(요청: {message[:120]})"
        )

    status = predict_result["defect_status"]
    label = "불량(O)" if int(status) == 1 else "정상(X)"
    prob = float(predict_result["probability"])
    thr = float(predict_result["applied_threshold"])
    factors = predict_result.get("top_risk_factors") or []
    factors_txt = ", ".join(str(f) for f in factors)

    return (
        f"진단 결과입니다 (predict Tool).\n"
        f"- 판정: {label} (defect_status={status})\n"
        f"- 불량 확률: {prob:.4f} (임계값 applied_threshold={thr})\n"
        f"- 전역 Top-4 위험 요인: {factors_txt}\n"
        "위 수치는 모델 추론 결과이며, 임의로 생성한 값이 아닙니다. "
        "Top-4는 전역 SHAP 중요도입니다."
    )


def _llm_available() -> bool:
    if os.environ.get("CHAT_USE_LLM", "0").strip() not in ("1", "true", "True", "yes"):
        return False
    return bool(os.environ.get("OPENAI_API_KEY", "").strip())


def _llm_compose(
    message: str,
    predict_result: dict[str, Any] | None,
    error: str | None,
) -> str:
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    payload = {
        "user_message": message,
        "predict": predict_result,
        "error": error,
    }
    llm = ChatOpenAI(
        model=os.environ.get("CHAT_LLM_MODEL", "gpt-4o-mini"),
        temperature=0,
    )
    out = llm.invoke(
        [
            SystemMessage(content=SYSTEM_COMPOSE),
            HumanMessage(
                content=(
                    "다음 JSON만 근거로 한국어 답변을 작성하세요.\n"
                    + json.dumps(payload, ensure_ascii=False)
                )
            ),
        ]
    )
    content = out.content
    if isinstance(content, list):
        # content blocks → plain text
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and "text" in block:
                parts.append(str(block["text"]))
        return "".join(parts).strip() or _template_reply(message, predict_result, error)
    return str(content).strip() or _template_reply(message, predict_result, error)


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

    if _llm_available():
        try:
            reply = _llm_compose(message, predict_result, error)
            return {"reply": reply, "mode": "llm"}
        except Exception:  # noqa: BLE001 — fall back to template
            pass

    return {
        "reply": _template_reply(message, predict_result, error),
        "mode": "template",
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
) -> dict[str, Any]:
    """Run the minimal chat graph. Returns reply + optional predict JSON."""
    graph = get_graph()
    out: ChatState = graph.invoke(
        {
            "message": message,
            "features": features,
            "fillThreshold": fillThreshold,
        }
    )
    return {
        "reply": out.get("reply") or "",
        "mode": out.get("mode") or "template",
        "predict": out.get("predict_result"),
        "error": out.get("error"),
    }
