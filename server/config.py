"""MyTutor 设置存储：JSON 文件，key 只存服务端。"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

DATA_DIR = Path(os.environ.get("MYTUTOR_DATA", Path(__file__).resolve().parent.parent / "data"))
SETTINGS_PATH = DATA_DIR / "settings.json"

_lock = threading.RLock()

DEFAULTS: dict[str, Any] = {
    "providers": {
        "deepseek": {"api_key": "", "base_url": "https://api.deepseek.com/v1"},
        "dashscope": {
            "api_key": "",
            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        },
    },
    "models": {
        "teach": "deepseek-chat",
        "reason": "deepseek-reasoner",
        "task": "qwen-flash",
        "embed": "text-embedding-v4",
    },
    "teach": {
        "style": "guide",  # guide=先引导后答案 | direct=直接讲清楚
        "max_explain_chars": 300,
        "max_example_lines": 15,
    },
}


def _merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load_settings() -> dict[str, Any]:
    with _lock:
        if SETTINGS_PATH.exists():
            try:
                stored = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
                return _merge(DEFAULTS, stored)
            except (json.JSONDecodeError, OSError):
                pass
        return json.loads(json.dumps(DEFAULTS))


def save_settings(patch: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        current = load_settings()
        merged = _merge(current, patch)
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        SETTINGS_PATH.write_text(
            json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return merged


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}****{key[-4:]}"


def public_settings() -> dict[str, Any]:
    """给前端的版本：key 打码，附配置状态。"""
    s = load_settings()
    out = json.loads(json.dumps(s))
    for name, p in out["providers"].items():
        p["api_key_masked"] = mask_key(p.get("api_key", ""))
        p["api_key"] = ""
        p["configured"] = bool(s["providers"][name].get("api_key"))
    return out


def provider_for_model(model: str) -> str:
    return "deepseek" if model.lower().startswith("deepseek") else "dashscope"