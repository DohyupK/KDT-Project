"""
Configurable LLM providers for general chat.

Credentials arrive from Express only (decrypted from ai-service/DB).
No .env GROQ/GOOGLE fallback for general chat.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

ProviderKind = Literal["openai_compatible", "gemini", "anthropic"]


@dataclass
class LlmCredential:
    id: str
    display_name: str
    provider_kind: ProviderKind
    company: str
    model: str
    base_url: str | None
    api_key: str
    cost_score: float


def parse_credentials(raw: list[dict[str, Any]] | None) -> list[LlmCredential]:
    out: list[LlmCredential] = []
    for item in raw or []:
        kind = str(item.get("provider_kind") or "openai_compatible")
        if kind not in ("openai_compatible", "gemini", "anthropic"):
            kind = "openai_compatible"
        key = str(item.get("api_key") or "").strip()
        if not key:
            continue
        out.append(
            LlmCredential(
                id=str(item.get("id") or ""),
                display_name=str(item.get("display_name") or item.get("id") or "llm"),
                provider_kind=kind,  # type: ignore[arg-type]
                company=str(item.get("company") or "custom"),
                model=str(item.get("model") or "local-model"),
                base_url=(str(item["base_url"]) if item.get("base_url") else None),
                api_key=key,
                cost_score=float(item.get("cost_score") or 1.0),
            )
        )
    return out


def resolve_credentials(
    incoming: list[dict[str, Any]] | None,
) -> list[LlmCredential]:
    """Only credentials from Express/DB. Empty list if none registered."""
    parsed = parse_credentials(incoming)
    return sorted(parsed, key=lambda c: (c.cost_score, c.display_name))


def select_auto_order(creds: list[LlmCredential], message: str) -> list[LlmCredential]:
    """Cheapest first; start index = floor(len/100)."""
    if not creds:
        return []
    ordered = sorted(creds, key=lambda c: (c.cost_score, c.display_name))
    tier = min(len(message) // 100, len(ordered) - 1)
    return ordered[tier:] + ordered[:tier]


def _messages_to_openai(messages: list[BaseMessage]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for m in messages:
        role = "user"
        if isinstance(m, SystemMessage):
            role = "system"
        elif isinstance(m, HumanMessage):
            role = "user"
        else:
            role = "assistant"
        content = m.content if isinstance(m.content, str) else str(m.content)
        out.append({"role": role, "content": content})
    return out


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and "text" in block:
                parts.append(str(block["text"]))
        return "".join(parts).strip()
    return str(content).strip()


def invoke_credential(cred: LlmCredential, messages: list[BaseMessage]) -> str | None:
    try:
        if cred.provider_kind == "gemini":
            return _invoke_gemini(cred, messages)
        if cred.provider_kind == "anthropic":
            return _invoke_anthropic(cred, messages)
        return _invoke_openai_compatible(cred, messages)
    except Exception:  # noqa: BLE001
        return None


def _invoke_openai_compatible(
    cred: LlmCredential, messages: list[BaseMessage]
) -> str | None:
    from langchain_openai import ChatOpenAI

    kwargs: dict[str, Any] = {
        "model": cred.model,
        "temperature": 0,
        "api_key": cred.api_key,
        "max_retries": 0,
    }
    if cred.base_url:
        kwargs["base_url"] = cred.base_url.rstrip("/")
    llm = ChatOpenAI(**kwargs)
    out = llm.invoke(messages)
    text = _content_to_text(out.content)
    return text or None


def _invoke_gemini(cred: LlmCredential, messages: list[BaseMessage]) -> str | None:
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ImportError:
        return None
    llm = ChatGoogleGenerativeAI(
        model=cred.model,
        temperature=0,
        google_api_key=cred.api_key,
    )
    out = llm.invoke(messages)
    text = _content_to_text(out.content)
    return text or None


def _invoke_anthropic(cred: LlmCredential, messages: list[BaseMessage]) -> str | None:
    """Anthropic Messages API via stdlib (no extra package)."""
    system_parts: list[str] = []
    user_parts: list[dict[str, Any]] = []
    for m in messages:
        content = m.content if isinstance(m.content, str) else str(m.content)
        if isinstance(m, SystemMessage):
            system_parts.append(content)
        else:
            user_parts.append({"role": "user", "content": content})
    if not user_parts:
        return None
    body: dict[str, Any] = {
        "model": cred.model,
        "max_tokens": 2048,
        "messages": user_parts,
    }
    if system_parts:
        body["system"] = "\n\n".join(system_parts)
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "content-type": "application/json",
            "x-api-key": cred.api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"anthropic HTTP {exc.code}") from exc
    blocks = payload.get("content") or []
    texts: list[str] = []
    for b in blocks:
        if isinstance(b, dict) and b.get("type") == "text":
            texts.append(str(b.get("text") or ""))
    return "".join(texts).strip() or None


def translate_llm_error(exc: BaseException | str) -> str:
    raw = str(exc).lower()
    if "429" in raw or "quota" in raw or "rate" in raw or "resource_exhausted" in raw:
        return "API 사용량(한도)이 초과되었습니다. 다른 API를 선택하거나 잠시 후 다시 시도해 주세요."
    if "401" in raw or "403" in raw or "invalid" in raw and "key" in raw:
        return "API 키가 유효하지 않거나 권한이 없습니다. 보안 탭에서 키를 확인해 주세요."
    if "timeout" in raw or "timed out" in raw:
        return "API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
    if "connection" in raw or "network" in raw:
        return "API 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요."
    return "선택한 API 호출에 실패했습니다. 보안 탭의 키·설정을 확인해 주세요."
