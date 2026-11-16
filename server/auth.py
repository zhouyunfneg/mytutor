"""单用户口令 gate：scrypt 哈希存 data/auth.json，会话 token 内存表 + HttpOnly cookie。"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time

from .config import DATA_DIR

AUTH_PATH = DATA_DIR / "auth.json"
TOKENS_PATH = DATA_DIR / "auth_tokens.json"
COOKIE = "mytutor_sess"
TTL = 7 * 24 * 3600


def _load_tokens() -> dict[str, float]:
    if TOKENS_PATH.exists():
        try:
            return {k: float(v) for k, v in json.loads(TOKENS_PATH.read_text(encoding="utf-8")).items()}
        except (ValueError, OSError):
            return {}
    return {}


def _save_tokens() -> None:
    TOKENS_PATH.write_text(json.dumps(_tokens), encoding="utf-8")
    TOKENS_PATH.chmod(0o600)


_tokens: dict[str, float] = _load_tokens()


def _scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)


def has_password() -> bool:
    return AUTH_PATH.exists()


def set_password(password: str) -> None:
    if len(password) < 8:
        raise ValueError("口令至少 8 位")
    salt = os.urandom(16)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    AUTH_PATH.write_text(
        json.dumps({"salt": salt.hex(), "hash": _scrypt(password, salt).hex(),
                    "created": time.strftime("%Y-%m-%d %H:%M:%S")}),
        encoding="utf-8",
    )
    AUTH_PATH.chmod(0o600)
    _tokens.clear()
    _save_tokens()


def check_password(password: str) -> bool:
    if not has_password():
        return False
    d = json.loads(AUTH_PATH.read_text(encoding="utf-8"))
    return hmac.compare_digest(_scrypt(password, bytes.fromhex(d["salt"])), bytes.fromhex(d["hash"]))


def issue_token() -> str:
    tok = secrets.token_urlsafe(32)
    _tokens[tok] = time.time() + TTL
    _save_tokens()
    return tok


def valid_token(tok: str | None) -> bool:
    if not tok:
        return False
    exp = _tokens.get(tok)
    if exp is None:
        return False
    if time.time() > exp:
        _tokens.pop(tok, None)
        return False
    return True


def revoke(tok: str | None) -> None:
    if tok:
        _tokens.pop(tok, None)
        _save_tokens()