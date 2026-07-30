"""
Security-tab LLM: local vLLM OpenAI-compatible only + secure RAG graph.

Wiring:
  SecurityChatbot → Express /api/security-chat → FastAPI /security-chat
  → agent.secure_graph.run_secure_chat → rag_engine + ChatOpenAI(vLLM)

NEVER import or call Groq / Gemini / compose_with_failover here.
Do NOT load HuggingFace chat LLMs in-process — chat via external vLLM.
Embed/rerank models run on CPU only (see rag_engine).
See docs/references/vllm-setup.md · docs/references/secure-rag.md
"""

from __future__ import annotations

import os
from typing import Any

from langchain_openai import ChatOpenAI


def vllm_base_url() -> str:
    raw = (
        os.environ.get("CHAT_VLLM_BASE_URL")
        or os.environ.get("VLLM_BASE_URL")
        or "http://127.0.0.1:8001/v1"
    ).strip()
    return raw.rstrip("/")


def vllm_model() -> str:
    return (
        os.environ.get("CHAT_VLLM_MODEL")
        or os.environ.get("VLLM_MODEL")
        or "local-model"
    ).strip()


def make_vllm() -> ChatOpenAI:
    return ChatOpenAI(
        base_url=vllm_base_url(),
        api_key="EMPTY",
        model=vllm_model(),
        temperature=0.2,
        timeout=120,
        max_retries=0,
    )


def content_to_text(content: Any) -> str:
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
    Secure RAG + local vLLM via LangGraph.
    No cloud fallback. Empty retrieval → fixed no-docs reply (no hallucination).
    """
    from agent.secure_graph import run_secure_chat

    return run_secure_chat(message)
