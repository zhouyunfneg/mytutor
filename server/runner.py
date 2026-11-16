"""代码执行：复用引擎沙箱（阶段1已实测）。"""
from __future__ import annotations

import os
from typing import Any

# Windows 免 Docker 沙箱开关，必须在导入引擎沙箱前设置
os.environ.setdefault("DEEPTUTOR_SANDBOX_ALLOW_SUBPROCESS", "1")

# 语言 → (源文件名, 运行命令模板)。python 走引擎内置；js/ts 经 node。
_EXTRA_LANGUAGES = {
    "javascript": ("main.js", "node {src}"),
    "js": ("main.js", "node {src}"),
    "typescript": ("main.ts", "npx --yes tsx {src}"),
    "ts": ("main.ts", "npx --yes tsx {src}"),
}


async def run_code(code: str, language: str, *, timeout: int = 15) -> dict[str, Any]:
    language = (language or "python").lower()
    from deeptutor.tools.exec_tool import ExecTool

    tool = ExecTool()
    if language in ("python", "c", "cpp", "shell"):
        r = await tool.execute(code=code, language=language, timeout=timeout)
        return {"ok": r.success, "output": r.content}

    if language in _EXTRA_LANGUAGES:
        # 经 shell 跑 node（阶段1实测 Node v24 可用）；源码写入临时文件由引擎管理
        import shutil
        import tempfile
        from pathlib import Path

        fname, cmd = _EXTRA_LANGUAGES[language]
        if language in ("typescript", "ts") and shutil.which("tsx"):
            cmd = "tsx {src}"  # 服务器预装 tsx，避免 npx 每次走网络
        with tempfile.TemporaryDirectory(prefix="mytutor_run_") as td:
            src = Path(td) / fname
            src.write_text(code, encoding="utf-8")
            r = await tool.execute(
                code=cmd.format(src=f'"{src}"'), language="shell", timeout=timeout
            )
            return {"ok": r.success, "output": r.content}

    if language in ("html", "css"):
        return {
            "ok": False,
            "output": "HTML/CSS 用浏览器预览查看效果，不走控制台执行。",
        }

    return {"ok": False, "output": f"暂不支持语言: {language}"}