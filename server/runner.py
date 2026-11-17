"""代码执行：复用引擎沙箱（阶段1已实测）。"""
from __future__ import annotations

import glob
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

# 编译型语言：写源文件 → 编译+运行 一条 shell。{src}/{bin} 由平台填临时路径。
# c/cpp 走引擎内置 gcc/g++，不在此表。
_COMPILED_LANGUAGES = {
    "go": ("main.go", 'GOTOOLCHAIN=local GOCACHE=/tmp/mytutor-gocache go run "{src}"'),
    "rust": ("main.rs", 'rustc --edition 2021 -O "{src}" -o "{bin}" && "{bin}"'),
}

_CSHARP_CMD: str | None = None
_CSHARP_PROBED = False
_CSHARP_RUNTIME_VER = "8.0.0"


def _csharp_cmd() -> str | None:
    """探测 dotnet SDK 的 Roslyn csc 与参考程序集；没装返回 None（照实报不支持）。"""
    global _CSHARP_CMD, _CSHARP_PROBED, _CSHARP_RUNTIME_VER
    if _CSHARP_PROBED:
        return _CSHARP_CMD
    _CSHARP_PROBED = True
    csc = sorted(glob.glob("/usr/lib/dotnet/sdk/*/Roslyn/bincore/csc.dll"))
    refs = sorted(glob.glob("/usr/lib/dotnet/packs/Microsoft.NETCore.App.Ref/*/ref/net8.0"))
    if not csc or not refs:
        return None
    refdir = refs[-1]
    flags = " ".join(
        f'-r:"{refdir}/{n}"' for n in sorted(os.listdir(refdir)) if n.endswith(".dll")
    )
    # refdir 形如 …/Microsoft.NETCore.App.Ref/8.0.34/ref/net8.0，上两级才是版本号
    ver = os.path.basename(os.path.dirname(os.path.dirname(refdir)))
    _CSHARP_CMD = (
        'DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 dotnet "' + csc[-1] + '" '
        f'-nologo -noconfig -out:"{{bin}}.dll" {flags} "{{src}}" && '
        'DOTNET_CLI_TELEMETRY_OPTOUT=1 dotnet "{bin}.dll"'
    )
    _CSHARP_RUNTIME_VER = ver
    return _CSHARP_CMD


async def run_code(code: str, language: str, *, timeout: int = 15) -> dict[str, Any]:
    language = (language or "python").lower()
    from deeptutor.tools.exec_tool import ExecTool

    tool = ExecTool()
    if language in ("python", "c", "cpp", "shell"):
        r = await tool.execute(code=code, language=language, timeout=timeout)
        return {"ok": r.success, "output": r.content}

    if language in _EXTRA_LANGUAGES or language in _COMPILED_LANGUAGES or language == "csharp":
        # 经 shell 跑 node / 编译器；源码写入临时文件由引擎管理
        import shutil
        import tempfile
        from pathlib import Path

        if language in _EXTRA_LANGUAGES:
            fname, cmd = _EXTRA_LANGUAGES[language]
            if language in ("typescript", "ts") and shutil.which("tsx"):
                cmd = "tsx {src}"  # 服务器预装 tsx，避免 npx 每次走网络
        elif language == "csharp":
            tpl = _csharp_cmd()
            if tpl is None:
                return {"ok": False, "output": "暂不支持语言: csharp（服务器未装 dotnet SDK）"}
            fname, cmd = "Program.cs", tpl
        else:
            fname, cmd = _COMPILED_LANGUAGES[language]
        with tempfile.TemporaryDirectory(prefix="mytutor_run_") as td:
            src = Path(td) / fname
            src.write_text(code, encoding="utf-8")
            binp = Path(td) / "out"
            if language == "csharp":
                # dotnet 宿主需要 runtimeconfig 才肯执行 dll
                import json

                (Path(td) / "out.runtimeconfig.json").write_text(
                    json.dumps({"runtimeOptions": {
                        "tfm": "net8.0",
                        "rollForward": "latestMinor",
                        "framework": {"name": "Microsoft.NETCore.App", "version": _CSHARP_RUNTIME_VER},
                    }}),
                    encoding="utf-8",
                )
            r = await tool.execute(
                code=cmd.format(src=f'"{src}"', bin=f'"{binp}"'), language="shell", timeout=timeout
            )
            return {"ok": r.success, "output": r.content}

    if language in ("html", "css"):
        return {
            "ok": False,
            "output": "HTML/CSS 用浏览器预览查看效果，不走控制台执行。",
        }

    return {"ok": False, "output": f"暂不支持语言: {language}"}