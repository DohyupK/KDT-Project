"""Generate analysis_lots.risk_reason via local security vLLM only (no RAG / chat compose)."""

from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from agent.secure_llm.llm import make_vllm, usable_llm_text

SYSTEM_RISK_REASON = """당신은 양극재 LOT 위험 사유를 짧게 적는 작성기입니다.
제공된 JSON 숫자·상태만 근거로 한국어 한두 문장을 씁니다.
규칙:
1. risk_level이 「안정」이고 spc_status도 문제 없음(안정)일 때만 「기준 범위 내」류로 짧게 적습니다.
2. risk_level이 「주의」또는 「심각」이면 절대 「기준 범위 내」라고 쓰지 말고,
   불량확률·잔류리튬·SPC 상태 등 주어진 값으로 왜 주의/심각인지 적습니다.
3. 수치를 지어내거나 Main LOT 클릭·What-if·사용법 안내를 하지 않습니다.
4. 255자 이내, 마크다운·코드펜스 없이 본문만."""


def compose_lot_risk_reason(facts: dict) -> tuple[str | None, str | None]:
    """
    Returns (reason_text, error).
    """
    try:
        llm = make_vllm(max_tokens=120)
        msg = (
            "다음 LOT 채점 결과로 risk_reason만 작성하세요.\n"
            f"{facts}"
        )
        out = llm.invoke(
            [
                SystemMessage(content=SYSTEM_RISK_REASON),
                HumanMessage(content=msg),
            ]
        )
        text = usable_llm_text(out.content)
        if not text:
            return None, "empty_vllm_reply"
        return text[:255], None
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)[:300]
