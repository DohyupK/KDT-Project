"""
Convert Documents/<Clearance>/* → Markdown sidecar only when native text is empty.

Policy:
- Native text sufficient (txt / text PDF) → do NOT write matching .md; remove stale converted md.
- Empty native text (scan PDF / images) → OCR (Tesseract) → Markdown/<stem>.md + TEXT_MATCH.
- CSV/XLSX are NOT converted here — see agent.csv_profile.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from agent.doc_clearance import (
    CLEARANCES,
    clearance_from_path,
    clearance_root_for,
    is_under_any_markdown,
    markdown_dir,
)

logger = logging.getLogger(__name__)

NATIVE_SUFFIXES = {".pdf", ".txt"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".gif"}
CONVERT_SUFFIXES = NATIVE_SUFFIXES | IMAGE_SUFFIXES

# Strip length at/above this → treat as extractable (no OCR md).
MIN_NATIVE_CHARS = 40


@dataclass
class ConvertResult:
    """Watcher uses needs_ingest; md_path set only when OCR sidecar written."""

    kind: str  # native | ocr_md | skipped | failed
    path: Path
    md_path: Path | None = None
    needs_ingest: bool = False
    detail: str = ""


def converted_docs_dir(clearance_root: Path) -> Path:
    """Markdown output folder for one clearance root."""
    return markdown_dir(clearance_root)


def _safe_stem(path: Path) -> str:
    stem = re.sub(r"[^\w\-가-힣]+", "-", path.stem, flags=re.UNICODE).strip("-")
    return stem or "doc"


def _repo_rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def _sha1_file(path: Path) -> str | None:
    try:
        h = hashlib.sha1()
        with path.open("rb") as f:
            while True:
                chunk = f.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def _frontmatter(
    *,
    doc_id: str,
    title: str,
    source_path: str,
    converted_from: str,
    clearance: str,
    extract_method: str,
) -> str:
    return (
        "---\n"
        f"doc_id: {doc_id}\n"
        f"title: {title}\n"
        f"category: converted\n"
        f"source_path: {source_path}\n"
        f"converted_from: {converted_from}\n"
        f"extract_method: {extract_method}\n"
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


def _read_pdf_native(path: Path) -> str:
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


def extract_native_text(path: Path) -> str:
    """
    Pull embedded/plain text only (no OCR). Images always return "".
    Co-located with convert logic for has_extractable_text checks.
    """
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return _read_txt(path).strip()
    if suffix == ".pdf":
        return _read_pdf_native(path)
    if suffix in IMAGE_SUFFIXES:
        return ""
    raise ValueError(f"unsupported convert type: {suffix}")


def has_extractable_text(path: Path, *, min_chars: int = MIN_NATIVE_CHARS) -> bool:
    """True when native scrape yields enough text (skip OCR md matching)."""
    try:
        body = extract_native_text(path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[document_convert] native extract fail %s: %s", path.name, exc)
        return False
    return len((body or "").strip()) >= min_chars


# Back-compat alias used by older callers / ingest notes
def extract_text(path: Path) -> str:
    return extract_native_text(path)


_TESS_CONFIGURED = False


def _ocr_langs() -> list[str]:
    """Prefer kor+eng; fall back to eng if Korean pack missing."""
    return ["kor+eng", "eng"]


def _configure_tesseract() -> None:
    """Point pytesseract at Windows install; clear bad TESSDATA_PREFIX."""
    global _TESS_CONFIGURED
    if _TESS_CONFIGURED:
        return
    import os
    import pytesseract

    cmd = (os.environ.get("TESSERACT_CMD") or "").strip()
    if not cmd:
        for cand in (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ):
            if Path(cand).is_file():
                cmd = cand
                break
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
    # Prefer explicit --tessdata-dir; a wrong PREFIX breaks lang loading.
    os.environ.pop("TESSDATA_PREFIX", None)
    _TESS_CONFIGURED = True


def _tessdata_dir() -> Path | None:
    import os

    local_root = Path(os.environ.get("LOCALAPPDATA", "")) / "tesseract-tessdata"
    nested = local_root / "tessdata"
    if (nested / "eng.traineddata").is_file():
        return nested
    if (local_root / "eng.traineddata").is_file():
        return local_root
    prog = Path(r"C:\Program Files\Tesseract-OCR\tessdata")
    if (prog / "eng.traineddata").is_file():
        return prog
    return None


def _image_to_string(img, *, lang: str) -> str:
    import pytesseract

    _configure_tesseract()
    tessdir = _tessdata_dir()
    if tessdir is not None:
        # No quotes — Windows tesseract concatenates PREFIX oddly with quoted paths.
        cfg = f"--tessdata-dir {tessdir.as_posix()}"
        return (pytesseract.image_to_string(img, lang=lang, config=cfg) or "").strip()
    return (pytesseract.image_to_string(img, lang=lang) or "").strip()


def _ocr_image(path: Path) -> str:
    from PIL import Image

    with Image.open(path) as img:
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        last_exc: Exception | None = None
        for lang in _ocr_langs():
            try:
                return _image_to_string(img, lang=lang)
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                logger.warning("[document_convert] OCR lang=%s fail: %s", lang, exc)
        if last_exc:
            raise last_exc
        return ""


def _ocr_pdf(path: Path, *, max_pages: int = 30) -> str:
    """OCR embedded page images via pypdf (no rasterizer)."""
    from io import BytesIO

    from PIL import Image
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts: list[str] = []
    for i, page in enumerate(reader.pages):
        if i >= max_pages:
            logger.info("[document_convert] OCR pdf page cap %s @%s", max_pages, path.name)
            break
        images = getattr(page, "images", None) or []
        if not images:
            continue
        for img_file in images:
            try:
                with Image.open(BytesIO(img_file.data)) as img:
                    if img.mode not in ("RGB", "L"):
                        img = img.convert("RGB")
                    t = ""
                    for lang in _ocr_langs():
                        try:
                            t = _image_to_string(img, lang=lang)
                            break
                        except Exception as exc:  # noqa: BLE001
                            logger.warning(
                                "[document_convert] OCR pdf embed lang=%s: %s", lang, exc
                            )
                    if t:
                        parts.append(t)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[document_convert] OCR pdf embed %s: %s", path.name, exc)
    return "\n\n".join(parts).strip()


def ocr_extract(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in IMAGE_SUFFIXES:
        return _ocr_image(path)
    if suffix == ".pdf":
        try:
            import fitz  # pymupdf
            from io import BytesIO

            from PIL import Image

            parts: list[str] = []
            doc = fitz.open(str(path))
            try:
                for page_index in range(min(len(doc), 30)):
                    page = doc[page_index]
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    img = Image.open(BytesIO(pix.tobytes("png")))
                    t = ""
                    for lang in _ocr_langs():
                        try:
                            t = _image_to_string(img, lang=lang)
                            break
                        except Exception as exc:  # noqa: BLE001
                            logger.warning(
                                "[document_convert] OCR fitz lang=%s: %s", lang, exc
                            )
                    if t:
                        parts.append(t)
            finally:
                doc.close()
            return "\n\n".join(parts).strip()
        except ImportError:
            return _ocr_pdf(path)
    raise ValueError(f"OCR unsupported for {suffix}")


def paired_md_path(path: Path, secure_docs_dir: Path) -> Path | None:
    c_root = clearance_root_for(path, secure_docs_dir)
    if c_root is None:
        return None
    return converted_docs_dir(c_root) / f"{_safe_stem(path)}.md"


def _remove_stale_converted_md(
    path: Path,
    *,
    secure_docs_dir: Path,
    repo_root: Path,
) -> Path | None:
    """Delete converted sidecar + TEXT_MATCH when native text makes md unnecessary."""
    md = paired_md_path(path, secure_docs_dir)
    removed = None
    if md is not None and md.is_file():
        # Only remove if it looks like a converted sidecar
        try:
            head = md.read_text(encoding="utf-8", errors="replace")[:800]
        except OSError:
            head = ""
        if "category: converted" in head or "converted_from:" in head:
            try:
                md.unlink()
                removed = md
                logger.info("[document_convert] removed stale converted md %s", md.name)
            except OSError as exc:
                logger.warning("[document_convert] unlink md fail %s: %s", md, exc)
    try:
        from agent import text_match_store

        text_match_store.delete_by_source(_repo_rel(path, repo_root))
    except Exception as exc:  # noqa: BLE001
        logger.warning("[document_convert] text_match delete: %s", exc)
    return removed


def convert_file_to_md(
    path: Path,
    *,
    secure_docs_dir: Path,
    repo_root: Path | None = None,
) -> ConvertResult:
    """
    Apply native-vs-OCR policy. Returns ConvertResult.
    Watcher should ingest when result.needs_ingest is True.
    """
    if not path.is_file():
        return ConvertResult(kind="skipped", path=path, detail="not a file")
    suffix = path.suffix.lower()
    if suffix not in CONVERT_SUFFIXES:
        return ConvertResult(kind="skipped", path=path, detail="suffix")
    if is_under_any_markdown(path, secure_docs_dir):
        return ConvertResult(kind="skipped", path=path, detail="under Markdown/")
    clearance = clearance_from_path(path, secure_docs_dir)
    if not clearance:
        logger.info("[document_convert] skip outside clearance tree: %s", path)
        return ConvertResult(kind="skipped", path=path, detail="outside clearance")
    if path.name.startswith(".") or path.name.upper().startswith("README"):
        return ConvertResult(kind="skipped", path=path, detail="readme/dotfile")

    root = repo_root or secure_docs_dir.parent
    source_rel = _repo_rel(path, root)

    # Empty txt: never OCR
    if suffix == ".txt":
        try:
            native = extract_native_text(path)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[document_convert] txt read fail %s: %s", path.name, exc)
            return ConvertResult(kind="failed", path=path, detail=str(exc))
        if len(native.strip()) >= MIN_NATIVE_CHARS:
            _remove_stale_converted_md(path, secure_docs_dir=secure_docs_dir, repo_root=root)
            return ConvertResult(
                kind="native", path=path, needs_ingest=True, detail="txt native"
            )
        logger.info("[document_convert] empty txt skip %s", path.name)
        _remove_stale_converted_md(path, secure_docs_dir=secure_docs_dir, repo_root=root)
        return ConvertResult(kind="skipped", path=path, detail="empty txt")

    # PDF / images: native first
    native_ok = False
    if suffix == ".pdf":
        native_ok = has_extractable_text(path)
    # images: native_ok stays False

    if native_ok:
        _remove_stale_converted_md(path, secure_docs_dir=secure_docs_dir, repo_root=root)
        return ConvertResult(
            kind="native", path=path, needs_ingest=True, detail="native text"
        )

    # OCR path
    intended_md = paired_md_path(path, secure_docs_dir)
    intended_rel = _repo_rel(intended_md, root) if intended_md else ""

    try:
        body = ocr_extract(path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[document_convert] OCR fail %s: %s", path.name, exc)
        try:
            from agent import text_match_store

            text_match_store.upsert(
                source_path=source_rel,
                md_path=intended_rel or source_rel + ".md",
                clearance=clearance,
                source_ext=suffix.lstrip("."),
                extract_method="ocr",
                source_sha1=_sha1_file(path),
                status="failed",
                error_message=str(exc)[:255],
            )
        except Exception:  # noqa: BLE001
            pass
        return ConvertResult(kind="failed", path=path, detail=str(exc))

    if len((body or "").strip()) < MIN_NATIVE_CHARS:
        logger.info("[document_convert] OCR empty skip %s", path.name)
        return ConvertResult(kind="failed", path=path, detail="ocr empty")

    c_root = clearance_root_for(path, secure_docs_dir)
    assert c_root is not None
    out_dir = converted_docs_dir(c_root)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = _safe_stem(path)
    out_path = out_dir / f"{stem}.md"
    title = path.stem
    doc_id = f"converted-{stem}"
    md = (
        _frontmatter(
            doc_id=doc_id,
            title=title,
            source_path=source_rel,
            converted_from=suffix.lstrip("."),
            clearance=clearance,
            extract_method="ocr",
        )
        + body.strip()
        + "\n"
    )
    out_path.write_text(md, encoding="utf-8")
    md_rel = _repo_rel(out_path, root)
    try:
        from agent import text_match_store

        text_match_store.upsert(
            source_path=source_rel,
            md_path=md_rel,
            clearance=clearance,
            source_ext=suffix.lstrip("."),
            extract_method="ocr",
            source_sha1=_sha1_file(path),
            status="ready",
            error_message=None,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[document_convert] text_match upsert: %s", exc)

    logger.info(
        "[document_convert] OCR wrote %s ← %s [%s]", out_path.name, path.name, clearance
    )
    return ConvertResult(
        kind="ocr_md",
        path=path,
        md_path=out_path,
        needs_ingest=True,
        detail="ocr",
    )


def remove_pair_for_deleted_source(
    path: Path,
    *,
    secure_docs_dir: Path,
    repo_root: Path | None = None,
) -> bool:
    """When source file is deleted: drop OCR md + TEXT_MATCH row."""
    root = repo_root or secure_docs_dir.parent
    source_rel = _repo_rel(path, root)
    changed = False
    try:
        from agent import text_match_store

        row = text_match_store.get_by_source(source_rel)
        if row and row.get("md_path"):
            md = root / str(row["md_path"])
            if md.is_file():
                try:
                    md.unlink()
                    changed = True
                except OSError as exc:
                    logger.warning("[document_convert] delete md: %s", exc)
        text_match_store.delete_by_source(source_rel)
        changed = True
    except Exception as exc:  # noqa: BLE001
        logger.warning("[document_convert] remove_pair: %s", exc)
    # Fallback by stem
    md = paired_md_path(path, secure_docs_dir)
    if md is not None and md.is_file():
        try:
            head = md.read_text(encoding="utf-8", errors="replace")[:800]
            if "category: converted" in head or "converted_from:" in head:
                md.unlink()
                changed = True
        except OSError:
            pass
    return changed


def convert_all_under(
    secure_docs_dir: Path, *, repo_root: Path | None = None
) -> list[ConvertResult]:
    """Process every eligible source under each Documents/<Clearance>/."""
    if not secure_docs_dir.is_dir():
        return []
    out: list[ConvertResult] = []
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
            result = convert_file_to_md(
                path, secure_docs_dir=secure_docs_dir, repo_root=repo_root
            )
            if isinstance(result, ConvertResult):
                out.append(result)
    return out
