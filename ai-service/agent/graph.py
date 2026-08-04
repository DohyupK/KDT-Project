"""
Minimal LangGraph chatbot.

Flow: START → predict_node → whatif_node → compose_node → END

- predict_node: all ready registry heads (clf O/X + reg capacity + residual + future)
- whatif: O/X + residual + capacity 격자 탐색
- compose: template / LLM
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from agent.llm import compose_with_failover, llm_enabled
from agent.prompts import USAGE_GUIDELINE
from agent.tools import run_registered_heads
from agent.whatif import run_whatif


class ChatState(TypedDict, total=False):
    message: str
    features: dict[str, Any] | None
    fillThreshold: float | None
    need_guideline: bool
    llm_mode: str | None
    llm_credentials: list[dict[str, Any]] | None
    history_text: str
    predict_result: dict[str, Any] | None
    capacity_result: dict[str, Any] | None
    residual_result: dict[str, Any] | None
    head_results: dict[str, Any] | None
    recommendation: dict[str, Any] | None
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


def _format_recommendation(recommendation: dict[str, Any] | None) -> str:
    if not recommendation:
        return ""
    sug = recommendation.get("suggestion")
    if not sug:
        note = recommendation.get("note")
        return f"\n\n{note}" if note else ""

    deltas = sug.get("deltas") or {}
    hum_d = deltas.get("humidity")
    temp_d = deltas.get("sintering_temp")
    after = sug.get("after_features") or {}
    p_after = float(sug["probability"])
    p_before = float((recommendation.get("baseline") or {}).get("probability") or 0)
    lines = [
        "\n\n[What-if 제안]",
        (
            f"현재 불량 확률 {p_before:.4f} → 제안 적용 시 {p_after:.4f} "
            f"(양품 확률 약 {(1.0 - p_after) * 100:.1f}%)."
        ),
    ]
    res_before = sug.get("residual_before")
    res_after = sug.get("residual_after")
    res_unit = sug.get("residual_unit") or "ppm"
    if res_before is not None and res_after is not None:
        lines.append(
            f"예상 잔여 리튬 {float(res_before):.1f} → {float(res_after):.1f} {res_unit} "
            "(residual 모델 예측이며 실측이 아닙니다)."
        )
    elif res_after is not None:
        lines.append(
            f"제안 적용 시 예상 잔여 리튬 {float(res_after):.1f} {res_unit} "
            "(residual 모델 예측이며 실측이 아닙니다)."
        )
    cap_before = sug.get("capacity_before")
    cap_after = sug.get("capacity_after")
    unit = sug.get("unit") or "mAh/g"
    if cap_before is not None and cap_after is not None:
        lines.append(
            f"예상 용량 {float(cap_before):.1f} → {float(cap_after):.1f} {unit} "
            "(reg 모델 예측이며 실측이 아닙니다)."
        )
    elif cap_after is not None:
        lines.append(
            f"제안 적용 시 예상 용량 {float(cap_after):.1f} {unit} "
            "(reg 모델 예측이며 실측이 아닙니다)."
        )
    parts: list[str] = []
    if hum_d is not None and float(hum_d) != 0.0:
        parts.append(f"습도 {after.get('humidity')}% (Δ {hum_d:+g})")
    if temp_d is not None and float(temp_d) != 0.0:
        parts.append(f"소성 온도 {after.get('sintering_temp')}℃ (Δ {temp_d:+g})")
    if parts:
        lines.append("조정안: " + ", ".join(parts) + ".")
    if sug.get("boundary_hit") and sug.get("limit_reason"):
        lines.append(f"[한계치 타협] {sug['limit_reason']}")
    lines.append("장비 반영은 UI에서 「제안 승인」한 뒤에만 로그됩니다 (하드웨어 미연동).")
    note = recommendation.get("note")
    if note:
        lines.append(str(note))
    return "\n".join(lines)


def _format_capacity(capacity_result: dict[str, Any] | None) -> str:
    if not capacity_result:
        return ""
    cap = float(capacity_result["capacity"])
    unit = capacity_result.get("unit") or "mAh/g"
    factors = capacity_result.get("top_factors") or []
    factors_txt = ", ".join(str(f) for f in factors)
    note = ""
    if cap < 185:
        note = " (데이터상 저용량 구간은 불량 비율이 높은 편입니다.)"
    elif cap >= 200:
        note = " (데이터상 고용량 구간은 정상 비율이 높은 편입니다.)"
    return (
        f"\n\n[용량 예측] 예상 전지 용량은 **{cap:.1f} {unit}** 입니다.{note}\n"
        f"용량 모델 Top-4 요인: {factors_txt} "
        "(전역 SHAP이며 이번 LOT 단독 원인이라고 단정하지 않습니다)."
    )


def _format_residual(residual_result: dict[str, Any] | None) -> str:
    if not residual_result:
        return ""
    val = float(residual_result["residual_li"])
    unit = residual_result.get("unit") or "ppm"
    factors = residual_result.get("top_factors") or []
    factors_txt = ", ".join(str(f) for f in factors)
    note = ""
    if val >= 5000:
        note = " (데이터상 고잔여 구간은 불량 비율이 정상보다 높습니다.)"
    elif val >= 3500:
        note = " (데이터상 잔여 리튬이 높아질수록 불량 비율이 증가하는 편입니다.)"
    elif 2500 <= val < 3500:
        note = " (데이터상 양산 중심 구간에 가깝습니다.)"
    return (
        f"\n\n[잔여 리튬 예측] 예상 잔여 리튬은 **{val:.1f} {unit}** 입니다.{note}\n"
        f"잔여 리튬 모델 Top-4 요인: {factors_txt} "
        "(전역 SHAP이며 이번 LOT 단독 원인이라고 단정하지 않습니다)."
    )


def _template_reply(
    message: str,
    predict_result: dict[str, Any] | None,
    error: str | None,
    recommendation: dict[str, Any] | None = None,
    capacity_result: dict[str, Any] | None = None,
    residual_result: dict[str, Any] | None = None,
) -> str:
    if error and predict_result is None:
        return (
            "진단을 완료하지 못했습니다. "
            f"사유: {error}\n"
            "공정 피처를 확인한 뒤 다시 요청해 주세요."
        )
    if (
        predict_result is None
        and capacity_result is None
        and residual_result is None
    ):
        return (
            "사용 안내입니다.\n\n"
            "1. Main 화면 「위험 LOT Top」에서 LOT **행을 클릭**하면 "
            "챗봇에 센서가 연결되고 O/X·용량·잔여 리튬 진단이 자동으로 시작됩니다.\n"
            "2. 「샘플 LOT 진단」칩으로도 시험할 수 있습니다.\n"
            "3. What-if 제안이 나오면 「제안 승인」→ 5초 안 「실행 취소」가능.\n"
            "4. 공정 한계치(온도·습도)는 Setting에서 바꿉니다.\n"
            "5. 보안·기밀은 /security 탭을 이용해 주세요.\n"
            f"(요청 요약: {message[:80]})"
        )

    parts: list[str] = []
    if predict_result is not None:
        status = predict_result["defect_status"]
        label = "불량(O)" if int(status) == 1 else "정상(X)"
        prob = float(predict_result["probability"])
        thr = float(predict_result["applied_threshold"])
        factors = predict_result.get("top_risk_factors") or []
        factors_txt = ", ".join(str(f) for f in factors)
        pct = prob * 100.0
        parts.append(
            "predict Tool 기준 진단 결과입니다.\n\n"
            f"판정은 **{label}**(defect_status={status})이며, "
            f"불량 확률은 {prob:.4f}({pct:.1f}%, 임계값 {thr})입니다.\n"
            f"전역 Top-4 위험 요인은 {factors_txt} 입니다. "
            "이 수치는 모델 추론 결과만 인용한 것이며, Top-4는 전역 SHAP 중요도입니다 "
            "(이번 LOT 샘플별 원인이라고 단정하지 않습니다)."
        )
    parts.append(_format_capacity(capacity_result).lstrip("\n") if capacity_result else "")
    parts.append(_format_residual(residual_result).lstrip("\n") if residual_result else "")
    body = "\n".join(p for p in parts if p)
    return body + _format_recommendation(recommendation)


def predict_node(state: ChatState) -> dict[str, Any]:
    features = state.get("features")
    if not features:
        return {
            "predict_result": None,
            "capacity_result": None,
            "residual_result": None,
            "head_results": None,
            "error": None,
        }

    packed = run_registered_heads(
        features,
        fillThreshold=state.get("fillThreshold"),
    )
    return {
        "predict_result": packed.get("predict"),
        "capacity_result": packed.get("capacity"),
        "residual_result": packed.get("residual"),
        "head_results": packed.get("heads"),
        "error": packed.get("error"),
    }


def whatif_node(state: ChatState) -> dict[str, Any]:
    features = state.get("features")
    predict_result = state.get("predict_result")
    if not features or not predict_result or state.get("error"):
        return {"recommendation": None}

    try:
        rec = run_whatif(
            features,
            predict_result,
            fillThreshold=state.get("fillThreshold"),
        )
        return {"recommendation": rec}
    except Exception:  # noqa: BLE001
        return {"recommendation": None}


def compose_node(state: ChatState) -> dict[str, Any]:
    message = state.get("message") or ""
    history = (state.get("history_text") or "").strip()
    message_for_llm = (
        f"이전 대화:\n{history}\n\n현재 질문:\n{message}" if history else message
    )
    predict_result = state.get("predict_result")
    capacity_result = state.get("capacity_result")
    residual_result = state.get("residual_result")
    recommendation = state.get("recommendation")
    error = state.get("error")
    need_guideline = bool(state.get("need_guideline"))

    if llm_enabled():
        reply, provider, llm_err = compose_with_failover(
            message_for_llm,
            predict_result,
            error,
            need_guideline=need_guideline,
            recommendation=recommendation,
            capacity_result=capacity_result,
            residual_result=residual_result,
            head_results=state.get("head_results"),
            llm_mode=state.get("llm_mode"),
            llm_credentials=state.get("llm_credentials"),
        )
        if reply:
            if recommendation and recommendation.get("suggestion"):
                if "[What-if 제안]" not in reply:
                    reply = reply.rstrip() + _format_recommendation(recommendation)
            if capacity_result and "[용량 예측]" not in reply:
                reply = reply.rstrip() + _format_capacity(capacity_result)
            if residual_result and "[잔여 리튬 예측]" not in reply:
                reply = reply.rstrip() + _format_residual(residual_result)
            return {
                "reply": reply,
                "mode": "llm",
                "provider": provider or "llm",
            }
        if llm_err:
            base = _template_reply(
                message,
                predict_result,
                error,
                recommendation,
                capacity_result,
                residual_result,
            )
            return {
                "reply": _append_guideline(
                    (base.rstrip() + "\n\n" + llm_err).strip(),
                    need_guideline,
                ),
                "mode": "template",
                "provider": "template",
                "error": llm_err,
            }

    return {
        "reply": _append_guideline(
            _template_reply(
                message,
                predict_result,
                error,
                recommendation,
                capacity_result,
                residual_result,
            ),
            need_guideline,
        ),
        "mode": "template",
        "provider": "template",
    }


def build_graph():
    g: StateGraph = StateGraph(ChatState)
    g.add_node("predict", predict_node)
    g.add_node("whatif", whatif_node)
    g.add_node("compose", compose_node)
    g.add_edge(START, "predict")
    g.add_edge("predict", "whatif")
    g.add_edge("whatif", "compose")
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
    llm_mode: str | None = "auto",
    llm_credentials: list[dict[str, Any]] | None = None,
    history_text: str | None = None,
) -> dict[str, Any]:
    """Run the chat graph. Returns reply + optional predict/capacity/residual/recommendation."""
    graph = get_graph()
    out: ChatState = graph.invoke(
        {
            "message": message,
            "features": features,
            "fillThreshold": fillThreshold,
            "need_guideline": need_guideline,
            "llm_mode": llm_mode,
            "llm_credentials": llm_credentials,
            "history_text": (history_text or "").strip(),
        }
    )
    return {
        "reply": out.get("reply") or "",
        "mode": out.get("mode") or "template",
        "provider": out.get("provider") or "template",
        "predict": out.get("predict_result"),
        "capacity": out.get("capacity_result"),
        "residual": out.get("residual_result"),
        "heads": out.get("head_results"),
        "recommendation": out.get("recommendation"),
        "error": out.get("error"),
    }
