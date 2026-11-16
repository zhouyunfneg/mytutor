"""笔记：AI 自动笔记（知识点/小节总结/模块总结）+ 手动笔记。

存储为单文件 data/notes.json（单用户规模足够）。
自动笔记按 scope upsert：重学同一个点/小节只更新不重复。
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

from . import llm
from .config import DATA_DIR

_FILE = DATA_DIR / "notes.json"
_LOCK = asyncio.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _load() -> list[dict]:
    if _FILE.exists():
        return json.loads(_FILE.read_text(encoding="utf-8"))
    return []


def _save(items: list[dict]) -> None:
    _FILE.parent.mkdir(parents=True, exist_ok=True)
    _FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def list_notes(pack_id: str | None = None, kind: str | None = None, q: str | None = None) -> list[dict]:
    items = _load()
    if pack_id:
        items = [n for n in items if n.get("pack_id") == pack_id]
    if kind:
        items = [n for n in items if n.get("kind") == kind]
    if q:
        ql = q.lower()
        items = [n for n in items if ql in (n.get("title", "") + "\n" + n.get("content", "")).lower()]
    return sorted(items, key=lambda n: n.get("created_at", ""), reverse=True)


async def add_note(*, kind: str, title: str, content: str, pack_id: str | None = None,
                   point_id: str | None = None, sub: str | None = None, scope: str | None = None) -> dict:
    async with _LOCK:
        items = _load()
        # 自动笔记按 scope upsert：重学同一位置只更新，不堆重复笔记
        if kind == "auto" and scope:
            for n in items:
                if n.get("kind") == "auto" and n.get("scope") == scope and n.get("pack_id") == pack_id:
                    n.update(title=title, content=content, point_id=point_id, updated_at=_now())
                    _save(items)
                    return n
        n = {
            "id": uuid.uuid4().hex[:12], "kind": kind, "title": title, "content": content,
            "pack_id": pack_id, "point_id": point_id, "sub": sub, "scope": scope,
            "created_at": _now(), "updated_at": _now(),
        }
        items.append(n)
        _save(items)
        return n


async def update_note(note_id: str, *, title: str | None = None, content: str | None = None) -> dict | None:
    async with _LOCK:
        items = _load()
        for n in items:
            if n["id"] == note_id:
                if title is not None:
                    n["title"] = title
                if content is not None:
                    n["content"] = content
                n["updated_at"] = _now()
                _save(items)
                return n
    return None


async def delete_note(note_id: str) -> bool:
    async with _LOCK:
        items = _load()
        left = [n for n in items if n["id"] != note_id]
        if len(left) == len(items):
            return False
        _save(left)
        return True


# ── AI 自动笔记 ──────────────────────────────────────────────────────
# 规则（用户定）：突出知识点重点，简洁明了；不记录知识点之外的错误过程。
NOTE_PROMPT = """你是 MyTutor 的笔记助手。把这次微知识点学习整理成一则复习笔记，只突出知识点本身的重点，简洁明了。

知识点：{title}（目标：{goal}）
讲解：{explain}
{stumble_line}
要求：
1. 中文≤150字：第一句点明核心，然后 2~3 条要点（用"- "列表）；语法/格式类知识可带一个最小示例。
2. 只写知识点重点：不复述题面，不记录学习过程（提交次数、报错输出、练习/巩固题一律不写），不写套话，不讲新内容。
3. 仅当学习者的卡壳反映了对本知识点的误解时，才在末尾加一句澄清（≤25字）；否则完全不提错误。
4. 直接输出笔记正文，无标题、无开场白。"""


async def auto_point_note(pack_id: str, s: dict, point: dict) -> dict:
    """学完一个点（原题+变式都过）后自动生成复习笔记。LLM 失败时降级为结构化记录。"""
    stumbles = s.get("hint_log") or []
    stumble_line = (
        f"学习者曾卡壳，当时得到的提示：{stumbles[-1].get('hint', '')[:100]}"
        if stumbles else "学习者一次做对，无卡壳。"
    )
    try:
        body = (await llm.chat(
            [{"role": "user", "content": NOTE_PROMPT.format(
                title=point["title"], goal=point.get("goal", ""),
                explain=(s.get("explain") or "")[:1200], stumble_line=stumble_line)}],
            temperature=0.3,
            max_tokens=400,
        )).strip()
    except Exception:
        body = ""
    if not body:
        body = f"核心：{point.get('goal', point['title'])}\n讲解摘录：{(s.get('explain') or '')[:150]}"
    return await add_note(
        kind="auto", sub="point", scope=point["id"], pack_id=pack_id, point_id=point["id"],
        title=point["title"], content=body,
    )


async def auto_summary_note(pack_id: str, *, sub: str, scope: str, title: str, text: str,
                            point_id: str | None = None) -> dict:
    """小节/模块总结生成后顺手存为笔记（不额外调用 LLM）。"""
    return await add_note(kind="auto", sub=sub, scope=scope, pack_id=pack_id,
                          point_id=point_id, title=title, content=text)