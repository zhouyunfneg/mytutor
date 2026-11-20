"""零基础课程种子：把人工设计的教学主线编码为确定性技能树。

为什么需要它：旧技能树由"官方文档页面清单"喂给 AI 自由生成，AI 照搬文档目录
顺序≠学习顺序，对纯新手笼统跳跃。这里把经过实读教程、按零基础学习顺序排好的
主线固定下来（框架驱动），文档退居讲解时的事实校验，AI 不再决定课程结构。

来源教程：HTML/CSS = qianguyihao/Web《千古前端图文教程》（CC BY-NC-SA 4.0）；
JavaScript = javascript-tutorial/zh.javascript.info《现代 JavaScript 教程》中文版
（自定义许可，基于 CC-BY-NC，明写可撤销）。各包出处见 _SOURCES。
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

# 教程出处基址（HTML/CSS 溯源用；各包出处与许可统一见下方 _SOURCES）
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

# JavaScript 主线：来源 zh.javascript.info《现代 JavaScript 教程》中文版（1-js 语言部分）。
# 该教程许可为自定义（基于 CC-BY-NC、署名+非商业、明写可撤销），故同样只借教学顺序与知识点划分，
# ref 只存章节路径（相对 1-js/），标题/目标/为什么均为自撰中文，不含教程原文。
# 浏览器 DOM/事件（2-ui）本轮不含：JS 包代码区只开 node 沙箱页签，无 document 也无预览判题通道。
# 模块化两点定为概念点：沙箱只跑单文件 CommonJS，跨文件 import/export 无法判题。
_JS: list[tuple[str, list[tuple[str, list[tuple]]]]] = [
    ("走进 JavaScript", [
        ("JS 是什么、在哪跑", [
            ("JavaScript 做什么：网页的行为层", "说清 JS 负责网页的行为与交互", "接上 HTML/CSS 建立三层地图", [], "入门", "01-getting-started/1-intro"),
            ("浏览器与 Node：JS 在哪运行", "分清浏览器与 Node 两个运行场所", "明白代码靠谁执行", ["m1s1p1"], "入门", "01-getting-started/1-intro"),
            ("开发者工具与 Console", "会开 F12 用 Console 看输出与报错", "以后排错有抓手", ["m1s1p2"], "入门", "01-getting-started/4-devtools"),
        ]),
        ("第一个程序", [
            ("你好世界：console.log", "会用 console.log 输出一句话", "第一次看到自己的代码跑出结果", ["m1s1p3"], "入门", "02-first-steps/01-hello-world"),
            ("语句、分号与代码结构", "懂语句分行与分号的作用", "看懂代码的基本骨架", ["m1s2p1"], "入门", "02-first-steps/02-structure"),
            ("严格模式 use strict", "知道严格模式让错误更早暴露", "少踩隐式全局等老坑", ["m1s2p2"], "入门", "02-first-steps/03-strict-mode"),
            ("看懂报错信息", "会读 SyntaxError / ReferenceError 的定位", "报错不是失败是线索", ["m1s2p3"], "入门", "03-code-quality/01-debugging-chrome"),
        ]),
    ]),
    ("变量与数据类型", [
        ("变量", [
            ("let：声明与赋值", "会用 let 存值并重新赋值", "程序要记住信息", ["m1s2p4"], "入门", "02-first-steps/04-variables"),
            ("const：不可重新赋值的常量", "会用 const 声明固定值", "明确的常量更安全", ["m2s1p1"], "入门", "02-first-steps/04-variables"),
            ("命名规则与大小写敏感", "会起合法变量名、懂大小写敏感", "名字写错就报错", ["m2s1p2"], "入门", "02-first-steps/04-variables"),
            ("交换两个变量的值", "会用临时变量交换两个值", "第一个真正的动手小任务", ["m2s1p3"], "入门", "02-first-steps/04-variables"),
        ]),
        ("数据类型", [
            ("八种数据类型总览", "说出 JS 的八种类型", "先有地图再逐个走", ["m2s1p4"], "入门", "02-first-steps/05-types"),
            ("number：整数小数与 NaN/Infinity", "会用数字并认识 NaN/Infinity", "算错常因这两个特殊值", ["m2s2p1"], "入门", "05-data-types/02-number"),
            ("string 与模板字符串", "会拼接字符串与用反引号插值", "输出给人看的话", ["m2s2p2"], "入门", "05-data-types/03-string"),
            ("undefined 与 null 的区别", "分清「没赋值」与「主动置空」", "新手最常混的两个空", ["m2s2p3"], "入门", "02-first-steps/05-types"),
        ]),
        ("类型转换", [
            ("Number/String/Boolean 显式转换", "会主动转换类型", "输入来的都是字符串", ["m2s2p4"], "入门", "02-first-steps/07-type-conversions"),
            ("隐式转换与相等的坑", "懂 == 与 === 的差别", "解释「为什么它俩相等」", ["m2s3p1"], "入门", "02-first-steps/07-type-conversions"),
            ("typeof 查类型", "会用 typeof 判断类型", "不确定时先查一查", ["m2s3p2"], "入门", "02-first-steps/05-types"),
        ]),
    ]),
    ("运算与流程控制", [
        ("运算符", [
            ("算术运算与取余", "会加减乘除与 % 取余", "计算是程序的基本活", ["m2s3p3"], "入门", "02-first-steps/08-operators"),
            ("自增自减与复合赋值", "会用 ++/-- 与 +=/-=", "计数与累加天天用", ["m3s1p1"], "入门", "02-first-steps/08-operators"),
            ("比较运算与严格相等 ===", "会用 > < >= <= === !==", "判断大小与相等", ["m3s1p2"], "入门", "02-first-steps/09-comparison"),
            ("逻辑运算 && || !", "会组合多个条件", "现实条件常常不止一个", ["m3s1p3"], "入门", "02-first-steps/11-logical-operators"),
            ("空值合并 ??", "会用 ?? 给空值兜底", "区分「空」与「0/假值」", ["m3s1p4"], "入门", "02-first-steps/12-nullish-coalescing-operator"),
        ]),
        ("分支", [
            ("if / else", "会写二选一分支", "让程序会做选择", ["m3s1p5"], "入门", "02-first-steps/10-ifelse"),
            ("else if 多分支", "会写多路分支", "情况不止两种", ["m3s2p1"], "入门", "02-first-steps/10-ifelse"),
            ("三元运算符", "会用条件表达式取两个值之一", "简单分支一行写完", ["m3s2p2"], "入门", "02-first-steps/10-ifelse"),
            ("switch", "会用 switch 按值分派", "等值多分支更清晰", ["m3s2p3"], "入门", "02-first-steps/14-switch"),
        ]),
        ("循环", [
            ("while", "会写条件循环", "重复的事交给机器", ["m3s2p4"], "入门", "02-first-steps/13-while-for"),
            ("for", "会写计数循环", "知道次数时最常用", ["m3s3p1"], "入门", "02-first-steps/13-while-for"),
            ("break 与 continue", "会提前退出与跳过本轮", "控制循环的节奏", ["m3s3p2"], "入门", "02-first-steps/13-while-for"),
            ("累加器与循环嵌套", "会用循环求和与处理双层数据", "把前面所学串起来", ["m3s3p3"], "入门", "02-first-steps/13-while-for"),
        ]),
    ]),
    ("函数入门", [
        ("函数基础", [
            ("声明函数与调用", "会写 function 并调用", "把重复代码收进一个名字", ["m3s3p4"], "入门", "02-first-steps/15-function-basics"),
            ("参数与默认值", "会传参与给默认值", "同一个函数处理不同输入", ["m4s1p1"], "入门", "02-first-steps/15-function-basics"),
            ("return 返回值", "会用 return 交出结果", "函数要能把结果递出来", ["m4s1p2"], "入门", "02-first-steps/15-function-basics"),
            ("没有 return 会返回什么", "知道默认返回 undefined", "解释「为什么拿到 undefined」", ["m4s1p3"], "入门", "02-first-steps/15-function-basics"),
        ]),
        ("作用域与函数形态", [
            ("局部变量与全局变量", "分清函数内外的变量可见范围", "名字冲突与意外覆盖的根源", ["m4s1p4"], "入门", "02-first-steps/15-function-basics"),
            ("函数表达式", "会把函数存进变量", "函数也是值", ["m4s2p1"], "入门", "02-first-steps/16-function-expressions"),
            ("箭头函数", "会写 () => {} 简写", "现代代码里最常见", ["m4s2p2"], "入门", "02-first-steps/17-arrow-functions-basics"),
            ("把函数当参数传：回调初识", "会把函数传给另一个函数", "后面数组方法与异步全靠它", ["m4s2p3"], "入门", "02-first-steps/16-function-expressions"),
        ]),
    ]),
    ("对象", [
        ("对象基础", [
            ("对象字面量与属性", "会用 {} 存一组键值", "一个事物有多项信息", ["m4s2p4"], "入门", "04-object-basics/01-object"),
            ("点与方括号两种访问", '会用 obj.k 与 obj["k"]', "键名动态时只能用方括号", ["m5s1p1"], "入门", "04-object-basics/01-object"),
            ("增删改属性与 in", "会增删改属性并判断存在", "对象内容会变", ["m5s1p2"], "入门", "04-object-basics/01-object"),
            ("对象方法", "会把函数放进对象当方法", "数据与操作放一起", ["m5s1p3"], "入门", "04-object-basics/04-object-methods"),
        ]),
        ("对象进阶", [
            ("可选链 ?.", "会用 ?. 安全取深层属性", "少写一堆 if 判空", ["m5s1p4"], "入门", "04-object-basics/07-optional-chaining"),
            ("对象是引用：赋值与比较", "懂对象赋值传的是引用", "解释「改一个另一个也变」", ["m5s2p1"], "入门", "04-object-basics/02-object-copy"),
            ("浅拷贝与展开复制", "会用 {...obj} 复制一层", "想要独立副本", ["m5s2p2"], "入门", "04-object-basics/02-object-copy"),
            ("遍历对象：for...in 与 Object.keys", "会遍历对象的键", "批量处理一组属性", ["m5s2p3"], "入门", "05-data-types/09-keys-values-entries"),
            ("对象解构赋值", "会一次取出多个属性", "少写重复的 obj.", ["m5s2p4"], "入门", "05-data-types/10-destructuring-assignment"),
        ]),
    ]),
    ("数组与数据格式", [
        ("数组基础", [
            ("数组字面量与下标", "会用 [] 存一串值并按下标取", "一类事物有很多个", ["m5s2p5"], "入门", "05-data-types/04-array"),
            ("push/pop/shift/unshift", "会在两端增删元素", "队列与栈的基本操作", ["m6s1p1"], "入门", "05-data-types/04-array"),
            ("length 与 for...of 遍历", "会取长度并逐项遍历", "批量处理每个元素", ["m6s1p2"], "入门", "05-data-types/04-array,06-iterable"),
            ("查找：includes/indexOf/find", "会判断存在与找出元素", "先找到才能处理", ["m6s1p3"], "入门", "05-data-types/05-array-methods"),
        ]),
        ("数组变形", [
            ("splice 与 slice", "会截取与增删中段", "分清改原数组与不改", ["m6s1p4"], "入门", "05-data-types/05-array-methods"),
            ("map：逐项变形", "会用 map 得到新数组", "一批数据统一加工", ["m6s2p1", "m4s2p4"], "入门", "05-data-types/05-array-methods"),
            ("filter：筛选", "会用 filter 留下符合条件的", "从一堆里挑出一部分", ["m6s2p2"], "入门", "05-data-types/05-array-methods"),
            ("reduce 与 sort", "会汇总与排序", "统计与排行高频需求", ["m6s2p3"], "进阶", "05-data-types/05-array-methods"),
        ]),
        ("数据格式与常用结构", [
            ("数组解构与剩余", "会解构数组与收集剩余", "取头几个与剩下的", ["m6s2p4"], "入门", "05-data-types/10-destructuring-assignment"),
            ("JSON：stringify 与 parse", "会在对象与 JSON 文本间转换", "数据交换的通用格式", ["m6s3p1"], "入门", "05-data-types/12-json"),
            ("Map 与 Set", "会用键值映射与去重集合", "对象与普通数组不够用时", ["m6s3p2"], "进阶", "05-data-types/07-map-set"),
            ("Date 与时间戳", "会取当前时间与读年月日", "记录时间戳与日期", ["m6s3p3"], "入门", "05-data-types/11-date"),
        ]),
    ]),
    ("函数进阶与运行机制", [
        ("进阶函数", [
            ("递归", "会写自己调用自己的函数", "分层问题天然递归", ["m6s3p4"], "进阶", "06-advanced-functions/01-recursion"),
            ("剩余参数与展开运算符", "会用 ...rest 与 ...spread", "参数个数不定与合并数据", ["m7s1p1"], "入门", "06-advanced-functions/02-rest-parameters-spread"),
            ("闭包：写一个计数器", "会写记住状态的函数", "不用全局变量也能存状态", ["m7s1p2", "m4s2p1"], "进阶", "06-advanced-functions/03-closure"),
            ("闭包为什么记得住变量", "理解词法环境与引用保留", "懂原理才不会误用", ["m7s1p3"], "进阶", "06-advanced-functions/03-closure"),
        ]),
        ("运行机制", [
            ("setTimeout 与 setInterval", "会延时与定时执行", "第一次遇到「稍后再跑」", ["m7s1p4"], "入门", "06-advanced-functions/08-settimeout-setinterval"),
            ("事件循环：宏任务与微任务", "懂代码为何不是逐行立刻执行", "解释输出顺序的意外", ["m7s2p1"], "进阶", "11-async/07-microtask-queue"),
            ("var 的历史与变量提升", "知道 var 与 let 的差别", "读旧代码不迷路", ["m7s2p2"], "进阶", "06-advanced-functions/04-var"),
            ("this 指向谁", "会判断方法里 this 指向哪个对象", "面向对象与回调的关键", ["m7s2p3", "m5s1p4"], "进阶", "04-object-basics/04-object-methods"),
        ]),
    ]),
    ("面向对象与错误处理", [
        ("原型与类", [
            ("原型继承的思想", "理解对象可以「挂在」另一个对象上", "类的底层就是原型", ["m7s2p4"], "进阶", "08-prototypes/01-prototype-inheritance"),
            ("class 与 constructor", "会写类与构造函数", "批量造同结构对象", ["m8s1p1", "m5s1p4"], "入门", "09-classes/01-class"),
            ("类的方法与实例", "会在类里写方法并 new 实例", "每个实例自带行为", ["m8s1p2"], "入门", "09-classes/01-class"),
            ("extends 与 super", "会写继承与调用父类", "复用已有类的结构", ["m8s1p3"], "进阶", "09-classes/02-class-inheritance"),
            ("静态方法与 instanceof", "会用类级方法与类型判断", "工具方法与类型检查", ["m8s1p4"], "进阶", "09-classes/03-static-properties-methods,06-instanceof"),
        ]),
        ("错误处理", [
            ("try / catch", "会捕获异常不让程序崩", "出错也要能继续", ["m8s1p5"], "入门", "10-error-handling/1-try-catch"),
            ("throw 与自定义错误", "会主动抛错与扩展 Error", "把业务错误说清楚", ["m8s2p1"], "进阶", "10-error-handling/2-custom-errors"),
            ("finally 与错误传播", "懂 finally 必执行与错误往上抛", "收尾清理与定位责任", ["m8s2p2"], "入门", "10-error-handling/1-try-catch"),
        ]),
    ]),
    ("异步编程", [
        ("从回调到 Promise", [
            ("同步与异步：为什么要异步", "理解耗时操作不能卡住后面", "网络与定时都是异步", ["m8s2p3"], "入门", "11-async/01-callbacks"),
            ("回调地狱是什么问题", "说出多层回调的可读性问题", "明白 Promise 解决什么", ["m9s1p1"], "入门", "11-async/01-callbacks"),
            ("Promise 基础与 then", "会创建 Promise 并用 then 取结果", "异步结果有了统一载体", ["m9s1p2", "m4s2p4"], "入门", "11-async/02-promise-basics"),
            ("Promise 链式调用", "会用 then 串起多步异步", "替代嵌套回调", ["m9s1p3"], "进阶", "11-async/03-promise-chaining"),
            ("catch 处理失败", "会用 catch 接住失败", "异步失败也要有出口", ["m9s1p4"], "入门", "11-async/04-promise-error-handling"),
        ]),
        ("async/await 与并发", [
            ("async / await", "会用同步写法写异步", "现代异步的主流写法", ["m9s1p5"], "入门", "11-async/08-async-await"),
            ("await 配 try/catch", "会用 try/catch 接住 await 的错", "失败处理不能少", ["m9s2p1"], "入门", "11-async/08-async-await"),
            ("Promise.all 与 race", "会并发等待多个任务", "一起跑比逐个快", ["m9s2p2"], "进阶", "11-async/05-promise-api"),
        ]),
    ]),
    ("模块与小项目", [
        ("模块化", [
            ("为什么要拆模块", "理解按职责拆文件的好处", "代码多了要分家", ["m9s2p3"], "入门", "13-modules/01-modules-intro"),
            ("export 与 import", "看懂导出与导入写法", "读现代项目必备", ["m10s1p1"], "入门", "13-modules/02-import-export"),
        ]),
        ("综合项目（不引入新知识点）", [
            ("项目：记账小账本", "用对象数组+函数做收支记录与合计", "第一次完整产出", ["m10s1p2"], "入门", "综合 04-object-basics + 05-data-types/04-array"),
            ("项目：成绩统计", "用 map/filter/reduce 算平均与筛选", "数组三件套实战", ["m10s2p1"], "入门", "综合 05-data-types/05-array-methods"),
            ("项目：异步任务队列", "用 Promise/async 按序跑多个耗时任务", "异步实战收尾", ["m10s2p2"], "进阶", "综合 11-async"),
        ]),
    ]),
]

# 语言包 id → 主线数据。有种子的走确定性建树，其余仍走文档驱动 LLM 生成。
_SEEDS: dict[str, list] = {
    "html-css": _HTML_CSS,
    "javascript": _JS,
}

# 各包教程出处与许可（溯源用，写进 tree.json 的 source；均只借顺序不搬原文）
_SOURCES: dict[str, dict[str, str]] = {
    "html-css": {
        "tutorial": _TUTORIAL,
        "license": "CC BY-NC-SA 4.0（仅借鉴教学顺序，讲解由 AI 重述，不搬运原文）",
    },
    "javascript": {
        "tutorial": "https://github.com/javascript-tutorial/zh.javascript.info",
        "license": "自定义许可，基于 CC-BY-NC（署名+非商业，明写可撤销）：仅借鉴教学顺序，讲解由 AI 重述，不搬运原文",
    },
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
    "javascript": {
        "m1s1p1", "m1s1p2", "m1s1p3",          # 行为层 / 浏览器与 Node / 开发者工具
        "m1s2p2", "m1s2p3", "m1s2p4",          # 语句结构 / 严格模式 / 看懂报错
        "m2s1p3",                              # 命名规则与大小写敏感
        "m2s2p1", "m2s2p4",                    # 八种类型总览 / undefined 与 null
        "m2s3p2",                              # 隐式转换与相等的坑
        "m4s1p4",                              # 没有 return 返回什么
        "m5s2p2",                              # 对象是引用
        "m7s1p4", "m7s2p2", "m7s2p3",          # 闭包原理 / 事件循环 / var 与提升
        "m8s1p1",                              # 原型继承思想
        "m9s1p1", "m9s1p2",                    # 同步与异步 / 回调地狱
        "m10s1p1", "m10s1p2",                  # 为什么拆模块 / export 与 import
        # 后两点定为概念点：沙箱只跑单文件 CommonJS，跨文件 import/export 无法判题。
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
            "tutorial": _SOURCES.get(pack_id, {}).get("tutorial", ""),
            "license": _SOURCES.get(pack_id, {}).get("license", ""),
            "design": "零基础框架驱动主线，文档退居事实校验",
        },
    }


def has_seed(pack_id: str) -> bool:
    return pack_id in _SEEDS