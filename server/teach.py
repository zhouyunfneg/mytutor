"""微知识点教学循环：讲解→出题→纠错→巩固→下一个，小节小总结/模块大总结。

防灌输四锁：prompt 硬约束字数与单点、单卡 UI、用户按钮推进、判题只给提示不给答案。
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from . import kb, llm, notes, packs, runner
from .config import DATA_DIR, load_settings

SESSION_DIR = DATA_DIR / "sessions"

SANDBOX_LANG = {"python": "python", "javascript": "javascript", "typescript": "typescript"}


# ── 会话存储 ──────────────────────────────────────────────────────────
def _path(pack_id: str):
    return SESSION_DIR / f"{pack_id}.json"


def load_session(pack_id: str) -> dict | None:
    f = _path(pack_id)
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return None


def save_session(s: dict) -> None:
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    _path(s["pack_id"]).write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")


# ── 技能树导航 ────────────────────────────────────────────────────────
def flatten(tree: dict) -> list[dict]:
    out = []
    for mi, m in enumerate(tree.get("modules", [])):
        for si, sec in enumerate(m.get("sections", [])):
            for pi, p in enumerate(sec.get("points", [])):
                out.append({**p, "mi": mi, "si": si, "pi": pi,
                            "module_title": m["title"], "section_title": sec["title"]})
    return out


def find_point(tree: dict, point_id: str) -> dict | None:
    for p in flatten(tree):
        if p["id"] == point_id:
            return p
    return None


def next_point(tree: dict, done: list[str]) -> dict | None:
    for p in flatten(tree):
        if p["id"] not in done:
            return p
    return None


def _section_points(tree: dict, p: dict) -> list[dict]:
    return [x for x in flatten(tree) if x["mi"] == p["mi"] and x["si"] == p["si"]]


def _module_points(tree: dict, p: dict) -> list[dict]:
    return [x for x in flatten(tree) if x["mi"] == p["mi"]]


# ── prompt ───────────────────────────────────────────────────────────
def _explain_system() -> str:
    t = load_settings()["teach"]
    return (
        "你是 MyTutor 的编程微课老师。铁律：\n"
        f"1. 只讲当前这一个微知识点，不展开相邻知识点，不给知识总览，不铺垫后续内容；\n"
        f"2. 讲解正文不超过 {t['max_explain_chars']} 字；\n"
        f"3. 最多一个代码示例，不超过 {t['max_example_lines']} 行；\n"
        "4. 中文口语化、直给，不要开场白和结尾套话；\n"
        "5. 以官方资料摘录为准，资料没写的 API 细节不要编造；\n"
        "6. 命令行示例给通用写法（如 python / py），不要假定学习者装了某个特定小版本。"
    )


JUDGE_RULES = """judge 要求：
- sandbox 模式：append 是平台在学习者代码之后运行的判题代码。平台已把学习者代码打印到 stdout/console 的全部输出捕获为变量 _mt_out（字符串），也可直接引用学习者定义的变量。用断言检查行为（覆盖正常+一个边界），全部通过后最后一行 print("ALL_PASS")（JavaScript/TypeScript 用 console.log("ALL_PASS")）。不要替学习者实现功能；禁止读取或 exec 源文件、禁止重新运行学习者代码。
- ai 模式：checklist 是 3~5 条可逐条核对的中文检查项。"""

EXERCISE_PROMPT = """为下面的微知识点出 1 道动手小题。

知识点：{title}
目标：{goal}
讲解内容：
{explain}

判题方式：{judge_desc}

只输出 JSON，格式：
{{"task": "题面，中文，≤120字，说清要写什么代码", "starter": "给学习者的起始代码（可为空字符串）", "judge": {judge_schema}}}
{judge_rules}
题目只考当前这一个知识点，5 分钟内能做完。"""

SANDBOX_SCHEMA = '{"mode": "sandbox", "append": "判题代码字符串"}'
AI_SCHEMA = '{"mode": "ai", "checklist": ["检查项1", "..."]}'

HINT_PROMPT = """学习者做错了这道题。给一条提示帮他自己改对。

题面：{task}
学习者代码：
{code}
运行结果/错误：
{output}

铁律：只指方向（哪里不对、该想什么），≤150 字，绝不给完整答案代码，不重写他的代码。中文。"""

AI_JUDGE_PROMPT = """逐条核对学习者的代码是否满足检查项。

题面：{task}
检查项：{checklist}
学习者代码：
{code}

只输出 JSON：{{"pass": true/false, "hint": "未通过时给≤150字方向性提示，不给答案；通过时为空字符串"}}"""

CONSOLIDATE_PROMPT = """学习者已做对原题。出一道变式题巩固同一个知识点：换场景或换数据，难度相当，不引入新知识点。

知识点：{title}
原题：{task}

只输出 JSON，格式：
{{"task": "...", "starter": "...", "judge": {judge_schema}}}
{judge_rules}"""

SUMMARY_PROMPT = """用中文写一段{kind}总结，回顾下面这些微知识点（只回顾，不讲新内容）：
{points}

要求：{limit}；口语化；结尾一句话点出这些点之间的关系。不要列表堆砌，写成连贯短段落。"""


def _parse_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        text = m.group(0)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        from json_repair import repair_json

        return json.loads(repair_json(text))


def _judge_spec(pack_id: str) -> tuple[str, str, str]:
    runtime = packs.PACKS[pack_id]["runtime"]
    if runtime in SANDBOX_LANG:
        return (
            "sandbox（代码会在沙箱真实运行，append 判题代码追加在学习者代码后）",
            SANDBOX_SCHEMA,
            SANDBOX_LANG[runtime],
        )
    return ("ai（页面预览类语言，由 AI 逐条核对检查项）", AI_SCHEMA, "")


def _sandbox_full(code: str, append: str, lang: str) -> str:
    """平台统一判题底座：先捕获学习者输出为 _mt_out，再跑 append。

    不靠模型自觉——曾实测模型生成"重新 exec 源文件"的判题代码，
    会把自己也再执行一遍导致无限递归。底座直接提供输出变量杜绝这类写法。
    """
    if lang == "python":
        return (
            "import contextlib as _mt_ctx, io as _mt_io\n"
            "_mt_buf = _mt_io.StringIO()\n"
            "_mt_g = {'__name__': '__main__'}\n"
            "with _mt_ctx.redirect_stdout(_mt_buf):\n"
            f"    exec(compile({code!r}, '<learner>', 'exec'), _mt_g)\n"
            "_mt_g['_mt_out'] = _mt_buf.getvalue()\n"
            f"exec(compile({append!r}, '<judge>', 'exec'), _mt_g)\n"
        )
    # javascript / typescript：临时接管 console.log 收集输出，判题前还原
    return (
        "const _mt_lines = [];\n"
        "const _mt_origLog = console.log;\n"
        "console.log = (..._mt_a) => { _mt_lines.push(_mt_a.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' ')); };\n"
        + code + "\n"
        "console.log = _mt_origLog;\n"
        "const _mt_out = _mt_lines.join('\\n');\n"
        + append + "\n"
    )


# ── 步骤动作 ──────────────────────────────────────────────────────────
async def start(pack_id: str, point_id: str | None = None, *, restart: bool = False) -> dict:
    tree = packs.load_tree(pack_id)
    if not tree:
        raise ValueError("语言包未就绪：先安装并生成技能树")
    if restart:
        _path(pack_id).unlink(missing_ok=True)  # 清空进度，从第一个点重来
    s = load_session(pack_id) or {"pack_id": pack_id, "done_points": []}
    p = find_point(tree, point_id) if point_id else next_point(tree, s["done_points"])
    if p is None:
        s["step"] = "pack_done"
        save_session(s)
        return s
    rag = await kb.search(pack_id, f"{p['title']} {p['goal']}", top_k=3)
    explain = await llm.chat(
        [
            {"role": "system", "content": _explain_system()},
            {"role": "user", "content": f"微知识点：{p['title']}\n目标：{p['goal']}\n\n官方资料摘录：\n{rag['content'][:4000]}"},
        ],
        temperature=0.4,
        max_tokens=900,
    )
    s.update({"point_id": p["id"], "step": "explain", "explain": explain.strip(),
              "exercise": None, "consolidate": None, "hint": None, "attempts": 0, "summary": None,
              "hint_log": []})
    save_session(s)
    return s


async def to_exercise(pack_id: str) -> dict:
    s = load_session(pack_id)
    if not s or s["step"] != "explain":
        raise ValueError("当前不在讲解步骤")
    tree = packs.load_tree(pack_id)
    p = find_point(tree, s["point_id"])
    desc, schema, _ = _judge_spec(pack_id)
    raw = await llm.chat(
        [{"role": "user", "content": EXERCISE_PROMPT.format(
            title=p["title"], goal=p["goal"], explain=s["explain"], judge_desc=desc,
            judge_schema=schema, judge_rules=JUDGE_RULES)}],
        temperature=0.5,
        max_tokens=1500,
    )
    ex = _parse_json(raw)
    if not ex.get("task") or not ex.get("judge"):
        raise RuntimeError("出题结果缺少 task/judge")
    s.update({"step": "exercise", "exercise": ex, "hint": None, "attempts": 0})
    save_session(s)
    return s


async def submit(pack_id: str, code: str) -> dict:
    s = load_session(pack_id)
    if not s or s["step"] not in ("exercise", "correcting", "consolidate", "consolidate_correcting"):
        raise ValueError("当前不在可提交步骤")
    is_cons = s["step"].startswith("consolidate")
    ex = s["consolidate"] if is_cons else s["exercise"]
    judge = ex["judge"]
    output = ""
    if judge["mode"] == "sandbox":
        lang = _judge_spec(pack_id)[2]
        full = _sandbox_full(code, judge.get("append", ""), lang)
        r = await runner.run_code(full, lang, timeout=15)
        output = r["output"]
        passed = bool(r["ok"]) and "ALL_PASS" in output
    else:
        raw = await llm.chat(
            [{"role": "user", "content": AI_JUDGE_PROMPT.format(
                task=ex["task"], checklist=json.dumps(judge.get("checklist", []), ensure_ascii=False), code=code)}],
            temperature=0.1,
            max_tokens=400,
        )
        verdict = _parse_json(raw)
        passed = bool(verdict.get("pass"))
        output = verdict.get("hint", "")
    s["attempts"] = s.get("attempts", 0) + 1
    s["last_output"] = output[:2000]
    if passed:
        s["hint"] = None
        if is_cons:
            s["step"] = "point_done"
            if s["point_id"] not in s["done_points"]:
                s["done_points"].append(s["point_id"])
        else:
            tree = packs.load_tree(pack_id)
            p = find_point(tree, s["point_id"])
            _, schema, _ = _judge_spec(pack_id)
            raw = await llm.chat(
                [{"role": "user", "content": CONSOLIDATE_PROMPT.format(
                    title=p["title"], task=ex["task"], judge_schema=schema, judge_rules=JUDGE_RULES)}],
                temperature=0.6,
                max_tokens=1500,
            )
            cons = _parse_json(raw)
            if not cons.get("task") or not cons.get("judge"):
                raise RuntimeError("巩固题结果缺少 task/judge")
            s.update({"step": "consolidate", "consolidate": cons})
    else:
        if judge["mode"] == "sandbox":
            hint = await llm.chat(
                [{"role": "user", "content": HINT_PROMPT.format(task=ex["task"], code=code, output=output[:1500])}],
                temperature=0.3,
                max_tokens=300,
            )
        else:
            hint = output or "再核对一下检查项。"
        s["hint"] = hint.strip()
        # 卡壳记录留给自动笔记：错在哪、给了什么提示
        s.setdefault("hint_log", []).append({
            "phase": "consolidate" if is_cons else "exercise",
            "output": output[:200], "hint": hint.strip()[:200], "code": code[:400],
        })
        s["hint_log"] = s["hint_log"][-6:]
        s["step"] = "consolidate_correcting" if is_cons else "correcting"
    save_session(s)
    return s


async def retry(pack_id: str) -> dict:
    s = load_session(pack_id)
    if not s or s["step"] not in ("correcting", "consolidate_correcting"):
        raise ValueError("当前不在纠错步骤")
    s["step"] = "consolidate" if s["step"] == "consolidate_correcting" else "exercise"
    s["hint"] = None
    save_session(s)
    return s


async def _note_point_safe(pack_id: str, s: dict, p: dict) -> None:
    try:
        await notes.auto_point_note(pack_id, s, p)
    except Exception as e:
        print(f"[notes] 自动知识点笔记失败: {type(e).__name__}: {e}")


async def _seed_practice_safe(pack_id: str, point_id: str) -> None:
    """学完一个点登记间隔复习表；lazy import 避免与 practice 循环引用。"""
    try:
        from . import practice

        practice.seed(pack_id, point_id)
    except Exception as e:
        print(f"[practice] 复习登记失败: {type(e).__name__}: {e}")


async def advance(pack_id: str) -> dict:
    """用户点「下一个/继续」才前进。"""
    s = load_session(pack_id)
    if not s:
        raise ValueError("没有进行中的学习会话")
    tree = packs.load_tree(pack_id)
    step = s["step"]
    if step == "point_done":
        p = find_point(tree, s["point_id"])
        # 后台生成复习笔记，不阻塞「下一个」；失败只记日志不影响学习
        asyncio.create_task(_note_point_safe(pack_id, dict(s), p))
        asyncio.create_task(_seed_practice_safe(pack_id, s["point_id"]))
        sec = _section_points(tree, p)
        if all(x["id"] in s["done_points"] for x in sec):
            return await _summary(pack_id, s, p, "小节", "≤200字", sec, "section_summary")
        return await start(pack_id)
    if step == "section_summary":
        p = find_point(tree, s["point_id"])
        mod = _module_points(tree, p)
        if all(x["id"] in s["done_points"] for x in mod):
            return await _summary(pack_id, s, p, "模块", "≤400字", mod, "module_summary")
        return await start(pack_id)
    if step == "module_summary":
        return await start(pack_id)
    raise ValueError(f"步骤 {step} 不能 advance")


async def _summary(pack_id, s, p, kind, limit, points, step) -> dict:
    listing = "\n".join(f"- {x['title']}：{x['goal']}" for x in points)
    text = await llm.chat(
        [{"role": "user", "content": SUMMARY_PROMPT.format(kind=kind, points=listing, limit=limit)}],
        temperature=0.4,
        max_tokens=700,
    )
    s.update({"step": step, "summary": text.strip()})
    save_session(s)
    # 总结顺手存为笔记（不额外调用 LLM）
    is_sec = step == "section_summary"
    scope = f"m{p['mi']}s{p['si']}" if is_sec else f"m{p['mi']}"
    title = f"{kind}总结 · {p['section_title'] if is_sec else p['module_title']}"
    try:
        await notes.auto_summary_note(pack_id, sub="section" if is_sec else "module",
                                      scope=scope, title=title, text=text.strip(), point_id=p["id"])
    except Exception as e:
        print(f"[notes] 总结笔记保存失败: {type(e).__name__}: {e}")
    return s


def state(pack_id: str) -> dict | None:
    s = load_session(pack_id)
    if not s:
        return None
    tree = packs.load_tree(pack_id)
    p = find_point(tree, s.get("point_id", "")) if tree else None
    return {**s, "point": p}


def progress(pack_id: str) -> dict:
    """学习书进度：供语言包列表/技能树渲染 ✓ 与继续学习入口。"""
    tree = packs.load_tree(pack_id)
    total = len(flatten(tree)) if tree else 0
    s = load_session(pack_id)
    if not s:
        return {"started": False, "done": [], "current": None, "step": "none", "total": total}
    return {
        "started": True,
        "done": s.get("done_points", []),
        "current": s.get("point_id"),
        "step": s.get("step", "none"),
        "total": total,
    }