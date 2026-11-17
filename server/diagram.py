"""SVG 示意图工具：讲解生成后自动判定是否需要图示，按严格契约生成并白名单校验。

契约（与全站配色纪律同源，见 web/src/index.css）：
- 只允许色族内的颜色（暖纸中性 + 陶土红 + 灰绿 + 夜黑），纯矢量；
- 禁脚本 / 事件属性 / style / 外链 / foreignObject / image / use；
- 服务端用 stdlib XML 白名单校验，不合格带原因重试一次，仍不合格放弃图示（讲解不受影响）。
对话侧同一契约打包为 Qoder skill：code-svg-diagram。
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from . import llm
from .config import load_settings

SVG_NS = "http://www.w3.org/2000/svg"

# 色族白名单（hex 小写）+ 无色
PALETTE = {
    "#f1eee6", "#e8e4d8", "#fbf9f3",          # 暖纸：底 / 深底 / 卡面
    "#262219", "#5c564e", "#9a9287", "#d6cfc2",  # 墨：正文 / 次 / 淡 / 线
    "#b3705f", "#9d5f50", "#d29a86",          # 陶土红：主 / 深 / 亮
    "#6d8a77", "#5c7a67", "#9dbba6",          # 灰绿：主 / 深 / 亮
    "#171310", "#241e18",                    # 夜黑：仅深色底
    "none", "transparent",
}

TAGS = {
    "svg", "title", "desc", "defs", "g", "rect", "circle", "ellipse", "line",
    "path", "polyline", "polygon", "text", "tspan", "marker",
    "linearGradient", "radialGradient", "stop",
}

ATTRS = {
    "id", "transform", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy",
    "r", "rx", "ry", "width", "height", "points", "fill", "stroke",
    "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
    "opacity", "fill-opacity", "stroke-opacity", "font-size", "font-family",
    "font-weight", "text-anchor", "dominant-baseline", "dx", "dy",
    "viewBox", "xmlns", "preserveAspectRatio", "marker-end", "marker-start",
    "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
    "fx", "fy", "aria-hidden", "role", "orient", "markerWidth", "markerHeight",
    "refX", "refY", "markerUnits", "overflow", "visibility",
}

# 出现即判不合格（安全相关），其余未知属性静默丢弃
FORBIDDEN_ATTRS = {"style", "href", "xlink:href", "class"}

COLOR_ATTRS = {"fill", "stroke", "stop-color"}
URL_REF = re.compile(r"^url\(#[A-Za-z0-9_-]+\)$")
FONTS = {"sans-serif", "monospace"}
WEIGHTS = {"normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"}

MAX_BYTES = 60_000
MAX_NODES = 240
MAX_VIEW_W, MAX_VIEW_H = 720, 440
MAX_LABEL = 40

DIAGRAM_PROMPT = """下面是一个编程微知识点的讲解。判断它是否需要一张示意图帮助理解
（流程走向 / 变量与内存结构 / 调用关系 / 前后对比 / 结构层次 这类"文字说不清"的内容）。
需要就画一张 SVG；不需要（纯概念一句话就懂）就只输出 NONE。

知识点：{title}
目标：{goal}
讲解：
{explain}

SVG 硬契约（违反即废）：
1. 只输出 SVG 源码或 NONE，不要解释、不要代码围栏。
2. 根元素 <svg viewBox="0 0 W H">，W≤720、H≤440，不写 width/height。
3. 只用这些元素：svg title desc defs g rect circle ellipse line path polyline polygon text tspan marker linearGradient radialGradient stop。
4. 颜色只能用下列值（fill/stroke/stop-color）：
   暖纸 #f1eee6 #e8e4d8 #fbf9f3；墨 #262219 #5c564e #9a9287 #d6cfc2；
   陶土红 #b3705f #9d5f50 #d29a86；灰绿 #6d8a77 #5c7a67 #9dbba6；夜黑 #171310 #241e18；none transparent。
   语义：陶土红=当前/动作/强调，灰绿=完成/数据/通过，墨=文字与线，暖纸=底与卡片。
5. 文字 font-size≥12、font-family 只用 sans-serif 或 monospace；每个标签≤10 个汉字；中文。
6. 禁止 script/style/foreignObject/image/use/a、on* 事件属性、style 属性、任何外链。
7. 元素总数≤60；布局留白充足，箭头用 marker 或 path 手绘；图要一眼看懂，不堆装饰。"""


def _local(name: str) -> str:
    return name.split("}")[-1]


def validate_svg(text: str) -> tuple[bool, str]:
    """白名单校验。合格返回 (True, 清理后的 SVG)；不合格返回 (False, 原因)。"""
    if len(text.encode("utf-8")) > MAX_BYTES:
        return False, f"SVG 超过 {MAX_BYTES} 字节"
    if "<!DOCTYPE" in text or "<!ENTITY" in text:
        return False, "含 DOCTYPE/ENTITY"
    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        return False, f"XML 解析失败: {e}"
    if _local(root.tag) != "svg":
        return False, "根元素不是 svg"
    vb = (root.get("viewBox") or "").replace(",", " ").split()
    if len(vb) != 4:
        return False, "缺少合法 viewBox"
    try:
        _, _, w, h = (float(v) for v in vb)
    except ValueError:
        return False, "viewBox 非数字"
    if not (0 < w <= MAX_VIEW_W and 0 < h <= MAX_VIEW_H):
        return False, f"viewBox 尺寸越界（≤{MAX_VIEW_W}×{MAX_VIEW_H}）"

    nodes = 0
    for el in root.iter():
        nodes += 1
        if nodes > MAX_NODES:
            return False, f"元素超过 {MAX_NODES} 个"
        tag = _local(el.tag)
        if tag not in TAGS:
            return False, f"禁用元素 <{tag}>"
        for attr in list(el.attrib):
            name = _local(attr)
            low = name.lower()
            if low.startswith("on") or name in FORBIDDEN_ATTRS:
                return False, f"禁用属性 {name}"
            if name not in ATTRS:
                del el.attrib[attr]
                continue
            val = (el.attrib[attr] or "").strip()
            if name in COLOR_ATTRS:
                v = val.lower()
                if v not in PALETTE and not URL_REF.match(v):
                    return False, f"色族外颜色 {val}（{name}）"
            if name == "font-size":
                try:
                    if float(val) < 12:
                        return False, f"字号 {val} 小于 12"
                except ValueError:
                    return False, f"字号非数字 {val}"
            if name == "font-family" and val not in FONTS:
                return False, f"字体 {val} 不在 sans-serif/monospace"
            if name == "font-weight" and val not in WEIGHTS:
                return False, f"字重 {val} 不合法"
        if tag in ("text", "tspan"):
            if not el.get("font-size"):
                el.set("font-size", "13")
            if not el.get("font-family"):
                el.set("font-family", "sans-serif")
            for piece in (el.text, el.tail):
                if piece and len(piece.strip()) > MAX_LABEL:
                    return False, "文字标签超过 40 字"
    root.attrib.pop("width", None)
    root.attrib.pop("height", None)
    ET.register_namespace("", SVG_NS)
    return True, ET.tostring(root, encoding="unicode")


def _extract(raw: str) -> str | None:
    t = (raw or "").strip()
    t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    if t.upper().startswith("NONE"):
        return None
    i, j = t.find("<svg"), t.rfind("</svg>")
    if i < 0 or j < 0:
        return None
    return t[i:j + 6]


async def maybe_diagram(title: str, goal: str, explain: str) -> str | None:
    """自动调用入口：需要图就返回校验过的 SVG，不需要或两次不合格返回 None。"""
    model = load_settings()["models"]["task"]
    messages = [{"role": "user", "content": DIAGRAM_PROMPT.format(
        title=title, goal=goal, explain=explain[:2000])}]
    raw = await llm.chat(messages, model=model, temperature=0.3, max_tokens=1600)
    for attempt in range(2):
        svg = _extract(raw)
        if svg is None:
            return None
        ok, res = validate_svg(svg)
        if ok:
            return res
        if attempt == 0:
            messages += [
                {"role": "assistant", "content": raw},
                {"role": "user", "content": f"校验不合格：{res}。按契约重新生成 SVG，或输出 NONE。"},
            ]
            raw = await llm.chat(messages, model=model, temperature=0.2, max_tokens=1600)
    return None