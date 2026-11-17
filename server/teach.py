"""微知识点教学循环：讲解→出题→纠错→巩固→下一个，小节小总结/模块大总结。

防灌输四锁：prompt 硬约束字数与单点、单卡 UI、用户按钮推进、判题只给提示不给答案。
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from . import diagram, kb, llm, notes, packs, runner
from .config import DATA_DIR, load_settings

SESSION_DIR = DATA_DIR / "sessions"

SANDBOX_LANG = {"python": "python", "javascript": "javascript", "typescript": "typescript",
                "c": "c", "cpp": "cpp", "go": "go", "rust": "rust", "csharp": "csharp"}

# 编译型语言：判题代码进不了学习者进程，改两阶段（先跑学习者拿输出，再跑注入 _mt_out 的判题程序）
COMPILED_LANG = {"c", "cpp", "go", "rust", "csharp"}


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
- c/cpp/go/rust/csharp（编译型，同属 sandbox）：平台先单独运行学习者代码捕获输出，再把输出注入判题程序的 _mt_out 字符串；append 是判题语句序列（平台已包好 main 与常用导入/辅助函数），只能靠 _mt_out 判断（包含/相等/行数等），引用不到学习者的变量和函数。因此题面必须要求学习者把结果打印到 stdout。平台只运行单个源文件，不支持多文件编译/链接或手动编译步骤，题目必须能用一个源文件完成。append 最后一行输出 ALL_PASS：c 用 printf 或 puts，cpp 用 printf 或 std::cout，go 用 fmt.Println，rust 用 println!，csharp 用 Console.WriteLine。
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

ASK_SYSTEM = (
    "你是 MyTutor 的编程微课老师，正在讲当前这一个微知识点。学习者就这个点提问，你像老师一样当面解答。铁律：\n"
    "1. 只围绕当前这个微知识点回答，不展开相邻或后续知识点，不给知识总览；\n"
    "2. 中文口语化、直给，正文不超过 200 字，不要开场白和结尾套话；\n"
    "3. 需要时最多给一个不超过 8 行的小示例帮助理解，不写完整程序；\n"
    "4. 以官方资料摘录和已讲内容为准，资料没写的 API 细节不要编造；\n"
    "5. 问题若超出当前点，一句话点明它属于后面的点、现在先不展开，再把学习者引回当前点。"
)

ASK_PROMPT = """当前微知识点：{title}
目标：{goal}
已讲内容：
{explain}

官方资料摘录：
{rag}

学习者的问题：{question}

像老师一样直接解答这个问题。"""

CLARIFY_SYSTEM = (
    "你是 MyTutor 的编程微课老师。学习者读不懂题面，你帮他把题目读明白，而不是替他做。铁律：\n"
    "1. 只解释这道题在问什么、要做出什么结果、有哪几个关键要求；\n"
    "2. 绝不给答案代码、完整实现或判题断言；最多点一句思路方向；\n"
    "3. 中文口语化、直给，不超过 150 字，不要开场白和结尾套话；\n"
    "4. 只围绕当前这一个微知识点和这道题，不展开其他内容。"
)

CLARIFY_PROMPT = """学习者看不懂这道题在问什么。请用大白话帮他读懂题目。

知识点：{title}
目标：{goal}
题面：{task}
已讲内容：
{explain}

说清题目要他做什么、结果应是什么样、关键要求；可点一句思路方向，但不给答案代码。"""


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
        if runtime in COMPILED_LANG:
            return (
                "sandbox（编译型语言两阶段判题：先运行学习者代码捕获输出，判题程序只拿到 _mt_out 输出字符串）",
                SANDBOX_SCHEMA,
                SANDBOX_LANG[runtime],
            )
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


def _compiled_judge_source(lang: str, output: str, append: str) -> str:
    """编译型语言判题底座：独立程序，_mt_out = 学习者运行输出（字符串常量注入）。

    与 python/js 底座同一思想——输出捕获由平台做，不靠模型自觉；
    模型只写断言语句，平台包 main、导入与辅助函数。
    """
    out = (output or "")[:4000]
    esc = (out.replace("\\", "\\\\").replace('"', '\\"')
              .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t"))
    if lang == "c":
        return (
            "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <assert.h>\n"
            f'static const char *_mt_out = "{esc}";\n'
            "int main(void){\n" + append + "\nreturn 0;\n}\n"
        )
    if lang == "cpp":
        return (
            "#include <cstdio>\n#include <cstdlib>\n#include <cstring>\n#include <cassert>\n#include <string>\n"
            f'static const std::string _mt_out = "{esc}";\n'
            "int main(){\n" + append + "\nreturn 0;\n}\n"
        )
    if lang == "go":
        return (
            "package main\n\nimport (\n\t\"fmt\"\n\t\"strings\"\n\t\"os\"\n\t\"strconv\"\n)\n\n"
            f'var _mt_out = "{esc}"\n'
            "var _ = fmt.Sprintf\nvar _ = strings.Contains\nvar _ = os.Getenv\nvar _ = strconv.Itoa\n"
            "func _mt_has(s string) bool { return strings.Contains(_mt_out, s) }\n"
            "func main(){\n" + append + "\n}\n"
        )
    if lang == "rust":
        return (
            "fn main(){\n"
            f'let _mt_out: &str = "{esc}";\n'
            "let _mt_has = |s: &str| _mt_out.contains(s);\n" + append + "\n}\n"
        )
    # csharp：verbatim 字符串，双引号翻倍，换行原样保留
    ver = out.replace('"', '""')
    return (
        "using System;\nusing System.Linq;\nusing System.Collections.Generic;\n"
        "static class _MtJudge{\nstatic void Main(){\n"
        f'string _mt_out = @"{ver}";\n' + append + "\n}\n}\n"
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
    # 示意图自动调用：需要图就生成（白名单校验+一次重试），失败降级为无图，不影响讲解
    diagram_svg = None
    try:
        diagram_svg = await diagram.maybe_diagram(p["title"], p["goal"], explain.strip())
    except Exception as e:
        print(f"[teach] 示意图生成失败，降级无图: {type(e).__name__}: {e}")
    s.update({"point_id": p["id"], "step": "explain", "explain": explain.strip(),
              "diagram": diagram_svg,
              "exercise": None, "consolidate": None, "hint": None, "attempts": 0, "summary": None,
              "hint_log": [], "qa": [], "task_hint": None})
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
    s.update({"step": "exercise", "exercise": ex, "hint": None, "attempts": 0, "task_hint": None})
    save_session(s)
    return s


async def ask(pack_id: str, question: str) -> dict:
    """讲解阶段像老师一样答疑：只围绕当前点，简洁，不灌输相邻点，不给后续答案。

    问答存进会话 qa（最多留 8 轮），刷新/换电脑仍在；进入出题阶段后前端不再显示提问框。
    """
    s = load_session(pack_id)
    if not s or s.get("step") != "explain":
        raise ValueError("提问只在讲解阶段可用")
    q = (question or "").strip()
    if not q:
        raise ValueError("问题不能为空")
    q = q[:300]
    tree = packs.load_tree(pack_id)
    p = find_point(tree, s["point_id"])
    if not p:
        raise ValueError("当前知识点不存在")
    rag_content = ""
    try:
        rag = await kb.search(pack_id, q, top_k=2)
        rag_content = (rag.get("content") or "")[:2500]
    except Exception:
        rag_content = ""  # 检索失败降级：仍靠已讲内容作答，不阻断答疑
    answer = await llm.chat(
        [
            {"role": "system", "content": ASK_SYSTEM},
            {"role": "user", "content": ASK_PROMPT.format(
                title=p["title"], goal=p["goal"], explain=s.get("explain", ""),
                rag=rag_content or "（无）", question=q)},
        ],
        temperature=0.4,
        max_tokens=700,
    )
    qa = s.get("qa") or []
    qa.append({"q": q, "a": answer.strip()})
    s["qa"] = qa[-8:]
    save_session(s)
    return s


async def clarify(pack_id: str) -> dict:
    """出题阶段「题目提示」：帮学习者读懂题面，不替他把题做了。

    与答错后的 hint（指方向纠错）不同：这里只解释题目在问什么、关键要求，
    绝不给答案代码或判题断言。task_hint 存会话，刷新仍在；换新题时清空。
    """
    s = load_session(pack_id)
    if not s or s.get("step") not in ("exercise", "correcting", "consolidate", "consolidate_correcting"):
        raise ValueError("题目提示只在出题/巩固阶段可用")
    is_cons = s["step"].startswith("consolidate")
    ex = s["consolidate"] if is_cons else s["exercise"]
    if not ex or not ex.get("task"):
        raise ValueError("当前没有题目")
    tree = packs.load_tree(pack_id)
    p = find_point(tree, s["point_id"])
    if not p:
        raise ValueError("当前知识点不存在")
    text = await llm.chat(
        [
            {"role": "system", "content": CLARIFY_SYSTEM},
            {"role": "user", "content": CLARIFY_PROMPT.format(
                title=p["title"], goal=p["goal"], task=ex["task"], explain=s.get("explain", ""))},
        ],
        temperature=0.4,
        max_tokens=400,
    )
    s["task_hint"] = text.strip()
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
        if lang in COMPILED_LANG:
            # 两阶段：先跑学习者拿输出，再跑注入 _mt_out 的独立判题程序
            r1 = await runner.run_code(code, lang, timeout=30)
            output = r1["output"]
            if r1["ok"]:
                jsrc = _compiled_judge_source(lang, output, judge.get("append", ""))
                r2 = await runner.run_code(jsrc, lang, timeout=30)
                passed = bool(r2["ok"]) and "ALL_PASS" in r2["output"]
                if not passed:
                    output = (output + "\n[判题] " + r2["output"])[:2000]
            else:
                # 学习者代码编译/运行就失败，没必要再编译判题程序
                passed = False
        else:
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
            s.update({"step": "consolidate", "consolidate": cons, "task_hint": None})
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