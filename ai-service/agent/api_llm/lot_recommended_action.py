"""Compose LOT recommended actions (summary + steps + QMS sources) from drivers + optional RAG/vLLM."""

from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from agent.secure_llm.llm import make_vllm, usable_llm_text

FEATURE_QMS: dict[str, list[dict[str, str]]] = {
    "humidity": [
        {"doc_id": "QMS-GUD-001", "title": "습도 트러블슈팅", "process": "humidity"},
        {"doc_id": "QMS-ACT-003", "title": "드라이룸 점검", "process": "humidity"},
    ],
    "d50": [{"doc_id": "QMS-GUD-005", "title": "입도 트러블슈팅", "process": "particle_size"}],
    "d90": [{"doc_id": "QMS-GUD-005", "title": "입도 트러블슈팅", "process": "particle_size"}],
    "sintering_temp": [
        {"doc_id": "QMS-GUD-002", "title": "소성온도 트러블슈팅", "process": "sintering"},
        {"doc_id": "QMS-ACT-001", "title": "소성로 점검", "process": "sintering"},
    ],
    "temp_dev_from_800": [
        {"doc_id": "QMS-GUD-002", "title": "소성온도 트러블슈팅", "process": "sintering"},
        {"doc_id": "QMS-ACT-001", "title": "소성로 점검", "process": "sintering"},
    ],
    "lithium_input": [
        {"doc_id": "QMS-GUD-004", "title": "잔류리튬 트러블슈팅", "process": "lithium_input"},
        {"doc_id": "QMS-ACT-002", "title": "배합비 재검토", "process": "lithium_input"},
    ],
    "metal_impurity": [
        {"doc_id": "QMS-GUD-003", "title": "금속이물 트러블슈팅", "process": "metal_impurity"},
    ],
    "process_time": [
        {"doc_id": "QMS-SOP-002", "title": "공정시간 SOP", "process": "sintering"},
    ],
}

STABLE_SUMMARY = (
    "위험 신호가 기준 범위 내입니다. STD-001에 따라 표준 샘플링·일상 모니터링을 유지합니다."
)
STABLE_STEPS = [
    {"order": 1, "text": "표준 샘플링(검사 수준 3) 유지", "doc_id": "QMS-RULE-003"},
    {"order": 2, "text": "공정·SPC 일상 모니터링 지속", "doc_id": "QMS-STD-001"},
]
STABLE_SOURCES = [
    {
        "doc_id": "QMS-STD-001",
        "title": "공정 흐름 및 검사 시점 기준",
        "path": "Confidential/qms-source/QMS-STD-001_공정흐름및검사시점기준.docx",
    },
    {
        "doc_id": "QMS-RULE-003",
        "title": "검사 방안",
        "path": "Confidential/qms-source/QMS-RULE-003_검사수준운영규정.docx",
    },
]

SYSTEM_COMPOSE = """당신은 양극재 LOT 조치 권고 작성기입니다.
제공된 drivers JSON과 QMS 발췌만 근거로 JSON만 출력합니다.
형식:
{"summary":"한두 문장","steps":[{"order":1,"text":"...","doc_id":"QMS-..."}]}
규칙:
1. summary는 자연스러운 한국어 문장. 각 원인에 방향어(상승·변동·과다 등)+측정값+근거를 괄호로 포함.
2. steps는 2~5개 번호 조치. doc_id는 제공 QMS id만 사용.
3. 수치·doc_id를 지어내지 않음. 마크다운·코드펜스 없이 JSON만."""


def _resolve_doc_path(doc_id: str, title: str) -> str:
    slug_map = {
        "QMS-GUD-001": "QMS-GUD-001_습도트러블슈팅.docx",
        "QMS-GUD-002": "QMS-GUD-002_소성온도트러블슈팅.docx",
        "QMS-GUD-003": "QMS-GUD-003_금속이물트러블슈팅.docx",
        "QMS-GUD-004": "QMS-GUD-004_잔류리튬트러블슈팅.docx",
        "QMS-GUD-005": "QMS-GUD-005_입도트러블슈팅.docx",
        "QMS-ACT-001": "QMS-ACT-001_소성로점검절차.docx",
        "QMS-ACT-002": "QMS-ACT-002_배합비재검토절차.docx",
        "QMS-ACT-003": "QMS-ACT-003_드라이룸점검절차.docx",
        "QMS-ACT-005": "QMS-ACT-005_전수검사운영절차.docx",
        "QMS-MAN-001": "QMS-MAN-001_SPC운영매뉴얼.docx",
        "QMS-RULE-003": "QMS-RULE-003_검사수준운영규정.docx",
        "QMS-STD-001": "QMS-STD-001_공정흐름및검사시점기준.docx",
        "QMS-SOP-002": "QMS-SOP-002_공정시간관리SOP.docx",
    }
    fname = slug_map.get(doc_id, f"{doc_id}_{title}.docx")
    return f"Confidential/qms-source/{fname}"


def _cause_clause(c: dict[str, Any]) -> str:
    label = str(c.get("labelKo") or c.get("feature") or "")
    direction = str(c.get("directionKo") or "변동")
    value_text = str(c.get("valueText") or c.get("value") or "")
    ref_label = c.get("refLabel")
    ref_bit = ""
    if ref_label:
        if direction in ("상승", "과다", "연장", "초과"):
            ref_bit = f", {ref_label} 초과"
        elif direction in ("하락", "단축"):
            ref_bit = f", {ref_label} 미만"
        else:
            ref_bit = f", {ref_label} 대비"
    return f"{label} {direction}({value_text}{ref_bit})"


def _rule_summary(
    drivers: dict[str, Any],
    *,
    probability: float | None,
    residual_li: float | None,
    risk_level: str | None,
) -> str:
    defect = drivers.get("defect_causes") or []
    residual = drivers.get("residual_causes") or []

    prob_pct = f"{probability * 100:.2f}%" if probability is not None else "높은"
    res_txt = f"{residual_li:.2f} ppm" if residual_li is not None else "상향"

    para1 = (
        f"{'과 '.join(_cause_clause(c) for c in defect[:2])}이(가) 불량확률 {prob_pct}에 주요 영향을 미치고 있습니다."
        if defect
        else f"불량확률에 영향을 미치고 있는 주요 인자를 확인하세요. (불량확률 {prob_pct})"
    )
    if residual:
        para2 = (
            f"잔류리튬 예측 {res_txt}에 {'과 '.join(_cause_clause(c) for c in residual[:2])}이(가) 주요 영향을 미치고 있습니다."
        )
    else:
        para2 = ""

    out = f"{para1}\n\n{para2}".strip()[:1024]
    return out


def _rule_steps(drivers: dict[str, Any], spc_status: str | None) -> list[dict[str, Any]]:
    seen: set[str] = set()
    steps: list[dict[str, Any]] = []
    order = 1
    for bucket in (drivers.get("defect_causes") or [], drivers.get("residual_causes") or []):
        for c in bucket:
            feat = str(c.get("feature") or "")
            for doc in FEATURE_QMS.get(feat, []):
                did = doc["doc_id"]
                if did in seen:
                    continue
                seen.add(did)
                steps.append(
                    {
                        "order": order,
                        "text": f"{doc['title']} 절차에 따라 점검·개선",
                        "doc_id": did,
                    }
                )
                order += 1
    if spc_status and spc_status not in ("안정", "-", ""):
        for did, title in [("QMS-MAN-001", "SPC 운영"), ("QMS-ACT-005", "전수검사 운영")]:
            if did not in seen:
                seen.add(did)
                steps.append({"order": order, "text": f"{title} 기준 재확인", "doc_id": did})
                order += 1
    return steps[:6]


def _sources_from_steps(steps: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for s in steps:
        did = str(s.get("doc_id") or "")
        if not did or did in seen:
            continue
        seen.add(did)
        title = did
        for mapping in FEATURE_QMS.values():
            for m in mapping:
                if m["doc_id"] == did:
                    title = m["title"]
                    break
        out.append(
            {
                "doc_id": did,
                "title": title,
                "path": _resolve_doc_path(did, title),
            }
        )
    return out


def stable_template() -> dict[str, Any]:
    return {
        "summary": STABLE_SUMMARY,
        "steps": STABLE_STEPS,
        "sources": STABLE_SOURCES,
        "drivers_json": {"defect_causes": [], "residual_causes": []},
    }


def _qdrant_reachable(timeout_s: float = 0.5) -> bool:
    try:
        import socket
        from urllib.parse import urlparse

        from agent.rag_engine import qdrant_url

        parsed = urlparse(qdrant_url())
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 6333
        with socket.create_connection((host, port), timeout=timeout_s):
            return True
    except OSError:
        return False


def _rag_snippets(query: str) -> str:
    if not _qdrant_reachable():
        return ""
    try:
        from agent.rag_engine import SecureRagEngine

        engine = SecureRagEngine()
        hits = engine.retrieve(
            query,
            top_k=8,
            rerank_top_n=4,
            filters={"tier": "A", "use_for": "lot_action"},
        )
        parts = []
        for h in hits[:4]:
            md = h.get("metadata") or {}
            doc_id = md.get("doc_id") or md.get("source") or ""
            text = str(h.get("text") or "")[:400]
            if text.strip():
                parts.append(f"[{doc_id}] {text}")
        return "\n---\n".join(parts)
    except Exception:
        return ""


def _try_vllm_compose(payload: dict[str, Any], rag_text: str) -> dict[str, Any] | None:
    try:
        llm = make_vllm(max_tokens=512)
        user = (
            "다음 LOT drivers와 QMS 발췌로 summary+steps JSON을 작성하세요.\n"
            f"drivers={json.dumps(payload.get('drivers', {}), ensure_ascii=False)}\n"
            f"risk_level={payload.get('risk_level')}\n"
            f"probability={payload.get('probability')}\n"
            f"residual_li={payload.get('residual_li')}\n"
            f"spc_status={payload.get('spc_status')}\n"
            f"QMS:\n{rag_text or '(없음)'}"
        )
        out = llm.invoke(
            [SystemMessage(content=SYSTEM_COMPOSE), HumanMessage(content=user)]
        )
        text = usable_llm_text(out.content)
        if not text:
            return None
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            return None
        parsed = json.loads(m.group(0))
        if not parsed.get("summary") or not parsed.get("steps"):
            return None
        return parsed
    except Exception:
        return None


def compose_lot_recommended_action(body: dict[str, Any]) -> dict[str, Any]:
    risk_level = (body.get("risk_level") or "").strip()
    if risk_level == "안정":
        stable = stable_template()
        return {**stable, "status": "ready", "error": None}

    drivers = body.get("drivers_json") or body.get("drivers") or {}
    probability = body.get("probability")
    residual_li = body.get("residual_li")
    spc_status = body.get("spc_status")

    query_parts = []
    for c in (drivers.get("defect_causes") or [])[:3]:
        query_parts.append(f"{c.get('labelKo')} {c.get('valueText')}")
    for c in (drivers.get("residual_causes") or [])[:2]:
        query_parts.append(f"잔류리튬 {c.get('labelKo')}")
    if spc_status:
        query_parts.append(f"SPC {spc_status}")
    # 안정적인 UI 규격(문장/소수점/단락) 때문에 요약은 규칙 기반으로만 생성합니다.
    # steps는 QMS doc mapping 기반으로 규칙 생성합니다.
    steps = _rule_steps(drivers, spc_status)
    return {
        "summary": _rule_summary(
            drivers,
            probability=probability,
            residual_li=residual_li,
            risk_level=risk_level,
        ),
        "steps": steps,
        "sources": _sources_from_steps(steps),
        "drivers_json": drivers,
        "status": "ready",
        "error": None,
    }
