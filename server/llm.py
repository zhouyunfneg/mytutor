"""LLM 接入：DeepSeek / DashScope（OpenAI 兼容），流式与连通测试。"""
from __future__ import annotations

import time
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from .config import load_settings, provider_for_model


def _client(provider: str) -> AsyncOpenAI:
    s = load_settings()
    p = s["providers"][provider]
    if not p.get("api_key"):
        raise ValueError(f"provider {provider} 未配置 API key")
    return AsyncOpenAI(api_key=p["api_key"], base_url=p["base_url"], timeout=120.0)


def client_for_model(model: str) -> AsyncOpenAI:
    return _client(provider_for_model(model))


async def chat(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.4,
    max_tokens: int = 2000,
) -> str:
    s = load_settings()
    model = model or s["models"]["teach"]
    resp = await client_for_model(model).chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    choice = resp.choices[0]
    text = choice.message.content or ""
    if not text.strip():
        # 推理模型可能把 max_tokens 全耗在思考上，正文为空；照实报错而不是往下传空串
        raise ValueError(
            f"模型 {model} 返回空正文（finish_reason={choice.finish_reason}）；"
            "推理模型请增大 max_tokens"
        )
    return text


async def chat_stream(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.4,
    max_tokens: int = 2000,
) -> AsyncIterator[str]:
    s = load_settings()
    model = model or s["models"]["teach"]
    stream = await client_for_model(model).chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )
    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


async def test_chat(provider: str) -> dict[str, Any]:
    """连通测试：最小对话请求，照实返回结果。"""
    s = load_settings()
    model = "deepseek-chat" if provider == "deepseek" else "qwen-flash"
    t0 = time.monotonic()
    try:
        resp = await _client(provider).chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "回复ok两个字母即可"}],
            max_tokens=8,
        )
        dt = time.monotonic() - t0
        text = (resp.choices[0].message.content or "").strip()
        return {"ok": True, "model": model, "latency_s": round(dt, 2), "reply": text}
    except Exception as e:
        return {"ok": False, "model": model, "error": f"{type(e).__name__}: {e}"}


async def test_embedding() -> dict[str, Any]:
    """嵌入连通测试（DashScope text-embedding-v4）。"""
    s = load_settings()
    model = s["models"]["embed"]
    t0 = time.monotonic()
    try:
        resp = await _client("dashscope").embeddings.create(
            model=model, input=["MyTutor 连通测试"]
        )
        dt = time.monotonic() - t0
        dim = len(resp.data[0].embedding)
        return {"ok": True, "model": model, "dim": dim, "latency_s": round(dt, 2)}
    except Exception as e:
        return {"ok": False, "model": model, "error": f"{type(e).__name__}: {e}"}