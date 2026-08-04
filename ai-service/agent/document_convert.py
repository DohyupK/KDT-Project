"""
Convert Documents/<Clearance>/* unstructured sources → Documents/<Clearance>/Markdown/*.md.

CSV/XLSX are NOT converted here — see agent.csv_profile (dual-engine data lake).
Does not perform OCR (images excluded in v1).
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from agent.doc_clearance import (
    CLEARANCES,
    clearance_from_path,
    clearance_root_for,
    is_under_any_markdown,
    markdown_dir,
)

logger = logging.getLogger(__name__)

CONVERT_SUFFIXES = {".pdf", ".txt"}


def converted_docs_dir(clearance_root: Path) -> Path:
    """Markdown output folder for one clearance root."""
    return markdown_dir(clearance_root)


def _safe_stem(path: Path) -> str:
    stem = re.sub(r"[^\w\-가-힣]+", "-", path.stem, flags=re.UNICODE).strip("-")
    return stem or "doc"


def _frontmatter(
    *,
    doc_id: str,
    title: str,
    source_path: str,
    converted_from: str,
    clearance: str,
) -> str:
    return (
        "---\n"
        f"doc_id: {doc_id}\n"
        f"title: {title}\n"
        f"category: converted\n"
        f"source_path: {source_path}\n"
        f"converted_from: {converted_from}\n"
        f"clearance: {clearance}\n"
        "security_level: internal\n"
        "---\n\n"
    )


def _read_txt(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8", "utf-8-sig", "cp949", "euc-kr", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _read_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception as exc:  # noqa: BLE001
            logger.warning("pdf page %s: %s", path.name, exc)
            continue
        if t.strip():
            parts.append(t)
    return "\n\n".join(parts).strip()


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return _read_txt(path).strip()
    if suffix == ".pdf":
        return _read_pdf(path)
    raise ValueError(f"unsupported convert type: {suffix}")


def convert_file_to_md(
    path: Path,
    *,
    secure_docs_dir: Path,
    repo_root: Path | None = None,
) -> Path | None:
    """
    Write Documents/<Clearance>/Markdown/<stem>.md. Returns output path or None.
    """
    if not path.is_file():
        return None
    suffix = path.suffix.lower()
    if suffix not in CONVERT_SUFFIXES:
        return None
    if is_under_any_markdown(path, secure_docs_dir):
        return None
    clearance = clearance_from_path(path, secure_docs_dir)
    if not clearance:
        logger.info("[document_convert] skip outside clearance tree: %s", path)
        return None
    if path.name.startswith(".") or path.name.upper().startswith("README"):
        return None

    try:
        body = extract_text(path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[document_convert] extract fail %s: %s", path.name, exc)
        return None
    if not (body or "").strip():
        logger.info("[document_convert] empty text skip %s", path.name)
        return None

    c_root = clearance_root_for(path, secure_docs_dir)
    assert c_root is not None
    out_dir = converted_docs_dir(c_root)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = _safe_stem(path)
    out_path = out_dir / f"{stem}.md"
    root = repo_root or secure_docs_dir.parent
    try:
        rel = str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        rel = str(path).replace("\\", "/")
    title = path.stem
    doc_id = f"converted-{stem}"
    md = (
        _frontmatter(
            doc_id=doc_id,
            title=title,
            source_path=rel,
            converted_from=suffix.lstrip("."),
            clearance=clearance,
        )
        + body.strip()
        + "\n"
    )
    out_path.write_text(md, encoding="utf-8")
    logger.info("[document_convert] wrote %s ← %s [%s]", out_path.name, path.name, clearance)
    return out_path


def convert_all_under(
    secure_docs_dir: Path, *, repo_root: Path | None = None
) -> list[Path]:
    """Convert every eligible source under each Documents/<Clearance>/."""
    if not secure_docs_dir.is_dir():
        return []
    out: list[Path] = []
    for c in CLEARANCES:
        c_root = secure_docs_dir / c
        if not c_root.is_dir():
            continue
        skip_root = converted_docs_dir(c_root)
        for path in sorted(c_root.rglob("*")):
            if not path.is_file():
                continue
            try:
                path.relative_to(skip_root)
                continue
            except ValueError:
                pass
            if path.suffix.lower() not in CONVERT_SUFFIXES:
                continue
            written = convert_file_to_md(
                path, secure_docs_dir=secure_docs_dir, repo_root=repo_root
            )
            if written is not None:
                out.append(written)
    return out
