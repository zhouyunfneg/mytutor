"""零基础课程种子：把人工设计的教学主线编码为确定性技能树。

为什么需要它：旧技能树由"官方文档页面清单"喂给 AI 自由生成，AI 照搬文档目录
顺序≠学习顺序，对纯新手笼统跳跃。这里把经过实读教程、按零基础学习顺序排好的
主线固定下来（框架驱动），文档退居讲解时的事实校验，AI 不再决定课程结构。

来源教程：qianguyihao/Web《千古前端图文教程》（CC BY-NC-SA 4.0）。
许可红线：只借鉴"教学顺序/知识点划分"（思想范畴），不搬运原文；讲解由 AI 用
大白话重述，官方/教程资料仅作事实校验与出处引用。本文件只含中文知识点标题/目标，
不含教程原文，可入公开仓库；生成的 tree.json 落 data/（gitignore，不公开）。

每个 point 字段：
  id      m{模块}s{小节}p{点}
  title   中文知识点名
  goal    一句话学习目标
  why     一句大白话"为什么学这个点"
  prereq  先修点 id 列表（讲解时带一句话回顾）
  level   入门 / 进阶
  ref     教程出处章节（仅溯源，不展示原文）
  docs    支撑该点的官方文档 URL（best-effort 从已抓索引匹配，可为空）
"""
from __future__ import annotations

from typing import Any

# 教程出处基址（溯源用）
_TUTORIAL = "https://github.com/qianguyihao/Web"

# 主线：模块 → 小节 → 点。点 = (title, goal, why, prereq, level, ref)
# prereq 用 id 字符串列表；id 由 build_tree 按 m{s}p 顺序生成，与蓝图编号一致。
_HTML_CSS: list[tuple[str, list[tuple[str, list[tuple]]]]] = [
    ("走进网页世界", [
        ("网页是怎么来的", [
            ("什么是网页 / 网站 / Web", "说清网页是构成网站的基本元素", "先有整体印象才不迷路", [], "入门", "01-HTML/01"),
            ("浏览器做什么", "知道浏览器是网页的运行 / 渲染平台", "明白代码靠谁显示出来", ["m1s1p1"], "入门", "01-HTML/02"),
            ("HTML / CSS / JS 三层分工", "用身体 / 衣服 / 行为类比记住三者职责", "建立前端全局地图", ["m1s1p2"], "入门", "01-HTML/01"),
        ]),
        ("动手前的准备", [
            ("编辑器与第一个 .html 文件", "会用编辑器新建并保存 .html", "迈出动手第一步", ["m1s1p3"], "入门", "01-HTML/03"),
            ("用浏览器打开你的网页", "会双击 / 拖入浏览器看效果", "看到自己的成果形成正反馈", ["m1s2p1"], "入门", "01-HTML/03"),
            ("看懂开发者工具与报错", "会开 F12 看 Elements / Console", "以后排错有抓手", ["m1s2p2"], "入门", "00-前端工具/chrome"),
        ]),
        ("HTML 第一印象", [
            ("HTML 是标记语言不是编程语言", "理解 HTML 描述语义、无需编译", "纠正“HTML 是编程”的误解", ["m1s2p3"], "入门", "01-HTML/03"),
            ("标签 / 元素 / 属性", "分清标签对儿与单标签、属性写法", "看懂一切 HTML 的基本单元", ["m1s3p1"], "入门", "01-HTML/03"),
            ("网页骨架 html / head / body", "会写最小完整骨架", "每个网页都从这套骨架开始", ["m1s3p2"], "入门", "01-HTML/03"),
            ("注释与缩进", "会写注释、规范缩进", "写给人看的代码才好维护", ["m1s3p3"], "入门", "01-HTML/03"),
        ]),
    ]),
    ("HTML 常用标签", [
        ("排版文字", [
            ("标题 h1~h6", "按语义选标题层级", "标题是结构不是字号", ["m1s3p3"], "入门", "01-HTML/04"),
            ("段落 p 与 br / hr", "会分段、换行、分隔", "组织正文的基本手段", ["m2s1p1"], "入门", "01-HTML/04"),
            ("强调 strong / em", "用语义强调而非纯样式", "强调也有语义", ["m2s1p2"], "入门", "01-HTML/05"),
            ("实体字符与空白折叠", "会用 &nbsp; 等、懂空白折叠", "解释“为什么空格没生效”", ["m2s1p3"], "入门", "01-HTML/04,07"),
        ]),
        ("链接与图片", [
            ("超链接 a 与 href", "会写可跳转链接", "网页互联的核心", ["m2s1p4"], "入门", "01-HTML/05"),
            ("锚点与 target", "会页内锚点与新窗口打开", "控制跳转行为", ["m2s2p1"], "入门", "01-HTML/05"),
            ("图片 img：src / alt", "会插图并写替代文本", "图片是可访问的内容", ["m2s2p2"], "入门", "01-HTML/06"),
            ("相对路径与绝对路径", "分清两种路径写法", "解决“图片为什么不显示”", ["m2s2p3"], "入门", "01-HTML/06,07"),
        ]),
        ("列表与表格", [
            ("无序 / 有序列表 ul / ol / li", "会写两种列表", "组织并列 / 有序信息", ["m2s2p4"], "入门", "01-HTML/07"),
            ("定义列表 dl / dt / dd", "会用定义列表", "术语-解释成对场景", ["m2s3p1"], "入门", "01-HTML/07"),
            ("表格 table / tr / td / th", "会写基本表格", "呈现二维数据", ["m2s3p2"], "入门", "01-HTML/07"),
            ("表格合并 colspan / rowspan", "会合并单元格", "复杂表格的基本功", ["m2s3p3"], "入门", "01-HTML/07"),
        ]),
        ("容器与语义", [
            ("div 与 span", "分清块级 / 行内容器", "布局与样式挂载点", ["m2s3p4"], "入门", "01-HTML/07,08"),
            ("语义化标签 header / nav / main / footer", "会用语义标签搭结构", "结构清晰利于 SEO / 无障碍", ["m2s4p1"], "入门", "01-HTML/08"),
        ]),
    ]),
    ("HTML5 与表单", [
        ("表单入门", [
            ("form 与文本输入 input", "会写表单与文本框", "收集用户输入的入口", ["m2s4p2"], "入门", "01-HTML/08,10"),
            ("按钮 / 单选 / 复选", "会用 button / radio / checkbox", "常见选择类输入", ["m3s1p1"], "入门", "01-HTML/10"),
            ("select 与 textarea", "会下拉与多行文本", "补齐输入控件", ["m3s1p2"], "入门", "01-HTML/10"),
            ("label 与可用性", "会给控件绑 label", "点文字也能聚焦控件", ["m3s1p3"], "入门", "01-HTML/10"),
        ]),
        ("多媒体与新增", [
            ("音频视频 audio / video", "会嵌入媒体", "网页不止图文", ["m3s1p4"], "入门", "01-HTML/09,11"),
            ("HTML5 新增输入类型", "会用 email / number / date 等", "自带校验与键盘", ["m3s2p1"], "入门", "01-HTML/11"),
            ("字符编码 meta charset", "会声明 UTF-8", "解决中文乱码", ["m1s3p3"], "入门", "01-HTML/03,08"),
        ]),
    ]),
    ("CSS 起步：给网页上色", [
        ("第一次写 CSS", [
            ("CSS 是什么 / 三种引入", "分清行内 / 内部 / 外部", "知道样式写在哪", ["m2s4p1"], "入门", "02-CSS/03"),
            ("选择器入门：标签 / 类 / id", "会选中目标元素", "样式要先选中才生效", ["m4s1p1"], "入门", "02-CSS/03"),
            ("字体属性", "会设 font-family / size / weight", "控制文字外观", ["m4s1p2"], "入门", "02-CSS/01"),
            ("文本属性", "会设 color / align / line-height / decoration", "排版文字", ["m4s1p3"], "入门", "02-CSS/01"),
        ]),
        ("背景与选择器进阶", [
            ("背景属性", "会设背景色 / 图 / 平铺 / 位置", "给元素铺底色底图", ["m4s1p4"], "入门", "02-CSS/02"),
            ("伪类 :hover / :active", "会写交互态样式", "让页面有反馈", ["m4s2p1"], "入门", "02-CSS/04"),
            ("继承性与层叠性", "懂哪些属性会继承、样式如何叠加", "解释“样式为什么没生效”", ["m4s2p2"], "入门", "02-CSS/05"),
            ("优先级与 !important", "会算选择器优先级", "解决样式冲突", ["m4s2p3"], "入门", "02-CSS/05"),
        ]),
    ]),
    ("盒模型与布局基础", [
        ("盒模型", [
            ("盒模型五区域", "分清 content / padding / border / margin", "一切元素皆盒子", ["m4s2p4"], "入门", "02-CSS/06"),
            ("标准 vs IE 盒模型 box-sizing", "懂 width 含义差异", "解释尺寸为何对不上", ["m5s1p1"], "入门", "02-CSS/06"),
            ("边框与圆角", "会设 border 与 border-radius", "常见美化", ["m5s1p2"], "入门", "02-CSS/06,17"),
            ("外边距合并与 body 默认 margin", "懂 margin 合并、清 body 默认", "新手最常见的“莫名空隙”", ["m5s1p3"], "入门", "02-CSS/06"),
        ]),
        ("传统布局", [
            ("display：block / inline / inline-block", "会转换显示类型", "控制元素排列方式", ["m5s1p4"], "入门", "02-CSS/08"),
            ("浮动 float 与清除", "懂浮动与清浮动", "理解传统布局与塌陷", ["m5s2p1"], "入门", "02-CSS/07"),
            ("定位 relative / absolute", "会相对 / 绝对定位", "精确摆放元素", ["m5s2p2"], "入门", "02-CSS/08"),
            ("fixed / sticky 与 z-index", "会固定 / 粘性定位与层叠", "吸顶导航等场景", ["m5s2p3"], "入门", "02-CSS/08"),
        ]),
    ]),
    ("现代布局 Flex 与 Grid", [
        ("Flex", [
            ("Flex 容器与主轴交叉轴", "建立 Flex 方向概念", "现代布局基石", ["m5s2p4"], "入门", "02-CSS/13"),
            ("justify-content 与 align-items", "会主轴 / 交叉轴对齐", "一行代码搞定排列", ["m6s1p1"], "入门", "02-CSS/13"),
            ("flex-wrap 与子项 flex", "会换行与分配空间", "弹性自适应", ["m6s1p2"], "入门", "02-CSS/13"),
            ("水平垂直居中", "会用 Flex 居中", "高频刚需", ["m6s1p3"], "入门", "03-CSS进阶/04"),
        ]),
        ("Grid 与响应式", [
            ("Grid 入门：行列与间距", "会建网格布局", "二维布局利器", ["m6s1p4"], "进阶", "03-CSS进阶/02"),
            ("媒体查询与响应式", "会按屏宽切换样式", "一套代码适配多端", ["m6s2p1"], "进阶", "09-移动Web/03"),
            ("常用单位 px / em / rem / % / vw", "会选合适单位", "响应式与字号的基础", ["m6s2p2"], "入门", "03-CSS进阶/03"),
        ]),
    ]),
    ("美化与动效", [
        ("CSS3 美化", [
            ("阴影 box-shadow / text-shadow", "会加阴影", "层次感", ["m5s1p3"], "入门", "02-CSS/11"),
            ("渐变 gradient", "会写线性 / 径向渐变", "丰富背景", ["m4s2p1"], "入门", "02-CSS/11"),
            ("过渡 transition", "会做平滑过渡", "让变化不生硬", ["m7s1p2"], "入门", "02-CSS/12"),
            ("动画 animation / keyframes", "会写关键帧动画", "主动动效", ["m7s1p3"], "进阶", "02-CSS/12"),
            ("Web 字体与图标", "会引入 webfont / 图标", "排版与图标", ["m4s1p3"], "进阶", "02-CSS/14"),
        ]),
        ("综合常识", [
            ("浏览器兼容与前缀常识", "了解兼容与 -webkit- 等", "少踩兼容坑", ["m7s1p5"], "进阶", "02-CSS/16"),
        ]),
    ]),
    ("小项目：把所学拼起来", [
        ("实战（综合，不引入新知识点）", [
            ("项目：个人名片页", "用结构 + 样式做一张名片", "第一次完整产出", ["m7s2p1"], "入门", "02-CSS/09"),
            ("项目：导航栏 + 卡片布局", "用 Flex 做导航与卡片", "综合布局", ["m8s1p1"], "入门", "08-基本功练习"),
            ("项目：响应式个人主页", "加媒体查询适配手机", "完整走一遍所学", ["m8s1p2"], "进阶", "09-移动Web"),
        ]),
    ]),
]

# 语言包 id → 主线数据。目前仅 HTML/CSS 试点；其他语言仍走文档驱动 LLM 生成。
_SEEDS: dict[str, list] = {
    "html-css": _HTML_CSS,
}

# 概念点清单：考"理解/知道/分清"或操作常识的点，用选择/判断题测，不逼新手写没学过的代码。
# 只存 id 不改树结构：运行时查表即可，旧 tree.json 与已有进度不受影响（无需重生成树）。
# 其余点（会写/会用/会设…）仍走动手代码题。
_CONCEPT_POINTS: dict[str, set[str]] = {
    "html-css": {
        "m1s1p1", "m1s1p2", "m1s1p3",          # 网页/网站/Web、浏览器、三层分工
        "m1s2p1", "m1s2p2", "m1s2p3",          # 编辑器/打开网页/开发者工具：操作常识
        "m1s3p1",                              # HTML 是标记语言不是编程语言
        "m4s1p1",                              # CSS 是什么 / 三种引入
        "m4s2p3",                              # 继承性与层叠性
        "m5s1p2",                              # 标准 vs IE 盒模型
        "m5s1p4",                              # 外边距合并与 body 默认 margin
        "m6s1p1",                              # Flex 容器与主轴交叉轴
        "m7s2p1",                              # 浏览器兼容与前缀常识
    },
}


def is_concept(pack_id: str, point_id: str) -> bool:
    """该点是否用选择/判断题测（概念点）。非种子包一律 False，保持代码题。"""
    return point_id in _CONCEPT_POINTS.get(pack_id, ())


def _match_docs(title: str, index: list[dict] | None, limit: int = 2) -> list[str]:
    """best-effort 从已抓官方文档索引里挑支撑 URL（仅溯源，讲解实际走 kb.search）。

    用标题里的中英文关键词与文档标题做重叠打分，命中才挂，宁缺毋滥。
    """
    if not index:
        return []
    import re

    toks = set(re.findall(r"[A-Za-z][A-Za-z0-9-]{1,}|[\u4e00-\u9fff]{2,}", title.lower()))
    if not toks:
        return []
    scored = []
    for d in index:
        dt = (d.get("title") or "").lower()
        score = sum(1 for t in toks if t in dt)
        if score > 0:
            scored.append((score, d.get("url")))
    scored.sort(key=lambda x: -x[0])
    return [u for _, u in scored[:limit] if u]


def build_tree(pack_id: str, index: list[dict] | None = None) -> dict[str, Any] | None:
    """有种子则返回确定性技能树，否则 None（调用方回退到 LLM 生成）。"""
    seed = _SEEDS.get(pack_id)
    if seed is None:
        return None
    modules = []
    for mi, (mtitle, sections) in enumerate(seed, start=1):
        secs = []
        for si, (stitle, points) in enumerate(sections, start=1):
            pts = []
            for pi, (title, goal, why, prereq, level, ref) in enumerate(points, start=1):
                pts.append({
                    "id": f"m{mi}s{si}p{pi}",
                    "title": title,
                    "goal": goal,
                    "why": why,
                    "prereq": list(prereq),
                    "level": level,
                    "ref": ref,
                    "docs": _match_docs(title, index),
                })
            secs.append({"title": stitle, "points": pts})
        modules.append({"title": mtitle, "sections": secs})
    return {
        "modules": modules,
        "source": {
            "tutorial": _TUTORIAL,
            "license": "CC BY-NC-SA 4.0（仅借鉴教学顺序，讲解由 AI 重述，不搬运原文）",
            "design": "零基础框架驱动主线，文档退居事实校验",
        },
    }


def has_seed(pack_id: str) -> bool:
    return pack_id in _SEEDS