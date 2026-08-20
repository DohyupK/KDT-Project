"""
Minimal LangGraph chatbot (orchestrated run_chat with optional parallel RAG).

Flow: predict+whatif ∥ rag(optional) → compose → polish

- predict: registry heads whenever features exist (always — not gated by turn)
- rag: document/summary intent (needs_rag); Public+Confidential
- compose: template / LLM then 2nd polish pass (page_context in JSON only)
"""

from __future__ import annotations

import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from agent.api_llm.llm import compose_with_failover, llm_enabled
from agent.api_llm.prompts import LLM_OFF_EXCERPT_NOTICE, RAG_EMPTY_HINT, USAGE_GUIDELINE
from agent.api_llm.tools import run_registered_heads
from agent.api_llm.whatif import run_whatif
from agent.api_llm.grounding import (
    deterministic_user_reply,
    is_lot_why_intent,
    is_page_summary_intent,
    join_spaced_parts,
    normalize_korean_reply,
    slice_page_context_for_query,
)
from agent.rag_engine import API_ALLOWED_CLEARANCES, get_engine

_log = logging.getLogger(__name__)

# General-chat document RAG (synthesis budget)
API_RAG_TOP_K = 8
API_RAG_RERANK_N = 4
API_RAG_CHUNK_CHARS = 800
API_RAG_MAX_SOURCES = 4

_DOC_NOUN_RE = re.compile(
    r"(문서|규정|SOP|sop|매뉴얼|핸드북|가이드|자료|Knowledge|knowledge|지식|"
    r"근거\s*문서|관련\s*문서)",
    re.IGNORECASE,
)
_DOC_INTENT_RE = re.compile(
    r"(문서|규정|SOP|sop|매뉴얼|핸드북|가이드|자료|Knowledge|knowledge|지식|"
    r"분석해|상세|자세히|근거\s*문서|관련\s*문서|찾아줘|검색)",
    re.IGNORECASE,
)
_DOC_SYNTH_RE = re.compile(
    r"(요약|정리|핵심|해석|비교|설명해)",
    re.IGNORECASE,
)
_SHORT_FOLLOWUP_RE = re.compile(
    r"^(왜|뭐|무엇|그게|그건|그거|저거|이것|그것|"
    r"자세히|더\s*알려|이유가|이유\s*가|"
    r"요약|정리|핵심).{0,40}$",
    re.IGNORECASE | re.DOTALL,
)
_LOT_MSG_RE = re.compile(
    r"(LOT[-_]?\w+|이\s*LOT|해당\s*LOT|왜\s*심각|위험\s*LOT)",
    re.IGNORECASE,
)
_FOCUS_LOT_RE = re.compile(
    r"(lot|risk-top|lot-risk|issue|spc-panel)",
    re.IGNORECASE,
)

_FEATURE_KEYS = (
    "d50",
    "d90",
    "metal_impurity",
    "lithium_input",
    "additive_ratio",
    "process_time",
    "sintering_temp",
    "humidity",
    "tank_pressure",
    "OP01_EXE_TIME",
)


class ChatState(TypedDict, total=False):
    message: str
    features: dict[str, Any] | None
    fillThreshold: float | None
    need_guideline: bool
    llm_mode: str | None
    llm_credentials: list[dict[str, Any]] | None
    history_text: str
    page_context: dict[str, Any] | None
    enable_api_llm: bool
    need_rag: bool
    predict_result: dict[str, Any] | None
    capacity_result: dict[str, Any] | None
    residual_result: dict[str, Any] | None
    head_results: dict[str, Any] | None
    recommendation: dict[str, Any] | None
    rag_sources: list[dict[str, Any]] | None
    error: str | None
    reply: str
    mode: Literal["template", "llm"]
    provider: str
    timing: dict[str, Any]


def _last_user_from_history(history_text: str) -> str:
    last = ""
    for line in (history_text or "").splitlines():
        s = line.strip()
        if s.startswith("User:"):
            last = s[len("User:") :].strip()
    return last


def expand_rag_query(message: str, history_text: str | None = None) -> str:
    """Merge a short follow-up with the previous user question for retrieve."""
    msg = (message or "").strip()
    if not _SHORT_FOLLOWUP_RE.search(msg):
        return msg
    prev = _last_user_from_history(history_text or "")
    if not prev or prev == msg:
        return msg
    return f"{prev} / {msg}"


def needs_rag(
    message: str,
    page_context: dict[str, Any] | None = None,
    history_text: str | None = None,
) -> bool:
    """
    RAG for document/analysis intent.
    Screen-summary chips skip RAG. Short follow-ups inherit prior doc topic.
    """
    del page_context  # route is not a RAG trigger; selected paths stay out of scope
    m = (message or "").strip()
    if not m:
        return False
    if is_page_summary_intent(m):
        return False
    if is_lot_why_intent(m):
        return True
    if _DOC_INTENT_RE.search(m):
        return True
    if _DOC_SYNTH_RE.search(m) and _DOC_NOUN_RE.search(m):
        return True
    hist = history_text or ""
    if _SHORT_FOLLOWUP_RE.search(m) and (
        _DOC_NOUN_RE.search(hist) or _DOC_INTENT_RE.search(hist)
    ):
        return True
    return False


def _wants_api_llm(message: str) -> bool:
    m = (message or "").strip().lower()
    keys = (
        "what-if",
        "whatif",
        "진단",
        "예측",
        "불량 확률",
        "용량",
        "잔여",
        "잔류",
        "제안",
        "조절",
        "습도",
        "소성",
    )
    return any(k in m for k in keys)


def extract_features_from_page_context(
    page_context: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Pull sensor-like numbers from focus/page payloads when FE omitted features."""
    if not page_context:
        return None
    focus = page_context.get("focus_payload") or page_context.get("focusPayload")
    candidates: list[Any] = []
    if isinstance(focus, dict):
        candidates.append(focus)
        if isinstance(focus.get("record"), dict):
            candidates.append(focus["record"])
        if isinstance(focus.get("row"), dict):
            candidates.append(focus["row"])
        if isinstance(focus.get("detail"), dict):
            candidates.append(focus["detail"])
    page = page_context.get("page_payload") or page_context.get("pagePayload")
    if isinstance(page, dict) and isinstance(page.get("selectedLot"), dict):
        candidates.append(page["selectedLot"])

    alias = {
        "sinteringTemp": "sintering_temp",
        "sintering_temp": "sintering_temp",
        "metalImpurity": "metal_impurity",
        "metal_impurity": "metal_impurity",
        "lithiumInput": "lithium_input",
        "lithium_input": "lithium_input",
        "additiveRatio": "additive_ratio",
        "additive_ratio": "additive_ratio",
        "processTime": "process_time",
        "process_time": "process_time",
        "tankPressure": "tank_pressure",
        "tank_pressure": "tank_pressure",
        "humidity": "humidity",
        "d50": "d50",
        "d90": "d90",
    }
    out: dict[str, Any] = {}
    for src in candidates:
        if not isinstance(src, dict):
            continue
        for k, v in src.items():
            canon = alias.get(str(k))
            if not canon or canon in out:
                continue
            try:
                num = float(v)
            except (TypeError, ValueError):
                continue
            if num == num:  # not NaN
                out[canon] = num
    if not out:
        return None
    # Heads usually need a fuller feature set; only return if we have core process knobs
    if "sintering_temp" in out or "humidity" in out or "d50" in out:
        return out
    return None


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
    cap_before = sug.get("capacity_before")
    cap_after = sug.get("capacity_after")
    cap_unit = sug.get("capacity_unit") or "mAh/g"
    if cap_before is not None and cap_after is not None:
        lines.append(
            f"예상 용량 {float(cap_before):.2f} → {float(cap_after):.2f} {cap_unit} "
            "(capacity 모델 예측이며 실측이 아닙니다)."
        )
    if hum_d is not None:
        lines.append(
            f"습도 제안: {after.get('humidity')} "
            f"(Δ {float(hum_d):+.2f})."
        )
    if temp_d is not None:
        lines.append(
            f"소성온도 제안: {after.get('sintering_temp')} "
            f"(Δ {float(temp_d):+.2f})."
        )
    if sug.get("boundary_hit"):
        lines.append(f"한계치 타협: {sug.get('limit_reason') or '제어 한계 적용'}")
    return "\n".join(lines)


def _format_capacity(capacity_result: dict[str, Any] | None) -> str:
    if not capacity_result:
        return ""
    cap = capacity_result.get("capacity")
    unit = capacity_result.get("unit") or "mAh/g"
    if cap is None:
        return ""
    return f"\n\n[용량 예측] {float(cap):.2f} {unit}"


def _format_residual(residual_result: dict[str, Any] | None) -> str:
    if not residual_result:
        return ""
    val = residual_result.get("residual_li")
    unit = residual_result.get("unit") or "ppm"
    if val is None:
        return ""
    return f"\n\n[잔여 리튬 예측] {float(val):.1f} {unit}"


def _template_reply(
    message: str,
    predict_result: dict[str, Any] | None,
    error: str | None,
    recommendation: dict[str, Any] | None = None,
    capacity_result: dict[str, Any] | None = None,
    residual_result: dict[str, Any] | None = None,
    page_context: dict[str, Any] | None = None,
    rag_sources: list[dict[str, Any]] | None = None,
    need_rag: bool = False,
) -> str:
    if error and predict_result is None and not page_context:
        return f"진단에 실패했습니다: {error}"

    if need_rag and not rag_sources:
        return RAG_EMPTY_HINT

    parts: list[str] = []
    if page_context and not rag_sources:
        route = page_context.get("route") or "/"
        focus = page_context.get("focus_id") or page_context.get("focusId")
        parts.append(
            join_spaced_parts(
                [
                    f"현재 화면 ({route})",
                    f"포커스 = {focus}" if focus else None,
                    "기준입니다.",
                ]
            )
        )
        focus_payload = page_context.get("focus_payload") or page_context.get("focusPayload")
        page_payload = page_context.get("page_payload") or page_context.get("pagePayload")
        if isinstance(page_payload, dict) and page_payload.get("empty_hint"):
            parts.append(str(page_payload["empty_hint"]))
        try:
            if focus_payload is not None and not (
                isinstance(page_payload, dict) and page_payload.get("primary_table") == "offscreen"
            ):
                # Prefer human summary fields over raw JSON dump when possible
                if isinstance(focus_payload, dict):
                    field_bits = [
                        f"LOT {focus_payload.get('lotId')}"
                        if focus_payload.get("lotId")
                        else None,
                        f"등급 {focus_payload.get('grade') or focus_payload.get('status')}"
                        if (focus_payload.get("grade") or focus_payload.get("status"))
                        else None,
                        f"SPC {focus_payload.get('spcStatus') or focus_payload.get('spc')}"
                        if (
                            focus_payload.get("spcStatus") is not None
                            or focus_payload.get("spc") is not None
                        )
                        else None,
                    ]
                    human = join_spaced_parts([b for b in field_bits if b])
                    if human:
                        parts.append(join_spaced_parts(["포커스 데이터:", human]))
                    else:
                        parts.append(
                            join_spaced_parts(
                                [
                                    "포커스 데이터:",
                                    json.dumps(
                                        focus_payload, ensure_ascii=False, default=str
                                    )[:1200],
                                ]
                            )
                        )
                else:
                    parts.append(
                        join_spaced_parts(
                            [
                                "포커스 데이터:",
                                json.dumps(
                                    focus_payload, ensure_ascii=False, default=str
                                )[:1200],
                            ]
                        )
                    )
            elif page_payload is not None:
                if not (
                    isinstance(page_payload, dict)
                    and page_payload.get("primary_table") == "offscreen"
                ):
                    parts.append(
                        join_spaced_parts(
                            [
                                "화면 데이터:",
                                json.dumps(
                                    page_payload, ensure_ascii=False, default=str
                                )[:1200],
                            ]
                        )
                    )
        except Exception:  # noqa: BLE001
            pass
        supplement = page_context.get("supplement")
        if supplement:
            try:
                parts.append(
                    join_spaced_parts(
                        [
                            "서버 보충:",
                            json.dumps(supplement, ensure_ascii=False, default=str)[:800],
                        ]
                    )
                )
            except Exception:  # noqa: BLE001
                pass

    if rag_sources:
        parts.append(LLM_OFF_EXCERPT_NOTICE)
        parts.append("관련 문서 발췌:")
        for s in rag_sources[:API_RAG_MAX_SOURCES]:
            title = s.get("title") or s.get("doc_id") or "doc"
            text = (s.get("text") or "")[:API_RAG_CHUNK_CHARS]
            parts.append(join_spaced_parts([f"- {title}:", text]))

    if predict_result:
        prob = float(predict_result.get("probability") or 0)
        thr = float(predict_result.get("applied_threshold") or 0.5)
        defect = int(predict_result.get("defect_status") or 0)
        factors = predict_result.get("top_factors") or []
        factors_txt = ", ".join(str(f) for f in factors[:4]) or "(없음)"
        label = "불량 (O)" if defect == 1 else "정상 (X)"
        parts.append(
            join_spaced_parts(
                [
                    f"모델 진단: {label},",
                    f"불량 확률 {prob:.4f}",
                    f"(임계 {thr}).",
                    f"전역 Top 요인: {factors_txt}.",
                ]
            )
        )
    body = join_spaced_parts([p for p in parts if p], sep="\n")
    if not body:
        body = (
            "화면 데이터나 모델 입력이 부족합니다. "
            "화면에서 LOT · KPI 를 선택하거나, 문서 분석이 필요하면 "
            "「상세 분석」 · Knowledge 를 이용해 주세요."
        )
    extras = join_spaced_parts(
        [
            _format_recommendation(recommendation) or None,
            _format_capacity(capacity_result) if capacity_result else None,
            _format_residual(residual_result) if residual_result else None,
        ],
        sep="\n",
    )
    return join_spaced_parts([body, extras] if extras else [body], sep="\n")


def predict_bundle(state: dict[str, Any]) -> dict[str, Any]:
    """Run heads whenever features exist (learning models always on)."""
    empty = {
        "predict_result": None,
        "capacity_result": None,
        "residual_result": None,
        "head_results": None,
        "recommendation": None,
        "error": None,
    }
    features = state.get("features")
    if not features:
        return empty

    packed = run_registered_heads(
        features,
        fillThreshold=state.get("fillThreshold"),
    )
    predict_result = packed.get("predict")
    out = {
        "predict_result": predict_result,
        "capacity_result": packed.get("capacity"),
        "residual_result": packed.get("residual"),
        "head_results": packed.get("heads"),
        "error": packed.get("error"),
        "recommendation": None,
    }
    if features and predict_result and not packed.get("error"):
        try:
            out["recommendation"] = run_whatif(
                features,
                predict_result,
                fillThreshold=state.get("fillThreshold"),
            )
        except Exception:  # noqa: BLE001
            out["recommendation"] = None
    return out


def _compact_rag_sources(
    hits: list[dict[str, Any]], *, per_chunk: int = API_RAG_CHUNK_CHARS
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for h in hits[:API_RAG_MAX_SOURCES]:
        text = str(h.get("text") or "")
        if len(text) > per_chunk:
            text = text[:per_chunk].rstrip() + "…"
        out.append(
            {
                "title": h.get("title"),
                "doc_id": h.get("doc_id"),
                "clearance": h.get("clearance"),
                "text": text,
            }
        )
    return out


def rag_bundle(message: str, history_text: str | None = None) -> list[dict[str, Any]]:
    """Public+Confidential retrieve."""
    query = expand_rag_query(message, history_text)
    if not query:
        return []
    try:
        engine = get_engine()
        engine.ensure()
        if not engine.ready:
            return []
        hits = engine.retrieve(
            query,
            top_k=API_RAG_TOP_K,
            rerank_top_n=API_RAG_RERANK_N,
            llm_invoke=None,
            allowed_clearances=API_ALLOWED_CLEARANCES,
        )
        return _compact_rag_sources(hits)
    except Exception:  # noqa: BLE001
        return []


def compose_bundle(state: dict[str, Any]) -> dict[str, Any]:
    message = state.get("message") or ""
    history = (state.get("history_text") or "").strip()
    page_context = state.get("page_context")
    need_rag = bool(state.get("need_rag"))

    predict_result = state.get("predict_result")
    capacity_result = state.get("capacity_result")
    residual_result = state.get("residual_result")
    recommendation = state.get("recommendation")
    rag_sources = state.get("rag_sources") or []
    error = state.get("error")
    need_guideline = bool(state.get("need_guideline"))

    # Offscreen / SPC-absent: fixed spaced reply — do not let LLM jam/paraphrase rules
    det = deterministic_user_reply(page_context if isinstance(page_context, dict) else None)
    if det:
        return {
            "reply": normalize_korean_reply(
                _append_guideline(det, need_guideline)
            ),
            "mode": "template",
            "provider": "grounding",
        }

    if llm_enabled():
        reply, provider, llm_err = compose_with_failover(
            message,
            predict_result,
            error,
            need_guideline=need_guideline,
            recommendation=recommendation,
            capacity_result=capacity_result,
            residual_result=residual_result,
            head_results=state.get("head_results"),
            rag_sources=rag_sources,
            page_context=page_context,
            history_text=history,
            need_rag=need_rag,
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
                "reply": normalize_korean_reply(reply),
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
                page_context,
                rag_sources,
                need_rag=need_rag,
            )
            return {
                "reply": normalize_korean_reply(
                    _append_guideline(
                        (base.rstrip() + "\n\n" + llm_err).strip(),
                        need_guideline,
                    )
                ),
                "mode": "template",
                "provider": "template",
                "error": llm_err,
            }

    return {
        "reply": normalize_korean_reply(
            _append_guideline(
                _template_reply(
                    message,
                    predict_result,
                    error,
                    recommendation,
                    capacity_result,
                    residual_result,
                    page_context,
                    rag_sources,
                    need_rag=need_rag,
                ),
                need_guideline,
            )
        ),
        "mode": "template",
        "provider": "template",
    }


# --- LangGraph node wrappers (compat / optional graph) ---


def predict_node(state: ChatState) -> dict[str, Any]:
    return predict_bundle(state)


def whatif_node(state: ChatState) -> dict[str, Any]:
    # whatif folded into predict_bundle; no-op if already set
    if state.get("recommendation") is not None or not state.get("predict_result"):
        return {}
    features = state.get("features")
    predict_result = state.get("predict_result")
    if not features or not predict_result or state.get("error"):
        return {"recommendation": None}
    try:
        return {
            "recommendation": run_whatif(
                features,
                predict_result,
                fillThreshold=state.get("fillThreshold"),
            )
        }
    except Exception:  # noqa: BLE001
        return {"recommendation": None}


def rag_node(state: ChatState) -> dict[str, Any]:
    if not state.get("need_rag", True):
        return {"rag_sources": []}
    return {"rag_sources": rag_bundle(state.get("message") or "", state.get("history_text"))}


def compose_node(state: ChatState) -> dict[str, Any]:
    return compose_bundle(state)


def build_graph():
    """Legacy sequential graph (run_chat uses ThreadPool orchestration instead)."""
    g: StateGraph = StateGraph(ChatState)
    g.add_node("predict", predict_node)
    g.add_node("whatif", whatif_node)
    g.add_node("rag", rag_node)
    g.add_node("compose", compose_node)
    g.add_edge(START, "predict")
    g.add_edge("predict", "whatif")
    g.add_edge("whatif", "rag")
    g.add_edge("rag", "compose")
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
    page_context: dict[str, Any] | None = None,
    enable_api_llm: bool | None = None,
) -> dict[str, Any]:
    """
    Orchestrate models ∥ optional RAG then compose.
    Learning models run whenever features exist (enable_api_llm does not block them).
    """
    t0 = time.perf_counter()
    history = (history_text or "").strip()
    page_context = slice_page_context_for_query(message, page_context)
    # Explicit FE features always run; page-extracted features only on diagnosis intent
    feats = features
    if not feats and _wants_api_llm(message):
        feats = extract_features_from_page_context(page_context)
    need = needs_rag(message, page_context, history)
    _ = enable_api_llm

    base: dict[str, Any] = {
        "message": message,
        "features": feats,
        "fillThreshold": fillThreshold,
        "need_guideline": need_guideline,
        "llm_mode": llm_mode,
        "llm_credentials": llm_credentials,
        "history_text": history,
        "page_context": page_context,
        "need_rag": need,
        "enable_api_llm": True if feats else False,
    }

    predict_ms = 0.0
    rag_ms = 0.0
    model_out: dict[str, Any] = {
        "predict_result": None,
        "capacity_result": None,
        "residual_result": None,
        "head_results": None,
        "recommendation": None,
        "error": None,
    }
    rag_sources: list[dict[str, Any]] = []

    def _models() -> tuple[dict[str, Any], float]:
        t = time.perf_counter()
        return predict_bundle(base), (time.perf_counter() - t) * 1000

    def _rag() -> tuple[list[dict[str, Any]], float]:
        t = time.perf_counter()
        return rag_bundle(message, history), (time.perf_counter() - t) * 1000

    if feats and need:
        with ThreadPoolExecutor(max_workers=2) as pool:
            f_m = pool.submit(_models)
            f_r = pool.submit(_rag)
            model_out, predict_ms = f_m.result()
            rag_sources, rag_ms = f_r.result()
    elif feats:
        model_out, predict_ms = _models()
    elif need:
        rag_sources, rag_ms = _rag()

    compose_state = {
        **base,
        **model_out,
        "rag_sources": rag_sources,
    }
    t_c = time.perf_counter()
    composed = compose_bundle(compose_state)
    compose_ms = (time.perf_counter() - t_c) * 1000
    total_ms = (time.perf_counter() - t0) * 1000

    timing = {
        "predict_ms": round(predict_ms, 1),
        "rag_ms": round(rag_ms, 1),
        "compose_ms": round(compose_ms, 1),
        "total_ms": round(total_ms, 1),
        "need_rag": int(need),
        "has_features": int(bool(feats)),
        "rag_hits": len(rag_sources),
    }
    _log.info(
        "[chat-timing] predict_ms=%s rag_ms=%s compose_ms=%s total_ms=%s "
        "need_rag=%s has_features=%s rag_hits=%s",
        timing["predict_ms"],
        timing["rag_ms"],
        timing["compose_ms"],
        timing["total_ms"],
        timing["need_rag"],
        timing["has_features"],
        timing["rag_hits"],
    )

    return {
        "reply": composed.get("reply") or "",
        "mode": composed.get("mode") or "template",
        "provider": composed.get("provider") or "template",
        "predict": model_out.get("predict_result"),
        "capacity": model_out.get("capacity_result"),
        "residual": model_out.get("residual_result"),
        "heads": model_out.get("head_results"),
        "recommendation": model_out.get("recommendation"),
        "error": composed.get("error") or model_out.get("error"),
        "timing": timing,
        "rag_sources": rag_sources,
        "need_rag": need,
        "features_used": bool(feats),
    }


def iter_chat_events(
    message: str,
    features: dict[str, Any] | None = None,
    fillThreshold: float | None = None,
    need_guideline: bool = False,
    llm_mode: str | None = "auto",
    llm_credentials: list[dict[str, Any]] | None = None,
    history_text: str | None = None,
    page_context: dict[str, Any] | None = None,
    enable_api_llm: bool | None = None,
):
    """
    Yield SSE-oriented dicts: meta → delta* → done.
    Models ∥ RAG first (meta after), then stream compose deltas.
    """
    from agent.api_llm.llm import iter_compose_stream, llm_enabled

    t0 = time.perf_counter()
    history = (history_text or "").strip()
    page_context = slice_page_context_for_query(message, page_context)
    feats = features
    if not feats and _wants_api_llm(message):
        feats = extract_features_from_page_context(page_context)
    need = needs_rag(message, page_context, history)
    _ = enable_api_llm

    yield {
        "event": "meta",
        "data": {
            "need_rag": need,
            "has_features": bool(feats),
            "stage": "start",
        },
    }

    base: dict[str, Any] = {
        "message": message,
        "features": feats,
        "fillThreshold": fillThreshold,
        "need_guideline": need_guideline,
        "llm_mode": llm_mode,
        "llm_credentials": llm_credentials,
        "history_text": history,
        "page_context": page_context,
        "need_rag": need,
        "enable_api_llm": True if feats else False,
    }

    predict_ms = 0.0
    rag_ms = 0.0
    model_out: dict[str, Any] = {
        "predict_result": None,
        "capacity_result": None,
        "residual_result": None,
        "head_results": None,
        "recommendation": None,
        "error": None,
    }
    rag_sources: list[dict[str, Any]] = []

    def _models() -> tuple[dict[str, Any], float]:
        t = time.perf_counter()
        return predict_bundle(base), (time.perf_counter() - t) * 1000

    def _rag() -> tuple[list[dict[str, Any]], float]:
        t = time.perf_counter()
        return rag_bundle(message, history), (time.perf_counter() - t) * 1000

    if feats and need:
        with ThreadPoolExecutor(max_workers=2) as pool:
            f_m = pool.submit(_models)
            f_r = pool.submit(_rag)
            model_out, predict_ms = f_m.result()
            rag_sources, rag_ms = f_r.result()
    elif feats:
        model_out, predict_ms = _models()
    elif need:
        rag_sources, rag_ms = _rag()

    yield {
        "event": "meta",
        "data": {
            "need_rag": need,
            "has_features": bool(feats),
            "rag_hits": len(rag_sources),
            "predict_ms": round(predict_ms, 1),
            "rag_ms": round(rag_ms, 1),
            "stage": "context_ready",
        },
    }

    reply_parts: list[str] = []
    provider = "template"
    mode = "template"
    compose_err = None
    t_c = time.perf_counter()

    det = deterministic_user_reply(page_context if isinstance(page_context, dict) else None)
    if det:
        reply = normalize_korean_reply(
            _append_guideline(det, bool(need_guideline))
        )
        compose_ms = (time.perf_counter() - t_c) * 1000
        yield {"event": "delta", "data": {"text": reply}}
        total_ms = (time.perf_counter() - t0) * 1000
        timing = {
            "predict_ms": round(predict_ms, 1),
            "rag_ms": round(rag_ms, 1),
            "compose_ms": round(compose_ms, 1),
            "total_ms": round(total_ms, 1),
            "need_rag": int(need),
            "has_features": int(bool(feats)),
            "rag_hits": len(rag_sources),
        }
        _log.info(
            "[chat-timing] predict_ms=%s rag_ms=%s compose_ms=%s total_ms=%s "
            "need_rag=%s has_features=%s rag_hits=%s stream=1 grounding=1",
            timing["predict_ms"],
            timing["rag_ms"],
            timing["compose_ms"],
            timing["total_ms"],
            timing["need_rag"],
            timing["has_features"],
            timing["rag_hits"],
        )
        yield {
            "event": "done",
            "data": {
                "reply": reply,
                "mode": "template",
                "provider": "grounding",
                "predict": model_out.get("predict_result"),
                "capacity": model_out.get("capacity_result"),
                "residual": model_out.get("residual_result"),
                "heads": model_out.get("head_results"),
                "recommendation": model_out.get("recommendation"),
                "error": model_out.get("error"),
                "timing": timing,
                "need_rag": need,
            },
        }
        return

    if llm_enabled():
        for kind, payload in iter_compose_stream(
            message,
            model_out.get("predict_result"),
            model_out.get("error"),
            need_guideline=need_guideline,
            recommendation=model_out.get("recommendation"),
            capacity_result=model_out.get("capacity_result"),
            residual_result=model_out.get("residual_result"),
            head_results=model_out.get("head_results"),
            rag_sources=rag_sources,
            page_context=page_context,
            history_text=history,
            need_rag=need,
            llm_mode=llm_mode,
            llm_credentials=llm_credentials,
        ):
            if kind == "delta" and isinstance(payload, str) and payload:
                reply_parts.append(payload)
                yield {"event": "delta", "data": {"text": payload}}
            elif kind == "done" and isinstance(payload, dict):
                if payload.get("reply"):
                    reply_parts = [str(payload["reply"])]
                    provider = payload.get("provider") or provider
                    mode = "llm"
                compose_err = payload.get("error")
    compose_ms = (time.perf_counter() - t_c) * 1000

    reply = "".join(reply_parts).strip()
    if not reply:
        composed = compose_bundle({**base, **model_out, "rag_sources": rag_sources})
        reply = composed.get("reply") or ""
        mode = composed.get("mode") or "template"
        provider = composed.get("provider") or "template"
        compose_err = composed.get("error") or compose_err
        # push as one delta if nothing streamed
        if reply:
            yield {"event": "delta", "data": {"text": reply}}

    rec = model_out.get("recommendation")
    if rec and rec.get("suggestion") and "[What-if 제안]" not in reply:
        extra = _format_recommendation(rec)
        reply = reply.rstrip() + extra
        yield {"event": "delta", "data": {"text": extra}}

    total_ms = (time.perf_counter() - t0) * 1000
    timing = {
        "predict_ms": round(predict_ms, 1),
        "rag_ms": round(rag_ms, 1),
        "compose_ms": round(compose_ms, 1),
        "total_ms": round(total_ms, 1),
        "need_rag": int(need),
        "has_features": int(bool(feats)),
        "rag_hits": len(rag_sources),
    }
    _log.info(
        "[chat-timing] predict_ms=%s rag_ms=%s compose_ms=%s total_ms=%s "
        "need_rag=%s has_features=%s rag_hits=%s stream=1",
        timing["predict_ms"],
        timing["rag_ms"],
        timing["compose_ms"],
        timing["total_ms"],
        timing["need_rag"],
        timing["has_features"],
        timing["rag_hits"],
    )

    yield {
        "event": "done",
        "data": {
            "reply": normalize_korean_reply(reply),
            "mode": mode,
            "provider": provider,
            "predict": model_out.get("predict_result"),
            "capacity": model_out.get("capacity_result"),
            "residual": model_out.get("residual_result"),
            "heads": model_out.get("head_results"),
            "recommendation": model_out.get("recommendation"),
            "error": compose_err or model_out.get("error"),
            "timing": timing,
            "need_rag": need,
        },
    }
