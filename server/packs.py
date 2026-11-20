"""语言包：官方文档源 + 微知识点技能树 + 运行时。安装=抓文档→建索引→生成技能树。"""
from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path
from typing import Any

from .config import DATA_DIR, load_settings

PACKS: dict[str, dict[str, Any]] = {
    "python": {
        "name": "Python",
        "runtime": "python",
        "sources": [
            {"url": "https://docs.python.org/zh-cn/3/tutorial/", "depth": 1, "pages": 30},
        ],
    },
    "javascript": {
        "name": "JavaScript",
        # 判题路由只认 SANDBOX_LANG 里的键：曾误标 "javascript+preview"，
        # 导致 JS 出题落到 HTML 的 AI 判题通道（规则明写不许写 JS）、判题语言退化成 python。
        # 代码区的 HTML 预览页签由前端独立控制，与此标签无关，故这里就是 "javascript"。
        "runtime": "javascript",
        "sources": [
            {"url": "https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide", "depth": 1, "pages": 30},
        ],
    },
    "html-css": {
        "name": "HTML / CSS",
        "runtime": "preview",
        "sources": [
            {"url": "https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Styling_basics", "depth": 1, "pages": 20},
            {"url": "https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Structuring_content", "depth": 1, "pages": 20},
        ],
    },
    "typescript": {
        "name": "TypeScript",
        "runtime": "typescript",
        "sources": [
            # 官方中文手册上游大面积 404/503（2026-11-16 实测），改用英文官方手册；
            # 教学讲解仍为中文，文档原文英文。
            {"url": "https://www.typescriptlang.org/docs/handbook/intro.html", "depth": 1, "pages": 30},
        ],
    },
    # 2026-11-17 新增五语言。文档源以服务器（杭州机房 IP）实测可抓为准：
    # cppreference 英文/中文站均被 Cloudflare 人机验证挡（403 "Just a moment"），
    # 改用微软官方中文文档（与 C# 同站，深度 2 各抓 29 篇，原文中文）；
    # go.dev 的 robots 挡爬虫 → Google 官方中国镜像 golang.google.cn；
    # Rust 官方书章节页做种子只会爬到自身附近几页，改用 book/ 索引 + 深度 2（含整本 print.html）。
    "c": {
        "name": "C",
        "runtime": "c",
        "sources": [
            {"url": "https://learn.microsoft.com/zh-cn/cpp/c-language/", "depth": 2, "pages": 30},
        ],
    },
    "cpp": {
        "name": "C++",
        "runtime": "cpp",
        "sources": [
            {"url": "https://learn.microsoft.com/zh-cn/cpp/cpp/", "depth": 2, "pages": 30},
        ],
    },
    "csharp": {
        "name": "C#",
        "runtime": "csharp",
        "sources": [
            {"url": "https://learn.microsoft.com/zh-cn/dotnet/csharp/", "depth": 1, "pages": 30},
        ],
    },
    "rust": {
        "name": "Rust",
        "runtime": "rust",
        "sources": [
            {"url": "https://doc.rust-lang.org/book/", "depth": 2, "pages": 40},
        ],
    },
    "go": {
        "name": "Go",
        "runtime": "go",
        "sources": [
            {"url": "https://golang.google.cn/doc/", "depth": 1, "pages": 30},
        ],
    },
}

_running: set[str] = set()


def pack_dir(pack_id: str) -> Path:
    return DATA_DIR / "packs" / pack_id


def load_pack(pack_id: str) -> dict[str, Any]:
    f = pack_dir(pack_id) / "pack.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return {"id": pack_id, "status": "not_installed", "log": [], "doc_count": 0}


def save_pack(pack_id: str, data: dict[str, Any]) -> None:
    d = pack_dir(pack_id)
    d.mkdir(parents=True, exist_ok=True)
    (d / "pack.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def log(pack: dict, msg: str) -> None:
    pack["log"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")
    save_pack(pack["id"], pack)


def load_tree(pack_id: str) -> dict | None:
    f = pack_dir(pack_id) / "tree.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return None


def save_tree(pack_id: str, tree: dict) -> None:
    pack_dir(pack_id).mkdir(parents=True, exist_ok=True)
    (pack_dir(pack_id) / "tree.json").write_text(
        json.dumps(tree, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def list_packs() -> list[dict[str, Any]]:
    from . import curriculum
    out = []
    for pid, meta in PACKS.items():
        p = load_pack(pid)
        out.append({**meta, "id": pid, "status": p["status"], "doc_count": p.get("doc_count", 0),
                    "curated": curriculum.has_seed(pid)})
    return out


def _slug(url: str) -> str:
    path = re.sub(r"^https?://[^/]+", "", url).strip("/")
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", path).strip("-")
    return (slug or "index")[:120]


async def _crawl(pack: dict) -> list[str]:
    from deeptutor.services.web_source.crawler import crawl_docs_site

    docs_dir = pack_dir(pack["id"]) / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    files: list[str] = []
    index: list[dict] = []
    for src in PACKS[pack["id"]]["sources"]:
        log(pack, f"抓取 {src['url']}（depth={src['depth']}, ≤{src['pages']}页）")
        result = await crawl_docs_site(
            src["url"], max_depth=src["depth"], max_pages=src["pages"], timeout_s=30
        )
        if not result.ok:
            raise RuntimeError(f"抓取失败 {src['url']}: {result.errors[:2]}")
        for page in result.pages:
            fname = _slug(page.url) + ".md"
            fp = docs_dir / fname
            fp.write_text(f"# {page.title}\n\n来源: {page.url}\n\n{page.markdown}", encoding="utf-8")
            files.append(str(fp))
            index.append({"file": fname, "url": page.url, "title": page.title})
        log(pack, f"抓到 {len(result.pages)} 页")
    (pack_dir(pack["id"]) / "docs_index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return files


TREE_PROMPT = """你是编程语言课程设计专家。为语言「{lang}」设计微知识点技能树。

以下是该语言官方文档的页面清单（标题+URL）：
{docs}

要求：
1. 粒度：每个微知识点是一个 5~10 分钟能学完的小点（例如"Promise 的三种状态"，而不是"异步编程"）。
2. 结构：modules（模块）→ sections（小节，每节 3~6 个点）→ points（微知识点）。
3. 顺序按依赖关系循序渐进；零基础可入门。
4. 每个 point 给 id（m1s1p1 格式）、title、goal（一句话学习目标）、docs（支撑该点的文档URL，从清单选，1~3个）。title 和 goal 一律用中文（文档原文可能是英文）。
5. 总量控制：首批 3~5 个模块、每模块 2~4 个小节。覆盖核心基础即可，不求全。
6. 只输出 JSON，不要任何解释文字。格式：
{{"modules":[{{"title":"...","sections":[{{"title":"...","points":[{{"id":"m1s1p1","title":"...","goal":"...","docs":["url"]}}]}}]}}]}}"""


async def _generate_tree(pack: dict) -> dict:
    from . import llm

    index = json.loads((pack_dir(pack["id"]) / "docs_index.json").read_text(encoding="utf-8"))
    docs_list = "\n".join(f"- {d['title']} | {d['url']}" for d in index[:80])
    s = load_settings()
    log(pack, f"用 {s['models']['reason']} 生成微知识点技能树…")
    raw = await llm.chat(
        [{"role": "user", "content": TREE_PROMPT.format(lang=PACKS[pack["id"]]["name"], docs=docs_list)}],
        model=s["models"]["reason"],
        temperature=0.2,
        # reasoner 的思考也计入 max_tokens，6000 实测全耗在思考上导致正文为空
        max_tokens=16000,
    )
    text = raw.strip()
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        text = m.group(0)
    try:
        tree = json.loads(text)
    except json.JSONDecodeError:
        from json_repair import repair_json

        tree = json.loads(repair_json(text))
    if not tree.get("modules"):
        raise RuntimeError("技能树生成结果缺少 modules")
    n_points = sum(len(sec.get("points", [])) for mod in tree["modules"] for sec in mod.get("sections", []))
    log(pack, f"技能树生成：{len(tree['modules'])} 模块 / {n_points} 微知识点，待审核")
    return tree


async def _install(pack_id: str) -> None:
    pack = load_pack(pack_id)
    try:
        pack["status"] = "crawling"
        save_pack(pack_id, pack)
        idx_file = pack_dir(pack_id) / "docs_index.json"
        if idx_file.exists():
            # 断点续装：已抓过的文档直接复用（如上次卡在缺 key）
            index = json.loads(idx_file.read_text(encoding="utf-8"))
            files = [str(pack_dir(pack_id) / "docs" / d["file"]) for d in index]
            files = [f for f in files if Path(f).exists()]
            if files:
                log(pack, f"复用已抓取的 {len(files)} 篇文档，跳过抓取")
            else:
                files = await _crawl(pack)
        else:
            files = await _crawl(pack)
        pack["doc_count"] = len(files)

        pack["status"] = "indexing"
        log(pack, f"建索引（{len(files)} 篇，DashScope 嵌入）…")
        from . import kb

        ok = await kb.index_documents(pack_id, files)
        if not ok:
            raise RuntimeError("索引失败（引擎返回 False）")
        log(pack, "索引完成")

        pack["status"] = "tree"
        save_pack(pack_id, pack)
        from . import curriculum

        if curriculum.has_seed(pack_id):
            # 框架驱动：用人工设计的零基础主线确定性生成，AI 不决定课程结构。
            # 每次安装都按最新蓝图重建（蓝图更新即生效），文档仅挂溯源 URL。
            index = json.loads(idx_file.read_text(encoding="utf-8")) if idx_file.exists() else []
            tree = curriculum.build_tree(pack_id, index)
            save_tree(pack_id, tree)
            n_points = sum(len(sec["points"]) for mod in tree["modules"] for sec in mod["sections"])
            log(pack, f"用零基础课程蓝图生成技能树：{len(tree['modules'])} 模块 / {n_points} 微知识点（确定性）")
        else:
            tree = load_tree(pack_id)
            if tree is None:
                tree = await _generate_tree(pack)
                save_tree(pack_id, tree)
            else:
                log(pack, "复用已生成的技能树")

        pack["status"] = "ready"
        pack["installed_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        log(pack, "语言包就绪")
        save_pack(pack_id, pack)
    except Exception as e:
        pack["status"] = "error"
        log(pack, f"失败: {type(e).__name__}: {e}")
        save_pack(pack_id, pack)
    finally:
        _running.discard(pack_id)


def start_install(pack_id: str) -> dict[str, Any]:
    if pack_id not in PACKS:
        raise ValueError(f"未知语言包: {pack_id}")
    if pack_id in _running:
        raise ValueError("该语言包正在安装中")
    _running.add(pack_id)
    asyncio.get_event_loop().create_task(_install(pack_id))
    return {"ok": True, "status": "crawling"}