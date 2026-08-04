"""
Secure-chat Stage-2: Polars aggregates over ai-service/data/csv_lake/.

No mock CSV. Empty lake or column-match failure → fallback_to_rag=True
(caller continues to node_retrieve). Does not touch fillThreshold / SECURE_GENERATE.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

EMPTY_LAKE_INTERNAL = "empty_csv_lake"
COLUMN_MISS_INTERNAL = "column_match_failed"
PREDICT_UNAVAILABLE_NOTICE = (
    "현재 예측 모델이 준비되지 않아 통계 결과만 반환합니다."
)

_NUMERIC_COL_HINT = re.compile(
    r"(불량|defect|fail|yield|rate|평균|mean|temp|온도|습도|humid|count|qty|수량|값|value)",
    re.IGNORECASE,
)


def _ai_root() -> Path:
    return Path(__file__).resolve().parent.parent


def csv_lake_dir() -> Path:
    return _ai_root() / "data" / "csv_lake"


def xgb_model_path() -> Path:
    return _ai_root() / "models" / "xgb_model.json"


def list_lake_csv_files() -> list[Path]:
    lake = csv_lake_dir()
    if not lake.is_dir():
        return []
    return sorted(p for p in lake.rglob("*.csv") if p.is_file())


def _pick_numeric_columns(columns: list[str]) -> list[str]:
    return [c for c in columns if _NUMERIC_COL_HINT.search(c)]


def _summarize_csv(path: Path, message: str) -> str:
    import polars as pl

    lf = pl.scan_csv(str(path), infer_schema_length=5000)
    schema_names = list(lf.collect_schema().names())
    cols = _pick_numeric_columns(schema_names)
    if not cols:
        sample = lf.head(50).collect()
        cols = [
            c
            for c, dt in zip(sample.columns, sample.dtypes)
            if getattr(dt, "is_numeric", lambda: False)()
        ][:6]
    if not cols:
        raise ValueError(COLUMN_MISS_INTERNAL)

    aggs = []
    for c in cols[:8]:
        aggs.append(pl.col(c).mean().alias(f"{c}__mean"))
        aggs.append(pl.col(c).count().alias(f"{c}__count"))
    out = lf.select(aggs).collect()
    lines = [f"파일: {path.name}", f"질문키워드반영: {(message or '')[:80]}"]
    row = out.to_dicts()[0] if out.height else {}
    for k, v in row.items():
        lines.append(f"- {k}: {v}")
    return "\n".join(lines)


def _try_xgb_predict_note(message: str, analytics_body: str) -> str:
    """Append predict notice on predict intent; never raises to caller."""
    from agent.secure_prompts import is_predict_intent

    if not is_predict_intent(message):
        return analytics_body
    model_path = xgb_model_path()
    if not model_path.is_file():
        return analytics_body + "\n\n" + PREDICT_UNAVAILABLE_NOTICE
    try:
        import numpy as np
        import xgboost as xgb

        booster = xgb.Booster()
        booster.load_model(str(model_path))
        n_feat = 8
        try:
            nf = booster.num_features()
            if isinstance(nf, int) and nf > 0:
                n_feat = nf
        except Exception:  # noqa: BLE001
            pass
        dmat = xgb.DMatrix(np.zeros((1, n_feat), dtype=float))
        _ = booster.predict(dmat)
        return (
            analytics_body
            + "\n\n"
            + PREDICT_UNAVAILABLE_NOTICE
            + " (모델은 로드되었으나 입력 피처 스키마를 안전하게 구성할 수 없음)"
        )
    except Exception as exc:  # noqa: BLE001
        logger.info("[analytics] xgb predict skipped: %s", str(exc)[:200])
        return analytics_body + "\n\n" + PREDICT_UNAVAILABLE_NOTICE


def run_analytics(message: str) -> dict[str, Any]:
    """
    Returns:
      fallback_to_rag: True → caller must run node_retrieve (no error reply to user)
      analytics_text / sources on success
    """
    files = list_lake_csv_files()
    if not files:
        logger.info("[analytics] fallback_to_rag reason=%s", EMPTY_LAKE_INTERNAL)
        return {
            "fallback_to_rag": True,
            "analytics_text": None,
            "sources": [],
            "error": EMPTY_LAKE_INTERNAL,
        }

    chunks: list[str] = []
    any_ok = False
    for path in files:
        try:
            chunks.append(_summarize_csv(path, message))
            any_ok = True
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "[analytics] file skip %s: %s", path.name, str(exc)[:160]
            )
            continue

    if not any_ok:
        logger.info("[analytics] fallback_to_rag reason=%s", COLUMN_MISS_INTERNAL)
        return {
            "fallback_to_rag": True,
            "analytics_text": None,
            "sources": [],
            "error": COLUMN_MISS_INTERNAL,
        }

    body = "\n\n".join(chunks)
    body = _try_xgb_predict_note(message, body)
    sources = [
        {
            "doc_id": "csv_lake",
            "title": "사내 CSV 데이터",
            "category": "analytics",
            "process": None,
            "source_path": str(csv_lake_dir()),
            "chunk_index": 0,
            "text": body[:500],
        }
    ]
    return {
        "fallback_to_rag": False,
        "analytics_text": body,
        "sources": sources,
        "error": None,
    }
