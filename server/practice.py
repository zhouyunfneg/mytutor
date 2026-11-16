"""阶段 3：练习题库 + 错题本 + 间隔复习。

复用教学循环的判题底座与防灌输锁：判题只给提示不给答案；题只考单点。
- 题库：按点缓存 LLM 变式题（bank），"换一题"生成新题入缓存（每点上限 6 道）。
- 错题本：判错入本（题面/当时代码/提示/一句错因），重练做对自动消除，可手动移除。
- 间隔复习：简化 SM-2，做对间隔 1→3→7→15→30 天封顶，做错归 1 天；
  教学循环学完一个点自动登记（teach.advance 里 lazy import 调用 seed）。
存储：data/practice.json 单文件，单用户无并发负担，不加依赖。
"""
from __future__ import annotations

import json
import uuid
from datetime import date, timedelta

from . import llm, packs, runner, teach
from .config import DATA_DIR

PATH = DATA_DIR / "practice.json"
INTERVALS = [1, 3, 7, 15, 30]  # 做对第 n 次后的间隔天数（封顶 30）
BANK_CAP = 6


def _load() -> dict:
    if PATH.exists():
        return json.loads(PATH.read_text(encoding="utf-8"))
    return {"bank": {}, "sched": {}, "wrong": [], "last": {}, "submitted": 0, "passed": 0}


def _save(st: dict) -> None:
    PATH.parent.mkdir(parents=True, exist_ok=True)
    PATH.write_text(json.dumps(st, ensure_ascii=False, indent=2), encoding="utf-8")


def _today() -> date:
    return date.today()


def _iso(d: date) -> str:
    return d.isoformat()


# ── prompt ───────────────────────────────────────────────────────────
VARIANT_PROMPT = """为下面的微知识点出 1 道动手练习题（变式：换场景或换数据）。

知识点：{title}
目标：{goal}
{avoid}
判题方式：{judge_desc}

只输出 JSON，格式：
{{"task": "题面，中文，≤120字，说清要写什么代码", "starter": "给学习者的起始代码（可为空字符串）", "judge": {judge_schema}}}
{judge_rules}
题目只考当前这一个知识点，5 分钟内能做完，不引入新知识点。"""

CAUSE_PROMPT = """学习者这道题做错了。用一句话点出他错在哪（错因，不是提示）。

题面：{task}
学习者代码：
{code}
运行结果/错误：
{output}

铁律：≤30 字，中文，只说错因（如"把 == 写成了 = "），不给答案代码，不写套话。"""


# ── 排期 ──────────────────────────────────────────────────────────────
def seed(pack_id: str, point_id: str) -> None:
    """教学循环学完一个点时登记复习表：明天第一次复习。"""
    st = _load()
    if point_id not in st["sched"]:
        st["sched"][point_id] = {
            "pack_id": pack_id, "point_id": point_id,
            "reps": 0, "interval": 1, "due": _iso(_today() + timedelta(days=1)),
        }
        _save(st)


def _sched_pass(st: dict, pack_id: str, point_id: str) -> dict:
    e = st["sched"].get(point_id) or {"pack_id": pack_id, "point_id": point_id, "reps": 0}
    e["reps"] = min(e.get("reps", 0) + 1, len(INTERVALS))
    e["interval"] = INTERVALS[e["reps"] - 1]
    e["due"] = _iso(_today() + timedelta(days=e["interval"]))
    st["sched"][point_id] = e
    return e


def _sched_fail(st: dict, pack_id: str, point_id: str) -> dict:
    e = st["sched"].get(point_id) or {"pack_id": pack_id, "point_id": point_id}
    e["reps"] = 0
    e["interval"] = 1
    e["due"] = _iso(_today() + timedelta(days=1))
    st["sched"][point_id] = e
    return e


def due_list() -> list[dict]:
    st = _load()
    today = _iso(_today())
    out = []
    for e in st["sched"].values():
        if e["due"] <= today:
            tree = packs.load_tree(e["pack_id"])
            p = teach.find_point(tree, e["point_id"]) if tree else None
            if not p:
                continue
            out.append({**e, "title": p["title"], "goal": p["goal"],
                        "overdue": (_today() - date.fromisoformat(e["due"])).days})
    out.sort(key=lambda x: (x["due"], x["point_id"]))
    return out


# ── 题库 ──────────────────────────────────────────────────────────────
async def _generate(pack_id: str, point: dict, avoid: list[str]) -> dict:
    desc, schema, _ = teach._judge_spec(pack_id)
    avoid_txt = ("已出过的题（不要重复）：\n" + "\n".join(f"- {t}" for t in avoid)) if avoid else ""
    raw = await llm.chat(
        [{"role": "user", "content": VARIANT_PROMPT.format(
            title=point["title"], goal=point["goal"], avoid=avoid_txt,
            judge_desc=desc, judge_schema=schema, judge_rules=teach.JUDGE_RULES)}],
        temperature=0.7,
        max_tokens=1500,
    )
    pr = teach._parse_json(raw)
    if not pr.get("task") or not pr.get("judge"):
        raise RuntimeError("练习题结果缺少 task/judge")
    return {"id": "pr" + uuid.uuid4().hex[:8], "pack_id": pack_id, "point_id": point["id"],
            "task": pr["task"], "starter": pr.get("starter", ""), "judge": pr["judge"]}


async def _pick_problem(st: dict, pack_id: str, point: dict) -> dict:
    bank = st["bank"].setdefault(point["id"], [])
    last = st["last"].get(point["id"])
    fresh = [x for x in bank if x["id"] != last]
    if fresh:
        pr = fresh[0]
    else:
        pr = await _generate(pack_id, point, [x["task"] for x in bank])
        bank.append(pr)
        st["bank"][point["id"]] = bank[-BANK_CAP:]
    st["last"][point["id"]] = pr["id"]
    return pr


def _find_problem(st: dict, pack_id: str, problem_id: str) -> dict | None:
    for bank in st["bank"].values():
        for pr in bank:
            if pr["id"] == problem_id and pr["pack_id"] == pack_id:
                return pr
    for w in st["wrong"]:
        if w["problem_id"] == problem_id and w["pack_id"] == pack_id:
            return {"id": w["problem_id"], "pack_id": pack_id, "point_id": w["point_id"],
                    "task": w["task"], "starter": w.get("starter", ""), "judge": w["judge"]}
    return None


# ── 错题本 ────────────────────────────────────────────────────────────
def _wrong_upsert(st: dict, pack_id: str, point: dict, pr: dict, code: str, hint: str, output: str) -> dict:
    w = next((x for x in st["wrong"] if x["problem_id"] == pr["id"]), None)
    if w is None:
        w = {"id": "wr" + uuid.uuid4().hex[:8], "pack_id": pack_id, "point_id": point["id"],
             "problem_id": pr["id"], "task": pr["task"], "starter": pr.get("starter", ""),
             "judge": pr["judge"], "cause": "", "count": 0,
             "first": _iso(_today()), "code": "", "hint": ""}
        st["wrong"].append(w)
    w["count"] += 1
    w["last"] = _iso(_today())
    w["code"] = code[:600]
    w["hint"] = hint[:200]
    return w


async def _cause(task: str, code: str, output: str) -> str:
    try:
        txt = await llm.chat(
            [{"role": "user", "content": CAUSE_PROMPT.format(task=task, code=code[:1200], output=output[:600])}],
            temperature=0.2,
            max_tokens=120,
        )
        return txt.strip().splitlines()[0][:30]
    except Exception as e:
        print(f"[practice] 错因生成失败: {type(e).__name__}: {e}")
        return ""


def wrong_list() -> list[dict]:
    st = _load()
    out = []
    for w in st["wrong"]:
        tree = packs.load_tree(w["pack_id"])
        p = teach.find_point(tree, w["point_id"]) if tree else None
        out.append({**w, "title": p["title"] if p else w["point_id"],
                    "pack_name": packs.PACKS.get(w["pack_id"], {}).get("name", w["pack_id"])})
    out.sort(key=lambda x: x.get("last", x["first"]), reverse=True)
    return out


def wrong_remove(wrong_id: str) -> bool:
    st = _load()
    n = len(st["wrong"])
    st["wrong"] = [w for w in st["wrong"] if w["id"] != wrong_id]
    _save(st)
    return len(st["wrong"]) < n


# ── 动作 ──────────────────────────────────────────────────────────────
async def next_problem(mode: str, pack_id: str | None = None, point_id: str | None = None,
                       wrong_id: str | None = None) -> dict:
    st = _load()
    if mode == "wrong":
        w = next((x for x in st["wrong"] if x["id"] == wrong_id), None) if wrong_id else (st["wrong"] or [None])[0]
        if not w:
            raise ValueError("错题本是空的")
        pr = {"id": w["problem_id"], "pack_id": w["pack_id"], "point_id": w["point_id"],
              "task": w["task"], "starter": w.get("starter", ""), "judge": w["judge"]}
        point = teach.find_point(packs.load_tree(w["pack_id"]), w["point_id"])
        return {"mode": "wrong", "wrong_id": w["id"], "problem": pr, "point": point,
                "pack_id": w["pack_id"], "cause": w.get("cause", ""), "count": w["count"]}
    if mode == "due":
        dues = due_list()
        if point_id:
            dues = [d for d in dues if d["point_id"] == point_id] or dues
        if not dues:
            raise ValueError("今天没有到期的复习点")
        pick = next((d for d in dues if d["point_id"] == point_id), dues[0]) if point_id else dues[0]
        pack_id, point_id = pick["pack_id"], pick["point_id"]
    if not pack_id or not point_id:
        raise ValueError("节点刷题需要 pack_id 与 point_id")
    tree = packs.load_tree(pack_id)
    if not tree:
        raise ValueError("语言包未就绪：先安装并生成技能树")
    point = teach.find_point(tree, point_id)
    if not point:
        raise ValueError(f"技能树里没有点 {point_id}")
    pr = await _pick_problem(st, pack_id, point)
    _save(st)
    e = st["sched"].get(point_id)
    return {"mode": mode, "problem": pr, "point": point, "pack_id": pack_id,
            "sched": {"reps": e["reps"], "interval": e["interval"], "due": e["due"]} if e else None}


async def submit(pack_id: str, problem_id: str, code: str, wrong_id: str | None = None) -> dict:
    st = _load()
    pr = _find_problem(st, pack_id, problem_id)
    if not pr:
        raise ValueError("题目不存在或已过期，请换一题")
    tree = packs.load_tree(pack_id)
    point = teach.find_point(tree, pr["point_id"])
    if not point:
        raise ValueError("技能树里没有这道题的知识点")
    judge = pr["judge"]
    output = ""
    if judge["mode"] == "sandbox":
        lang = teach._judge_spec(pack_id)[2]
        full = teach._sandbox_full(code, judge.get("append", ""), lang)
        r = await runner.run_code(full, lang, timeout=15)
        output = r["output"]
        passed = bool(r["ok"]) and "ALL_PASS" in output
    else:
        raw = await llm.chat(
            [{"role": "user", "content": teach.AI_JUDGE_PROMPT.format(
                task=pr["task"], checklist=json.dumps(judge.get("checklist", []), ensure_ascii=False), code=code)}],
            temperature=0.1,
            max_tokens=400,
        )
        verdict = teach._parse_json(raw)
        passed = bool(verdict.get("pass"))
        output = verdict.get("hint", "")
    st["submitted"] = st.get("submitted", 0) + 1
    if passed:
        st["passed"] = st.get("passed", 0) + 1
        e = _sched_pass(st, pack_id, pr["point_id"])
        removed = False
        if wrong_id:
            n = len(st["wrong"])
            st["wrong"] = [w for w in st["wrong"] if w["id"] != wrong_id]
            removed = len(st["wrong"]) < n
        _save(st)
        return {"pass": True, "hint": "", "output": output[:2000],
                "sched": {"reps": e["reps"], "interval": e["interval"], "due": e["due"]},
                "wrong_removed": removed}
    if judge["mode"] == "sandbox":
        hint = (await llm.chat(
            [{"role": "user", "content": teach.HINT_PROMPT.format(task=pr["task"], code=code, output=output[:1500])}],
            temperature=0.3,
            max_tokens=300,
        )).strip()
    else:
        hint = output or "再核对一下检查项。"
    w = _wrong_upsert(st, pack_id, point, pr, code, hint, output)
    if not w["cause"]:
        w["cause"] = await _cause(pr["task"], code, output)
    e = _sched_fail(st, pack_id, pr["point_id"])
    _save(st)
    return {"pass": False, "hint": hint, "output": output[:2000], "wrong_id": w["id"],
            "cause": w["cause"], "count": w["count"],
            "sched": {"reps": e["reps"], "interval": e["interval"], "due": e["due"]}}


async def hint(pack_id: str, problem_id: str, code: str) -> dict:
    """只要提示不判题：不记错题、不动排期。提示锁同教学循环：只指方向不给答案。"""
    st = _load()
    pr = _find_problem(st, pack_id, problem_id)
    if not pr:
        raise ValueError("题目不存在或已过期，请换一题")
    output = ""
    if pr["judge"]["mode"] == "sandbox":
        lang = teach._judge_spec(pack_id)[2]
        r = await runner.run_code(code, lang, timeout=15)
        output = r["output"]
    txt = await llm.chat(
        [{"role": "user", "content": teach.HINT_PROMPT.format(task=pr["task"], code=code, output=output[:1500])}],
        temperature=0.3,
        max_tokens=300,
    )
    return {"hint": txt.strip(), "output": output[:2000]}


def overview() -> dict:
    st = _load()
    dues = due_list()
    packs_out = []
    for pid, meta in packs.PACKS.items():
        tree = packs.load_tree(pid)
        if not tree:
            continue
        pts = teach.flatten(tree)
        learned = teach.progress(pid)["done"]
        packs_out.append({"id": pid, "name": meta["name"], "total": len(pts),
                          "learned": len(learned),
                          "due": sum(1 for d in dues if d["pack_id"] == pid),
                          "wrong": sum(1 for w in st["wrong"] if w["pack_id"] == pid)})
    return {"due": dues, "due_count": len(dues), "wrong_count": len(st["wrong"]),
            "submitted": st.get("submitted", 0), "passed": st.get("passed", 0),
            "packs": packs_out}