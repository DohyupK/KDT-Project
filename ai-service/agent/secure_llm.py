"""
Security-tab LLM: local vLLM OpenAI-compatible only.

Wiring:
  SecurityChatbot → Express /api/security-chat → FastAPI /security-chat → this module
  → CHAT_VLLM_BASE_URL (default http://127.0.0.1:8001/v1), api_key=EMPTY

NEVER import or call Groq / Gemini / compose_with_failover here.
Do NOT load HuggingFace transformers in-process — serve models via external vLLM.
See docs/references/vllm-setup.md
"""

from __future__ import annotations

import os
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from agent.secure_prompts import OFFLINE_REPLY, SYSTEM_SECURE


def _vllm_base_url() -> str:
    # Prefer CHAT_VLLM_BASE_URL; accept VLLM_BASE_URL as alias
    raw = (
        os.environ.get("CHAT_VLLM_BASE_URL")
        or os.environ.get("VLLM_BASE_URL")
        or "http://127.0.0.1:8001/v1"
    ).strip()
    return raw.rstrip("/")


def _vllm_model() -> str:
    return (
        os.environ.get("CHAT_VLLM_MODEL")
        or os.environ.get("VLLM_MODEL")
        or "local-model"
    ).strip()


def _make_vllm() -> ChatOpenAI:
    return ChatOpenAI(
        base_url=_vllm_base_url(),
        api_key="EMPTY",
        model=_vllm_model(),
        temperature=0.2,
        timeout=60,
        max_retries=0,
    )


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


def compose_secure(message: str) -> dict[str, Any]:
    """
    Invoke local vLLM only. On failure return offline template (no cloud fallback).
    """
    text = (message or "").strip()
    if not text:
        return {
            "reply": "메시지가 비어 있습니다.",
            "mode": "template",
            "provider": "offline",
            "error": "empty_message",
        }

    try:
        llm = _make_vllm()
        out = llm.invoke(
            [
                SystemMessage(content=SYSTEM_SECURE),
                HumanMessage(content=text),
            ]
        )
        reply = _content_to_text(out.content)
        if not reply:
            return {
                "reply": OFFLINE_REPLY,
                "mode": "template",
                "provider": "offline",
                "error": "empty_vllm_reply",
            }
        return {
            "reply": reply,
            "mode": "security_vllm",
            "provider": "vllm",
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001 — isolate; never cloud fallback
        return {
            "reply": OFFLINE_REPLY,
            "mode": "template",
            "provider": "offline",
            "error": str(exc)[:300],
        }
