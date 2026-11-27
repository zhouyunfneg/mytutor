"""学习时长：只累计前台活跃区间，服务端去重并合并多标签重叠。

前端每 15 秒上报一段不足 15 秒的活跃时间；离开页面或断开时补报。
服务端不相信页面打开时长，只接受 1~180 秒的区间，重复上报按 id 去重，
多个标签页重叠的部分只记一次。单文件 JSON 存储，不引入数据库。
"""
from __future__ import annotations

import json
import os
import re
import threading
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

DATA_DIR = Path(os.environ.get("MYTUTOR_DATA", Path(__file__).resolve().parent.parent / "data"))
PATH = DATA_DIR / "activity.json"
TZ = ZoneInfo("Asia/Shanghai")
KINDS = {"learn", "practice", "notes"}
KIND_LABELS = {"learn": "课程学习", "practice": "练习", "notes": "笔记"}
MAX_SEGMENT_SECONDS = 180
MAX_BATCH = 300
MAX_IDS_PER_SEGMENT = 300  # 重叠校验仍兜底；只保留有限 id，防止长期心跳把 JSON 撑大。
MAX_AGE = timedelta(hours=48)
FUTURE_SLACK = timedelta(minutes=2)
SESSION_GAP = timedelta(minutes=10)
MIN_DAY_SECONDS = 60
_lock = threading.RLock()


def _empty() -> dict:
    return {"version": 1, "segments": []}


def _load() -> dict:
    with _lock:
        if not PATH.exists():
            return _empty()
        try:
            st = json.loads(PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            # 不把损坏文件当空数据覆盖，避免悄悄抹掉学习记录。
            raise RuntimeError(f"学习时长文件无法读取：{e}") from e
        if not isinstance(st, dict) or not isinstance(st.get("segments"), list):
            raise RuntimeError("学习时长文件格式不正确")
        return st


def _save(st: dict) -> None:
    PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(st, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(PATH)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(value: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError("时间格式不正确")
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("时间必须带时区")
    return dt.astimezone(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _clean(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _context(raw: dict) -> tuple:
    return (
        _clean(raw.get("kind"), 16),
        _clean(raw.get("pack_id"), 40),
        _clean(raw.get("pack_name"), 40),
        _clean(raw.get("point_id"), 40),
        _clean(raw.get("title"), 120),
    )


def _ids(seg: dict) -> set[str]:
    return set(seg.get("ids") or ([seg["id"]] if seg.get("id") else []))


def _subtract(start: datetime, end: datetime, blocks: list[dict]) -> list[tuple[datetime, datetime]]:
    """从新区间里减去已记区间，返回尚未计入的部分。"""
    out = []
    cursor = start
    for b in sorted(blocks, key=lambda x: x["_start"]):
        bs, be = b["_start"], b["_end"]
        if be <= cursor:
            continue
        if bs >= end:
            break
        if bs > cursor:
            out.append((cursor, min(bs, end)))
        cursor = max(cursor, be)
        if cursor >= end:
            break
    if cursor < end:
        out.append((cursor, end))
    return out


def _split_days(start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """按北京时间自然日切开，跨午夜学习能分别落到两天。"""
    out = []
    cursor = start
    while cursor < end:
        local = cursor.astimezone(TZ)
        next_midnight = datetime.combine(local.date() + timedelta(days=1), time.min, TZ)
        stop = min(end, next_midnight.astimezone(timezone.utc))
        out.append((cursor, stop))
        cursor = stop
    return out


def _compact(segments: list[dict]) -> list[dict]:
    """相邻且上下文相同的区间合并，避免 15 秒心跳把 JSON 撑大。"""
    parsed = []
    for s in segments:
        parsed.append({**s, "_start": _parse(s["start"]), "_end": _parse(s["end"])})
    parsed.sort(key=lambda x: (x["_start"], x["_end"]))
    out: list[dict] = []
    for s in parsed:
        if out:
            prev = out[-1]
            same = _context(prev) == _context(s)
            if same and s["_start"] <= prev["_end"]:
                prev["_end"] = max(prev["_end"], s["_end"])
                prev["end"] = _iso(prev["_end"])
                prev["ids"] = list(dict.fromkeys([*sorted(_ids(prev)), *sorted(_ids(s))]))[-MAX_IDS_PER_SEGMENT:]
                continue
        out.append(s)
    for s in out:
        s.pop("_start", None)
        s.pop("_end", None)
        ids = list(dict.fromkeys([*(s.get("ids") or []), *([s["id"]] if s.get("id") else [])]))
        s["ids"] = ids[-MAX_IDS_PER_SEGMENT:]
        s.pop("id", None)
    return out


def record(raw_segments: list[dict], now: datetime | None = None) -> dict:
    """接入一批活跃区间；返回本条批次的计入/重复/拒绝数量。"""
    if not isinstance(raw_segments, list) or len(raw_segments) > MAX_BATCH:
        raise ValueError(f"每次最多上报 {MAX_BATCH} 段")
    now = (now or _utc_now()).astimezone(timezone.utc)
    accepted = duplicated = rejected = 0
    with _lock:
        st = _load()
        blocks = [{**s, "_start": _parse(s["start"]), "_end": _parse(s["end"])}
                  for s in st["segments"]]
        seen = set().union(*(_ids(s) for s in blocks)) if blocks else set()
        for raw in raw_segments:
            try:
                if not isinstance(raw, dict):
                    raise ValueError("区间格式不正确")
                seg_id = _clean(raw.get("id"), 80)
                if not seg_id:
                    seg_id = uuid.uuid4().hex
                if seg_id in seen:
                    duplicated += 1
                    continue
                start = _parse(raw.get("start"))
                end = _parse(raw.get("end"))
                kind = _clean(raw.get("kind"), 16)
                if kind not in KINDS:
                    raise ValueError("未知学习类型")
                if end <= start or (end - start).total_seconds() < 1 or (end - start).total_seconds() > MAX_SEGMENT_SECONDS:
                    raise ValueError("单段时长超出范围")
                start = max(start, now - MAX_AGE)
                end = min(end, now + FUTURE_SLACK)
                if end <= start:
                    raise ValueError("区间已过期")
                pack_id = _clean(raw.get("pack_id"), 40)
                point_id = _clean(raw.get("point_id"), 40)
                if pack_id and not re.fullmatch(r"[A-Za-z0-9_-]+", pack_id):
                    raise ValueError("语言包标识不正确")
                if point_id and not re.fullmatch(r"[A-Za-z0-9_-]+", point_id):
                    raise ValueError("知识点标识不正确")
                item = {
                    "id": seg_id, "start": _iso(start), "end": _iso(end), "kind": kind,
                    "pack_id": pack_id, "pack_name": _clean(raw.get("pack_name"), 40),
                    "point_id": point_id, "title": _clean(raw.get("title"), 120),
                }
                pieces = _subtract(start, end, blocks)
                if not pieces:
                    duplicated += 1
                    continue
                for a, b in pieces:
                    for ca, cb in _split_days(a, b):
                        blocks.append({**item, "start": _iso(ca), "end": _iso(cb),
                                       "_start": ca, "_end": cb})
                seen.add(seg_id)
                accepted += 1
            except (TypeError, ValueError, OverflowError):
                rejected += 1
        if accepted:
            st["segments"] = _compact(blocks)
            _save(st)
        return {"ok": True, "accepted": accepted, "duplicated": duplicated, "rejected": rejected}


def _duration(start: datetime, end: datetime) -> int:
    return max(0, round((end - start).total_seconds()))


def _pack_names() -> dict[str, str]:
    try:
        from . import packs
        return {p["id"]: p.get("name") or p["id"] for p in packs.list_packs()}
    except Exception:
        return {}


def _sessions(segments: list[tuple[datetime, datetime, dict]], names: dict[str, str]) -> list[dict]:
    groups: list[list[tuple[datetime, datetime, dict]]] = []
    current: list[tuple[datetime, datetime, dict]] = []
    last_end = None
    for start, end, raw in segments:
        if last_end is not None and start - last_end > SESSION_GAP:
            groups.append(current)
            current = []
        current.append((start, end, raw))
        last_end = end
    if current:
        groups.append(current)

    out = []
    for group in groups:
        weights: dict[tuple, int] = defaultdict(int)
        kind_seconds: dict[str, int] = defaultdict(int)
        pack_ids = set()
        for start, end, raw in group:
            ctx = _context(raw)
            weights[ctx] += _duration(start, end)
            kind_seconds[ctx[0]] += _duration(start, end)
            if ctx[1]:
                pack_ids.add(ctx[1])
        main = max(weights, key=weights.get)
        kind, pack_id, pack_name, point_id, title = main
        out.append({
            "started_at": _iso(group[0][0]), "ended_at": _iso(group[-1][1]),
            "duration_s": sum(_duration(a, b) for a, b, _ in group),
            "kind": kind, "kind_label": KIND_LABELS.get(kind, kind),
            "pack_id": pack_id or None,
            "pack_name": pack_name or names.get(pack_id) or pack_id or None,
            "point_id": point_id or None, "title": title or None,
            "mixed": len(kind_seconds) > 1 or len(pack_ids) > 1,
            "by_kind": {KIND_LABELS.get(k, k): v for k, v in sorted(kind_seconds.items())},
        })
    return out


def summary(now: datetime | None = None) -> dict:
    now = (now or _utc_now()).astimezone(timezone.utc)
    today = now.astimezone(TZ).date()
    monday = today - timedelta(days=today.weekday())
    names = _pack_names()
    with _lock:
        st = _load()
    parsed = []
    for raw in st["segments"]:
        parsed.append((_parse(raw["start"]), _parse(raw["end"]), raw))
    parsed.sort(key=lambda x: x[0])

    daily: dict[date, int] = defaultdict(int)
    kind_totals: dict[str, int] = defaultdict(int)
    today_kinds: dict[str, int] = defaultdict(int)
    pack_totals: dict[str, int] = defaultdict(int)
    pack_labels: dict[str, str] = {}
    total = 0
    for start, end, raw in parsed:
        seconds = _duration(start, end)
        total += seconds
        kind = raw.get("kind", "learn")
        kind_totals[kind] += seconds
        pack_id = raw.get("pack_id") or ""
        if pack_id:
            pack_totals[pack_id] += seconds
            pack_labels[pack_id] = raw.get("pack_name") or names.get(pack_id) or pack_id
        for day_start, day_end in _split_days(start, end):
            day = day_start.astimezone(TZ).date()
            sec = _duration(day_start, day_end)
            daily[day] += sec
            if day == today:
                today_kinds[kind] += sec

    week_seconds = sum(sec for day, sec in daily.items() if monday <= day <= today)
    days = [{"date": (today - timedelta(days=i)).isoformat(), "seconds": daily[today - timedelta(days=i)]}
            for i in range(6, -1, -1)]
    cursor = today
    if daily[cursor] < MIN_DAY_SECONDS:
        cursor -= timedelta(days=1)
    streak = 0
    while daily[cursor] >= MIN_DAY_SECONDS:
        streak += 1
        cursor -= timedelta(days=1)

    sessions = _sessions(parsed, names)
    packs = [{"id": pid, "name": pack_labels[pid], "seconds": sec,
              "percent": round(sec * 100 / total) if total else 0}
             for pid, sec in sorted(pack_totals.items(), key=lambda x: x[1], reverse=True)]
    return {
        "ok": True,
        "today_seconds": daily[today], "week_seconds": week_seconds, "total_seconds": total,
        "streak_days": streak,
        "days": days,
        "today_by_kind": {KIND_LABELS.get(k, k): v for k, v in sorted(today_kinds.items())},
        "by_kind": {KIND_LABELS.get(k, k): kind_totals[k] for k in KINDS},
        "packs": packs,
        "recent": list(reversed(sessions[-10:])),
        "tracking_since": _iso(parsed[0][0]) if parsed else None,
        "server_time": _iso(now),
        "rules": {"idle_seconds": 120, "session_gap_seconds": 600, "min_day_seconds": MIN_DAY_SECONDS},
    }
