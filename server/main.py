"""MyTutor 后端入口。开发: uvicorn server.main:app --port 8300（在 mytutor 目录下）"""
from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("DEEPTUTOR_SANDBOX_ALLOW_SUBPROCESS", "1")

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import activity, auth, config, kb, llm, notes, packs, practice, runner, teach

app = FastAPI(title="MyTutor", version="0.8.3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PUBLIC_API = {"/api/health", "/api/login", "/api/me"}


@app.middleware("http")
async def gate(request: Request, call_next):
    path = request.url.path
    # 未初始化口令 = 本机开发模式，放开；部署时必须先初始化口令（见 deploy）
    if path.startswith("/api") and path not in PUBLIC_API and auth.has_password():
        if not auth.valid_token(request.cookies.get(auth.COOKIE)):
            return Response('{"ok":false,"error":"未登录"}', status_code=401,
                            media_type="application/json")
    return await call_next(request)


@app.post("/api/login")
async def login(body: dict, request: Request, response: Response):
    if not auth.has_password():
        return {"ok": False, "error": "服务端尚未设置口令（部署时初始化）"}
    if not auth.check_password(str(body.get("password", ""))):
        return {"ok": False, "error": "口令不对"}
    tok = auth.issue_token()
    secure = request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(auth.COOKIE, tok, httponly=True, samesite="lax",
                        secure=secure, path="/", max_age=auth.TTL)
    return {"ok": True}


@app.post("/api/logout")
async def logout(request: Request, response: Response):
    auth.revoke(request.cookies.get(auth.COOKIE))
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


@app.get("/api/me")
async def me(request: Request):
    return {"authenticated": auth.valid_token(request.cookies.get(auth.COOKIE)),
            "has_password": auth.has_password()}


class PasswordChange(BaseModel):
    old: str
    new: str


@app.put("/api/password")
async def change_password(body: PasswordChange):
    if not auth.check_password(body.old):
        return {"ok": False, "error": "旧口令不对"}
    try:
        auth.set_password(body.new)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True}


@app.get("/api/health")
async def health():
    return {"ok": True, "app": "MyTutor", "version": app.version}


# ── 学习时长（前台活跃区间；多标签重叠由服务端去重）────────────────
class ActivityHeartbeat(BaseModel):
    segments: list[dict]


@app.post("/api/activity/heartbeat")
async def activity_heartbeat(body: ActivityHeartbeat):
    return activity.record(body.segments)


@app.get("/api/activity/summary")
async def activity_summary():
    return activity.summary()


@app.get("/api/settings")
async def get_settings():
    return config.public_settings()


class SettingsPatch(BaseModel):
    patch: dict


@app.put("/api/settings")
async def put_settings(body: SettingsPatch):
    # 空 key 视为"不修改"，避免打码回显覆盖真实 key
    patch = body.patch
    providers = patch.get("providers")
    if isinstance(providers, dict):
        for name, p in list(providers.items()):
            if isinstance(p, dict) and not p.get("api_key"):
                p.pop("api_key", None)
                if not p:
                    providers.pop(name)
        if not providers:
            patch.pop("providers")
    config.save_settings(patch)
    return config.public_settings()


@app.post("/api/settings/test/{provider}")
async def test_provider(provider: str):
    if provider == "embedding":
        return await llm.test_embedding()
    if provider not in ("deepseek", "dashscope"):
        return {"ok": False, "error": f"未知 provider: {provider}"}
    return await llm.test_chat(provider)


class RunRequest(BaseModel):
    code: str
    language: str = "python"
    timeout: int = 15


@app.post("/api/run")
async def run(body: RunRequest):
    return await runner.run_code(body.code, body.language, timeout=body.timeout)


@app.get("/api/packs")
async def get_packs():
    out = packs.list_packs()
    for p in out:
        p["progress"] = teach.progress(p["id"])
    return out


@app.post("/api/packs/{pack_id}/install")
async def install_pack(pack_id: str):
    try:
        return packs.start_install(pack_id)
    except ValueError as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/packs/{pack_id}")
async def get_pack(pack_id: str):
    from . import curriculum
    p = packs.load_pack(pack_id)
    p["tree"] = packs.load_tree(pack_id)
    p["progress"] = teach.progress(pack_id)
    p["curated"] = curriculum.has_seed(pack_id)
    return p


class TreeUpdate(BaseModel):
    tree: dict


@app.put("/api/packs/{pack_id}/tree")
async def put_tree(pack_id: str, body: TreeUpdate):
    if not body.tree.get("modules"):
        return {"ok": False, "error": "tree 缺少 modules"}
    packs.save_tree(pack_id, body.tree)
    return {"ok": True}


class KBSearch(BaseModel):
    query: str
    top_k: int = 4


@app.post("/api/packs/{pack_id}/search")
async def kb_search(pack_id: str, body: KBSearch):
    try:
        r = await kb.search(pack_id, body.query, top_k=body.top_k)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    # 来源补上官方原文 URL（docs_index 里 file→url 映射），供前端点回原文
    import json as _json
    idx_file = packs.pack_dir(pack_id) / "docs_index.json"
    if idx_file.exists():
        try:
            url_by_file = {d["file"]: d["url"] for d in _json.loads(idx_file.read_text(encoding="utf-8"))}
            for s in r.get("sources", []):
                s["url"] = url_by_file.get(s.get("title", ""), "")
        except Exception:
            pass
    return r


# ── 笔记（AI 自动 + 手动） ────────────────────────────────────────────
@app.get("/api/notes")
async def get_notes(pack_id: str | None = None, kind: str | None = None, q: str | None = None):
    return notes.list_notes(pack_id, kind, q)


class NoteCreate(BaseModel):
    title: str
    content: str
    pack_id: str | None = None
    point_id: str | None = None


@app.post("/api/notes")
async def create_note(body: NoteCreate):
    if not body.title.strip() or not body.content.strip():
        return {"ok": False, "error": "标题和内容不能为空"}
    return await notes.add_note(kind="manual", title=body.title.strip(), content=body.content.strip(),
                                pack_id=body.pack_id, point_id=body.point_id)


class NotePatch(BaseModel):
    title: str | None = None
    content: str | None = None


@app.put("/api/notes/{note_id}")
async def put_note(note_id: str, body: NotePatch):
    n = await notes.update_note(note_id, title=body.title, content=body.content)
    return n or {"ok": False, "error": "笔记不存在"}


@app.delete("/api/notes/{note_id}")
async def del_note(note_id: str):
    return {"ok": await notes.delete_note(note_id)}


# ── 微知识点教学循环 ──────────────────────────────────────────────────
def _teach_err(e: Exception):
    return {"ok": False, "error": f"{type(e).__name__}: {e}"}


@app.get("/api/teach/{pack_id}")
async def teach_state(pack_id: str):
    return teach.state(pack_id) or {"step": "none"}


@app.get("/api/teach/{pack_id}/review/{point_id}")
async def teach_review(pack_id: str, point_id: str):
    try:
        return teach.review(pack_id, point_id)
    except Exception as e:
        return _teach_err(e)


class TeachStart(BaseModel):
    point_id: str | None = None
    restart: bool = False


@app.post("/api/teach/{pack_id}/start")
async def teach_start(pack_id: str, body: TeachStart):
    try:
        await teach.start(pack_id, body.point_id, restart=body.restart)
        return teach.state(pack_id)
    except Exception as e:
        return _teach_err(e)


@app.post("/api/teach/{pack_id}/step")
async def teach_step(pack_id: str):
    try:
        await teach.to_exercise(pack_id)
        return teach.state(pack_id)
    except Exception as e:
        return _teach_err(e)


class TeachAsk(BaseModel):
    question: str


@app.post("/api/teach/{pack_id}/ask")
async def teach_ask(pack_id: str, body: TeachAsk):
    try:
        await teach.ask(pack_id, body.question)
        return teach.state(pack_id)
    except Exception as e:
        return _teach_err(e)


@app.post("/api/teach/{pack_id}/clarify")
async def teach_clarify(pack_id: str):
    try:
        await teach.clarify(pack_id)
        return teach.state(pack_id)
    except Exception as e:
        return _teach_err(e)


class TeachSubmit(BaseModel):
    code: str = ""
    choice: int | None = None  # 选择/判断题：选项下标；代码题忽略


@app.post("/api/teach/{pack_id}/submit")
async def teach_submit(pack_id: str, body: TeachSubmit):
    try:
        await teach.submit(pack_id, body.code, body.choice)
        return teach.state(pack_id)
    except Exception as e:
        return _teach_err(e)


@app.post("/api/teach/{pack_id}/retry")
async def teach_retry(pack_id: str):
    try:
        await teach.retry(pack_id)
        return teach.state(pack_id)
    except Exception as e:
        return _teach_err(e)


@app.post("/api/teach/{pack_id}/newproblem")
async def teach_newproblem(pack_id: str):
    try:
        await teach.new_problem(pack_id)
        return teach.state(pack_id)
    except Exception as e:
        return _teach_err(e)


@app.post("/api/teach/{pack_id}/advance")
async def teach_advance(pack_id: str):
    try:
        await teach.advance(pack_id)
        return teach.state(pack_id)
    except Exception as e:
        return _teach_err(e)


# ── 阶段 3：练习题库 / 错题本 / 间隔复习 ──────────────────────────────
@app.get("/api/practice/overview")
async def practice_overview():
    return practice.overview()


class PracticeNext(BaseModel):
    mode: str = "due"  # due | wrong | point
    pack_id: str | None = None
    point_id: str | None = None
    wrong_id: str | None = None
    force_new: bool = False  # 仅显式「换一题」为 true；普通取题复用题库


@app.post("/api/practice/next")
async def practice_next(body: PracticeNext):
    try:
        return await practice.next_problem(body.mode, body.pack_id, body.point_id, body.wrong_id,
                                           force_new=body.force_new)
    except Exception as e:
        return _teach_err(e)


class PracticeSubmit(BaseModel):
    pack_id: str
    problem_id: str
    code: str = ""
    wrong_id: str | None = None
    choice: int | None = None


@app.post("/api/practice/submit")
async def practice_submit(body: PracticeSubmit):
    try:
        return await practice.submit(body.pack_id, body.problem_id, body.code, body.wrong_id, body.choice)
    except Exception as e:
        return _teach_err(e)


class PracticeHint(BaseModel):
    pack_id: str
    problem_id: str
    code: str = ""
    choice: int | None = None


@app.post("/api/practice/hint")
async def practice_hint(body: PracticeHint):
    try:
        return await practice.hint(body.pack_id, body.problem_id, body.code, body.choice)
    except Exception as e:
        return _teach_err(e)


@app.get("/api/practice/wrong")
async def practice_wrong():
    return practice.wrong_list()


@app.delete("/api/practice/wrong/{wrong_id}")
async def practice_wrong_del(wrong_id: str):
    return {"ok": practice.wrong_remove(wrong_id)}


# 生产静态托管（开发态由 Vite 伺服，dist 不存在则不挂）
_WEB_DIST = Path(__file__).resolve().parents[1] / "web" / "dist"
if _WEB_DIST.exists():
    app.mount("/", StaticFiles(directory=str(_WEB_DIST), html=True), name="web")