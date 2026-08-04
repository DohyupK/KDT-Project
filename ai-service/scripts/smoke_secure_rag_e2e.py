"""
API E2E smoke for secure RAG (sources passthrough).

Does NOT drive a browser. Citation panel data path == API `sources[]`.

Usage (ai-service CWD, Qdrant up, models ingested):
  python scripts/smoke_secure_rag_e2e.py

Optional:
  SMOKE_AI_URL=http://127.0.0.1:8800
  SMOKE_BACKEND_URL=http://127.0.0.1:3001   # also hit Express proxy
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from dotenv import load_dotenv

load_dotenv(AI_ROOT.parent / ".env", override=False)

AI_URL = (os.environ.get("SMOKE_AI_URL") or "http://127.0.0.1:8800").rstrip("/")
BACKEND_URL = (os.environ.get("SMOKE_BACKEND_URL") or "").rstrip("/")
# Align with FE/BE security-chat 180s budget.
POST_TIMEOUT = float(os.environ.get("SMOKE_POST_TIMEOUT", "180"))


def _post_json(url: str, body: dict, timeout: float = POST_TIMEOUT) -> tuple[int, dict, float]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8")
            elapsed = time.perf_counter() - t0
            return int(res.status), (json.loads(raw) if raw else {}), elapsed
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        elapsed = time.perf_counter() - t0
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"error": raw[:300]}
        return int(e.code), payload, elapsed
    except Exception as exc:  # noqa: BLE001
        elapsed = time.perf_counter() - t0
        return 0, {"error": str(exc)}, elapsed


def _check_hit(
    label: str,
    payload: dict,
    *,
    expect_doc_id: str | None = None,
) -> list[str]:
    errs: list[str] = []
    mode = payload.get("mode")
    sources = payload.get("sources") or []
    reply = payload.get("reply") or ""
    if mode != "security_rag":
        errs.append(f"{label}: expected mode=security_rag got {mode!r}")
        if mode == "template" or payload.get("provider") == "offline":
            errs.append(
                f"{label}: offline - is vLLM/Qdrant/RAG ready? "
                f"error={payload.get('error')}"
            )
            if sources and "문서에서는 관련 내용을 찾았지만" in reply:
                errs.append(
                    f"{label}: RAG hit but LLM timed out "
                    f"(n_sources={len(sources)})"
                )
        return errs
    if not sources:
        errs.append(f"{label}: expected sources>=1")
    else:
        text = (sources[0] or {}).get("text") or ""
        title = (sources[0] or {}).get("title") or ""
        doc_id = (sources[0] or {}).get("doc_id") or ""
        if not str(text).strip():
            errs.append(f"{label}: sources[0].text empty")
        if not str(title).strip():
            errs.append(f"{label}: sources[0].title empty")
        if expect_doc_id and doc_id != expect_doc_id:
            errs.append(
                f"{label}: expected doc_id={expect_doc_id!r} got {doc_id!r}"
            )
    if "[출처:" not in reply:
        errs.append(f"{label}: reply missing [출처:")
    return errs


def _check_no_docs(label: str, payload: dict) -> list[str]:
    errs: list[str] = []
    mode = payload.get("mode")
    sources = payload.get("sources") or []
    reply = payload.get("reply") or ""
    if mode == "template" and payload.get("provider") == "offline":
        errs.append(
            f"{label}: vLLM/Qdrant offline (mode=template). "
            f"error={payload.get('error')}"
        )
        return errs
    if mode != "security_no_docs":
        errs.append(f"{label}: expected mode=security_no_docs got {mode!r}")
    if sources:
        errs.append(f"{label}: expected empty sources, got {len(sources)}")
    if "사내 보안 문서에서 관련 정보를 찾을 수 없습니다" not in reply:
        errs.append(f"{label}: expected fixed no-docs reply")
    return errs


def main() -> int:
    wall0 = time.perf_counter()
    print(f"AI_URL={AI_URL} POST_TIMEOUT={POST_TIMEOUT}s FE_BUDGET_REF=180s")
    # health
    try:
        with urllib.request.urlopen(f"{AI_URL}/health", timeout=5) as res:
            health = json.loads(res.read().decode("utf-8"))
        print("health", health.get("status"), "ready", health.get("registry_ready"))
    except Exception as exc:  # noqa: BLE001
        print("FAIL: ai-service not reachable:", exc)
        return 2

    # vLLM preflight (OpenAI-compatible). No fake pass if down.
    from agent.secure_llm import vllm_base_url, vllm_model

    vllm_models = f"{vllm_base_url()}/models"
    try:
        with urllib.request.urlopen(vllm_models, timeout=5) as res:
            models_payload = json.loads(res.read().decode("utf-8"))
        print("vLLM ok", vllm_base_url(), "model_env", vllm_model())
        ids = [m.get("id") for m in (models_payload.get("data") or [])]
        if ids:
            print("vLLM served ids:", ids[:5])
    except Exception as exc:  # noqa: BLE001
        print("SMOKE_FAIL")
        print(
            " - vLLM not reachable at",
            vllm_models,
            "-",
            str(exc).encode("ascii", "replace").decode("ascii"),
        )
        print(" - Start vLLM on :8001 then re-run. See docs/references/vllm-setup.md")
        print(" - Do not treat this as a pass.")
        return 3

    q_hit = "양극재 소성공정 SOP 온도 기준이 뭐야?"
    q_coat = "전극 슬러리 코팅 방법을 알려줘"
    q_miss = "오늘 점심 메뉴 추천해줘"

    status, hit, t_hit = _post_json(f"{AI_URL}/security-chat", {"message": q_hit})
    print(
        "HIT status",
        status,
        "mode",
        hit.get("mode"),
        "n_sources",
        len(hit.get("sources") or []),
        f"sec={t_hit:.1f}",
    )
    status_c, coat, t_coat = _post_json(
        f"{AI_URL}/security-chat", {"message": q_coat}
    )
    print(
        "COAT status",
        status_c,
        "mode",
        coat.get("mode"),
        "n_sources",
        len(coat.get("sources") or []),
        "doc0",
        ((coat.get("sources") or [{}])[0] or {}).get("doc_id"),
        f"sec={t_coat:.1f}",
    )
    status2, miss, t_miss = _post_json(
        f"{AI_URL}/security-chat", {"message": q_miss}
    )
    print(
        "MISS status",
        status2,
        "mode",
        miss.get("mode"),
        "n_sources",
        len(miss.get("sources") or []),
        f"sec={t_miss:.1f}",
    )

    errs = []
    if status != 200:
        errs.append(f"HIT HTTP {status} {hit.get('error')}")
    else:
        errs.extend(_check_hit("ai/HIT", hit))
    if status_c != 200:
        errs.append(f"COAT HTTP {status_c} {coat.get('error')}")
    else:
        errs.extend(
            _check_hit("ai/COAT", coat, expect_doc_id="sop-coating-v1")
        )
    if status2 != 200:
        errs.append(f"MISS HTTP {status2} {miss.get('error')}")
    else:
        errs.extend(_check_no_docs("ai/MISS", miss))

    if BACKEND_URL:
        print(f"BACKEND_URL={BACKEND_URL}")
        bs, bhit, t_be = _post_json(
            f"{BACKEND_URL}/api/security-chat", {"message": q_hit}
        )
        print(
            "BE HIT",
            bs,
            "mode",
            bhit.get("mode"),
            "n",
            len(bhit.get("sources") or []),
            f"sec={t_be:.1f}",
        )
        if bs != 200:
            errs.append(f"backend HIT HTTP {bs}")
        else:
            errs.extend(_check_hit("be/HIT", bhit))

    wall = time.perf_counter() - wall0
    print("---")
    print(f"wall_clock_sec={wall:.1f} (FE axios budget 180s)")
    print("Manual browser checklist (Maximize overlay):")
    print("  1) GlobalChatbot Maximize -> SecurityChatbot fullscreen")
    print("  2) Ask SOP question -> reply shows [출처:] link")
    print("  3) Click source -> chunk panel shows same text as sources[].text")

    if errs:
        print("SMOKE_FAIL")
        for e in errs:
            print(" -", str(e).encode("ascii", "replace").decode("ascii"))
        return 1
    print("SMOKE_PASS")
    if hit.get("sources"):
        s0 = hit["sources"][0]
        print(
            "sample_source",
            json.dumps(
                {
                    "title": s0.get("title"),
                    "doc_id": s0.get("doc_id"),
                    "text_len": len(s0.get("text") or ""),
                },
                ensure_ascii=True,
            ),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
