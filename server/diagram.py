"""示意图工具：讲解生成后自动判定是否需要图示，改用 Mermaid 声明式结构 + 前端自动布局。

为什么换掉手写 SVG：旧方案让模型写死每个方框/文字/箭头的绝对坐标，没有布局引擎，
模型不擅长空间排版 → 文字重叠、方框错位、箭头乱穿（观感凌乱）。
Mermaid 只让模型描述"结构"（节点/连线/标签/嵌套），由 dagre 布局引擎保证整齐对齐。

契约（与全站配色纪律同源，见 web/src/index.css）：
- 模型只输出 flowchart TB/LR 结构，节点用 :::action/:::data/:::plain 三个语义类；
- 色族 classDef 由服务端统一追加（暖纸底 + 陶土红动作 + 灰绿数据 + 墨文字），模型不写颜色；
- 禁 click/href/style/classDef/linkStyle/脚本/外链；节点/连线/嵌套/标签字数设上限；
- 服务端白名单校验，不合格带原因重试一次，仍不合格放弃图示（讲解不受影响）。
前端 web/src/diagram.js 懒加载 mermaid 渲染；旧会话里已存的手写 SVG 仍按原样直出（向后兼容）。
对话侧同一色族契约打包为 Qoder skill：code-svg-diagram（仍用 SVG）。
"""
from __future__ import annotations

import re

from . import llm
from .config import load_settings

# 语义色族 classDef（hex 与 index.css 同源）：服务端统一追加，保证配色纪律
MERMAID_CLS = (
    "\n  classDef action fill:#d29a86,stroke:#9d5f50,color:#262219,stroke-width:1px;"
    "\n  classDef data fill:#9dbba6,stroke:#5c7a67,color:#262219,stroke-width:1px;"
    "\n  classDef plain fill:#fbf9f3,stroke:#d6cfc2,color:#262219,stroke-width:1px;"
)
ALLOWED_CLASSES = {"action", "data", "plain"}

MAX_NODES = 14
MAX_EDGES = 16
MAX_SUBGRAPH = 4
MAX_DEPTH = 3
MAX_LABEL = 18
MAX_CHARS = 2400

# 出现即判不合格（安全 / 配色 / 布局失控相关）
FORBIDDEN = ("click", "href", "linkstyle", "classdef", "style ", "init:",
             "%%", "javascript:", "<script", "url(", "```")

DIAGRAM_PROMPT = """下面是一个编程微知识点的讲解。判断它是否需要一张示意图帮助理解
（流程走向 / 变量与内存结构 / 调用关系 / 前后对比 / 结构层次 这类"文字说不清"的内容）。
需要就输出一段 Mermaid flowchart 结构；不需要（纯概念一句话就懂）就只输出 NONE。

知识点：{title}
目标：{goal}
讲解：
{explain}

Mermaid 硬契约（违反即废）：
1. 只输出 Mermaid 源码或 NONE，不要解释、不要代码围栏。
2. 第一行只能是 flowchart TB 或 flowchart LR（上下 / 左右布局二选一）。
3. 节点写法 id["中文标签"]，标签≤12 个汉字；id 用短英文字母。
4. 语义类只用三个：:::action（当前/动作/强调）、:::data（数据/完成/通过）、:::plain（普通）。
   例：A["浏览器"]:::plain  B["执行 JS"]:::action
5. 连线用 -->（有向）或 ---（无向）；连线标签用 -- "文字" --> 或 -->|文字|，标签≤10 字。
6. 嵌套容器用 subgraph id["标题"] ... end，最多 3 层、最多 4 个容器（适合盒模型/包含关系）。
7. 节点≤12 个、连线≤14 条；图要一眼看懂，不堆装饰。
8. 禁止 click / href / style / classDef / linkStyle / 脚本 / 外链 / 颜色值（颜色由系统统一加）。"""


def validate_mermaid(text: str) -> tuple[bool, str]:
    """白名单校验。合格返回 (True, 追加色族 classDef 后的 spec)；不合格返回 (False, 原因)。"""
    t = (text or "").strip()
    if not t:
        return False, "空内容"
    if len(t) > MAX_CHARS:
        return False, f"超过 {MAX_CHARS} 字符"
    low = t.lower()
    for tok in FORBIDDEN:
        if tok in low:
            return False, f"禁用内容 {tok.strip()}"
    lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
    if not re.fullmatch(r"flowchart\s+(TB|LR)", lines[0], re.IGNORECASE):
        return False, "首行必须是 flowchart TB 或 flowchart LR"
    # 嵌套深度与容器数
    depth = 0
    n_sub = 0
    for ln in lines[1:]:
        if ln.lower().startswith("subgraph"):
            n_sub += 1
            depth += 1
            if depth > MAX_DEPTH:
                return False, f"嵌套超过 {MAX_DEPTH} 层"
            if n_sub > MAX_SUBGRAPH:
                return False, f"容器超过 {MAX_SUBGRAPH} 个"
        elif ln.lower() == "end":
            depth -= 1
            if depth < 0:
                return False, "end 与 subgraph 不配对"
    if depth != 0:
        return False, "subgraph 未闭合"
    # 语义类白名单
    for cls in re.findall(r":::([A-Za-z0-9_]+)", t):
        if cls not in ALLOWED_CLASSES:
            return False, f"语义类 {cls} 不在 action/data/plain"
    # 节点 / 连线 / 标签
    labels = re.findall(r'\["([^"]*)"\]', t)
    labels += re.findall(r'--\s*"([^"]*)"\s*-->', t)
    labels += [x.strip() for x in re.findall(r"\|([^|]*)\|", t)]
    n_nodes = len(re.findall(r'\["', t))
    n_edges = len(re.findall(r"-->|---", t))
    if n_nodes == 0:
        return False, "没有节点"
    if n_nodes > MAX_NODES:
        return False, f"节点超过 {MAX_NODES} 个"
    if n_edges > MAX_EDGES:
        return False, f"连线超过 {MAX_EDGES} 条"
    for lb in labels:
        if len(lb.strip()) > MAX_LABEL:
            return False, f"标签超过 {MAX_LABEL} 字：{lb[:12]}…"
    return True, t + MERMAID_CLS


def _extract(raw: str) -> str | None:
    t = (raw or "").strip()
    t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    if t.upper().startswith("NONE"):
        return None
    i = t.lower().find("flowchart")
    if i >= 0:
        return t[i:]
    # 不含 flowchart 的杂散输出：交给校验判不合格并触发重试，而非误当"不需要图"
    return t or None


async def maybe_diagram(title: str, goal: str, explain: str) -> str | None:
    """自动调用入口：需要图就返回校验过的 Mermaid spec，不需要或两次不合格返回 None。"""
    model = load_settings()["models"]["task"]
    messages = [{"role": "user", "content": DIAGRAM_PROMPT.format(
        title=title, goal=goal, explain=explain[:2000])}]
    raw = await llm.chat(messages, model=model, temperature=0.3, max_tokens=900)
    for attempt in range(2):
        spec = _extract(raw)
        if spec is None:
            return None
        ok, res = validate_mermaid(spec)
        if ok:
            return res
        if attempt == 0:
            messages += [
                {"role": "assistant", "content": raw},
                {"role": "user", "content": f"校验不合格：{res}。按契约重新生成 Mermaid，或输出 NONE。"},
            ]
            raw = await llm.chat(messages, model=model, temperature=0.2, max_tokens=900)
    return None