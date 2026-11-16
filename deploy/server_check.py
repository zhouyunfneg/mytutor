"""服务器侧直连验证/安装（绕过 HTTP gate，以 mytutor 用户跑）。
用法：python server_check.py test|install <pack>|search <pack> <query>|tree <pack>|summary <pack>
      |teach <pack> start [point_id]|exercise|submit <code>|retry|advance|state
      |notes list [pack]|crud|auto <pack>
"""
import asyncio
import json
import sys

from server import kb, llm, packs


def _show(s: dict) -> None:
    if s is None:
        print("NO SESSION")
        return
    print("step:", s.get("step"), "| point:", s.get("point_id"), "| attempts:", s.get("attempts"))
    if s.get("explain"):
        print(f"--- explain ({len(s['explain'])} chars) ---")
        print(s["explain"])
    if s.get("exercise"):
        print("--- exercise ---")
        print(json.dumps(s["exercise"], ensure_ascii=False, indent=1))
    if s.get("consolidate"):
        print("--- consolidate ---")
        print(json.dumps(s["consolidate"], ensure_ascii=False, indent=1))
    if s.get("hint"):
        print("--- hint ---")
        print(s["hint"])
    if s.get("last_output"):
        print("--- last_output ---")
        print(s["last_output"][:800])
    if s.get("summary"):
        print(f"--- summary ({len(s['summary'])} chars) ---")
        print(s["summary"])


async def main():
    mode = sys.argv[1]
    if mode == "test":
        for p in ("deepseek", "dashscope"):
            print(p, json.dumps(await llm.test_chat(p), ensure_ascii=False))
        print("embed", json.dumps(await llm.test_embedding(), ensure_ascii=False))
    elif mode == "install":
        pid = sys.argv[2]
        await packs._install(pid)
        d = packs.load_pack(pid)
        print(d["status"], d["doc_count"])
        print("\n".join(d["log"][-6:]))
    elif mode == "search":
        r = await kb.search(sys.argv[2], sys.argv[3], top_k=3)
        print("content_len", len(r["content"]))
        print("sources", json.dumps(r["sources"], ensure_ascii=False)[:600])
        print(r["content"][:400])
    elif mode == "tree":
        t = packs.load_tree(sys.argv[2])
        if not t:
            print("NO TREE")
            return
        for m in t["modules"]:
            print("M:", m["title"])
            for s in m["sections"]:
                print("  S:", s["title"], f"({len(s['points'])} points)")
                for p in s["points"]:
                    print("    -", p["id"], p["title"], "|", p["goal"])
    elif mode == "summary":
        # 真实模型写一段小节总结（不动会话），检查质量
        from server import teach

        t = packs.load_tree(sys.argv[2])
        sec = t["modules"][0]["sections"][0]
        listing = "\n".join(f"- {p['title']}：{p['goal']}" for p in sec["points"])
        text = await llm.chat(
            [{"role": "user", "content": teach.SUMMARY_PROMPT.format(kind="小节", points=listing, limit="≤150字")}]
        )
        print(f"len={len(text)}")
        print(text)
    elif mode == "teach":
        from server import teach

        pid, action = sys.argv[2], sys.argv[3]
        if action == "start":
            point = sys.argv[4] if len(sys.argv) > 4 else None
            _show(await teach.start(pid, point))
        elif action == "exercise":
            _show(await teach.to_exercise(pid))
        elif action == "submit":
            _show(await teach.submit(pid, sys.argv[4]))
        elif action == "retry":
            _show(await teach.retry(pid))
        elif action == "advance":
            _show(await teach.advance(pid))
        elif action == "state":
            _show(teach.state(pid))
        else:
            raise SystemExit(f"unknown teach action: {action}")
    elif mode == "notes":
        from server import notes

        action = sys.argv[2]
        if action == "list":
            pid = sys.argv[3] if len(sys.argv) > 3 else None
            lst = notes.list_notes(pack_id=pid)
            print("count", len(lst))
            for n in lst[:20]:
                print(n["kind"], n.get("sub"), "|", n["title"], "|", n["created_at"])
        elif action == "crud":
            n = await notes.add_note(kind="manual", title="__test__", content="测试内容", pack_id="python")
            ok1 = any(x["id"] == n["id"] for x in notes.list_notes())
            up = await notes.update_note(n["id"], title="__test2__")
            ok2 = up and up["title"] == "__test2__"
            ok3 = await notes.delete_note(n["id"])
            ok4 = not any(x["id"] == n["id"] for x in notes.list_notes())
            print("CRUD", "PASS" if all([ok1, ok2, ok3, ok4]) else "FAIL", ok1, ok2, ok3, ok4)
        elif action == "auto":
            # 真实 LLM 生成一则自动笔记（合成会话+独立 scope，不碰用户学习会话，测完即删）
            pid = sys.argv[3]
            t = packs.load_tree(pid)
            real = t["modules"][0]["sections"][0]["points"][0]
            p = {"id": "__notes_check__", "title": real["title"], "goal": real.get("goal", "")}
            s = {"explain": "这是合成测试讲解：赋值用等号，把值存进变量。",
                 "exercise": {"task": "把 1 存进 x"}, "consolidate": {"task": "把 2 存进 x"},
                 "attempts": 2,
                 "hint_log": [{"phase": "exercise", "output": "AssertionError", "hint": "看看等号右边的数", "code": "x=9"}]}
            n = await notes.auto_point_note(pid, s, p)
            print("--- auto note (real LLM) ---")
            print(n["title"])
            print(n["content"])
            await notes.delete_note(n["id"])
            print("cleaned:", not any(x["id"] == n["id"] for x in notes.list_notes()))
        else:
            raise SystemExit(f"unknown notes action: {action}")


asyncio.run(main())