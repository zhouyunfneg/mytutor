"""知识库对接：引擎 RAG + 显式嵌入配置（DashScope）。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .config import DATA_DIR, load_settings

KB_DIR = DATA_DIR / "kbs"


def make_embedding_config():
    from deeptutor.services.embedding.config import EmbeddingConfig

    s = load_settings()
    p = s["providers"]["dashscope"]
    if not p.get("api_key"):
        raise ValueError("未配置 DashScope API key：知识库索引需要嵌入服务（设置页填写）")
    # 引擎嵌入客户端按原样请求该 URL（不自动补路径），必须带 /embeddings；
    # 对话客户端仍用 /v1，两者互不影响。
    url = p["base_url"].rstrip("/")
    if not url.endswith("/embeddings"):
        url += "/embeddings"
    return EmbeddingConfig(
        model=s["models"]["embed"],
        api_key=p["api_key"],
        base_url=url,
        effective_url=url,
        binding="openai",
        provider_name="dashscope",
        dim=1024,  # text-embedding-v4/v3 默认维度，固定住保证索引身份稳定
        batch_size=10,  # DashScope 单请求条数上限 20，取保守值
    )


def get_manager():
    from deeptutor.knowledge.manager import KnowledgeBaseManager

    KB_DIR.mkdir(parents=True, exist_ok=True)
    return KnowledgeBaseManager(base_dir=str(KB_DIR))


def get_rag():
    from deeptutor.services.rag.service import RAGService

    return RAGService(kb_base_dir=str(KB_DIR), provider="llamaindex")


def kb_name_for(pack_id: str) -> str:
    return f"pack-{pack_id}"


async def index_documents(pack_id: str, files: list[str]) -> bool:
    from deeptutor.services.embedding.config import embedding_config_scope

    manager = get_manager()
    name = kb_name_for(pack_id)
    if name not in manager.list_knowledge_bases():
        (KB_DIR / name).mkdir(parents=True, exist_ok=True)  # register 要求目录已存在
        manager.register_knowledge_base(name, description=f"MyTutor 语言包 {pack_id} 官方文档")
    rag = get_rag()
    cfg = make_embedding_config()
    # 引擎绑定装饰器在 KB 无绑定记录时会放行到管线内部读全局配置；
    # 用 ContextVar scope 把我们的显式配置绑到整次操作（含工作线程）。
    with embedding_config_scope(cfg):
        return await rag.initialize(
            kb_name=name,
            file_paths=files,
            embedding_config=cfg,
        )


async def search(pack_id: str, query: str, top_k: int = 4) -> dict[str, Any]:
    """返回 {"content": 拼接正文, "sources": [{...元数据}]}。"""
    from deeptutor.services.embedding.config import embedding_config_scope

    rag = get_rag()
    cfg = make_embedding_config()
    with embedding_config_scope(cfg):
        result = await rag.search(
            query=query,
            kb_name=kb_name_for(pack_id),
            top_k=top_k,
            rewrite=False,
            embedding_config=cfg,
        )
    return {"content": result.get("content", ""), "sources": result.get("sources", [])}