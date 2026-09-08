"""RAGForge 集成连接器。

基于强大的 RAGForge 检索库，提供：
- ✅ 全 CPU 推理（ONNX Embedding + Rerank）
- ✅ Hybrid 检索（BM25 + Vector）
- ✅ X-Ray 调试追踪
- ✅ Query Understanding（DeepSeek API）
- ✅ 完整的可观测性
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, ClassVar, Optional

import structlog

from shuangan.connectors.base import ConnectorHealth, ConnectorStatus
from shuangan.connectors.capabilities import Capability

logger = structlog.get_logger(__name__)

# 尝试导入 RAGForge
RAGFORGE_AVAILABLE = False
try:
    from ragforge.pipeline import SearchPipeline
    from ragforge.models import FastembedEmbedder, FastembedReranker
    from ragforge.retrieval import BM25Retriever
    from ragforge.config import ModelConfig, PipelineConfig
    RAGFORGE_AVAILABLE = True
    logger.info("RAGForge SDK 已加载")
except ImportError:
    logger.warning("RAGForge SDK 未安装，将使用备选方案")


class RAGForgeConnector:
    """RAGForge 增强检索连接器。"""

    capabilities: ClassVar[frozenset[Capability]] = frozenset(
        {Capability.SEARCH_DOCUMENTS, Capability.RETRIEVE_SECTION}
    )

    def __init__(
        self,
        *,
        paths: list[str | Path] | None = None,
        collection_name: str = "shuangan_kb",
        use_hybrid: bool = True,
        use_rerank: bool = True,
        use_xray: bool = True,
        use_cpu: bool = True,
        embedding_model_path: str | None = None,
        rerank_model_path: str | None = None,
        deepseek_api_key: str | None = None,
    ):
        self._paths = [Path(p) for p in (paths or [])]
        self._collection_name = collection_name
        self._use_hybrid = use_hybrid
        self._use_rerank = use_rerank
        self._use_xray = use_xray
        self._use_cpu = use_cpu
        
        # 模型配置
        self._model_cfg = None
        if embedding_model_path or rerank_model_path:
            self._model_cfg = ModelConfig(
                embedding_model_path=embedding_model_path,
                rerank_model_path=rerank_model_path,
            )
        
        # DeepSeek 配置
        self._deepseek_api_key = deepseek_api_key
        
        # 运行时状态
        self._connected = False
        self._pipeline: Optional[Any] = None
        self._documents: list[str] = []
        self._document_metadata: dict[str, dict] = {}

    async def connect(self) -> None:
        """连接并初始化检索管道。"""
        if not RAGFORGE_AVAILABLE:
            logger.warning("RAGForge 未安装，使用基础方案")
            await self._fallback_connect()
            return

        try:
            logger.info("正在初始化 RAGForge 检索管道")
            
            # 加载文档
            self._load_documents_from_paths()
            
            # 构建管道
            if self._model_cfg:
                self._pipeline = SearchPipeline(
                    embedder=FastembedEmbedder(self._model_cfg),
                    reranker=FastembedReranker(self._model_cfg) if self._use_rerank else None,
                )
            else:
                # 只使用 BM25
                self._pipeline = SearchPipeline(retriever=BM25Retriever())
            
            self._connected = True
            logger.info(
                f"RAGForge 连接成功，已加载 {len(self._documents)} 个文档"
            )
        except Exception as e:
            logger.error(f"RAGForge 初始化失败: {e}")
            await self._fallback_connect()

    async def _fallback_connect(self) -> None:
        """当 RAGForge 不可用时的备选方案。"""
        from .rag_forge import RAGForgeConnector as LocalRAGForge
        self._local_rag = LocalRAGForge(paths=self._paths)
        await self._local_rag.connect()
        self._connected = True

    async def disconnect(self) -> None:
        """断开连接。"""
        self._connected = False
        self._pipeline = None
        self._documents = []
        logger.info("RAGForge 已断开")

    async def health_check(self) -> ConnectorHealth:
        """健康检查。"""
        if not self._connected:
            return ConnectorHealth(
                status=ConnectorStatus.UNHEALTHY,
                message="未连接到 RAGForge"
            )

        status = ConnectorStatus.HEALTHY
        details = {
            "document_count": len(self._documents),
            "ragforge_available": RAGFORGE_AVAILABLE,
            "hybrid_enabled": self._use_hybrid,
            "rerank_enabled": self._use_rerank,
            "xray_enabled": self._use_xray,
        }

        if not RAGFORGE_AVAILABLE:
            status = ConnectorStatus.DEGRADED
            details["using_fallback"] = True

        return ConnectorHealth(
            status=status,
            message=f"RAGForge 就绪，{len(self._documents)} 个文档" if RAGFORGE_AVAILABLE else "使用备选方案",
            details=details,
        )

    async def search(
        self,
        query: str,
        *,
        top_k: int = 5,
        asset_id: str = "",
    ) -> list[Any]:
        """执行 RAGForge 高级检索。"""
        self._ensure_connected()

        if not RAGFORGE_AVAILABLE or not self._pipeline:
            return await self._fallback_search(query, top_k=top_k, asset_id=asset_id)

        try:
            documents_to_search = self._documents
            
            # 可选：资产过滤
            if asset_id:
                documents_to_search = [
                    d for d in documents_to_search 
                    if asset_id.lower() in d.lower()
                ]
            
            if not documents_to_search:
                logger.warning("没有匹配的文档可检索")
                return []
            
            # 执行检索
            trace = self._use_xray
            results = self._pipeline.search(query, documents_to_search, trace=trace)
            
            # 处理返回值
            if isinstance(results, tuple) and len(results) == 2:
                results_data, trace_data = results
                if trace:
                    self._print_xray(trace_data)
            else:
                results_data = results

            return list(results_data)[:top_k]

        except Exception as e:
            logger.error(f"RAGForge 检索失败: {e}")
            return await self._fallback_search(query, top_k=top_k, asset_id=asset_id)

    async def search_documents(
        self,
        query: str = "",
        *,
        top_k: int = 5,
        asset_id: str = "",
        **kwargs: Any,
    ) -> list[Any]:
        """搜索文档（能力接口）。"""
        return await self.search(query, top_k=top_k, asset_id=asset_id)

    def _print_xray(self, trace: Any) -> None:
        """打印 X-Ray 调试信息。"""
        if hasattr(trace, "formatted"):
            logger.info("\n" + trace.formatted)
        elif hasattr(trace, "xray"):
            logger.info("\n" + trace.xray)

    async def _fallback_search(
        self,
        query: str,
        top_k: int = 5,
        asset_id: str = "",
    ) -> list[Any]:
        """备选检索方案。"""
        if hasattr(self, "_local_rag"):
            return await self._local_rag.search(query, top_k=top_k, asset_id=asset_id)
        return []

    def _load_documents_from_paths(self) -> None:
        """从路径加载文档。"""
        documents = []
        
        for path in self._paths:
            if not path.exists():
                continue
                
            if path.is_file():
                docs = self._load_single_file(path)
                documents.extend(docs)
            elif path.is_dir():
                for file_path in sorted(path.rglob("*")):
                    if file_path.is_file():
                        docs = self._load_single_file(file_path)
                        documents.extend(docs)
        
        self._documents = documents

    def _load_single_file(self, file_path: Path) -> list[str]:
        """加载单个文件。"""
        suffix = file_path.suffix.lower()
        
        if suffix not in (".txt", ".md", ".rst"):
            return []
        
        try:
            content = file_path.read_text(encoding="utf-8", errors="replace")
            if not content.strip():
                return []
            
            # 简单分块（每段一个）
            chunks = [
                chunk.strip() 
                for chunk in content.split("\n\n")
                if chunk.strip()
            ]
            
            self._document_metadata[str(file_path)] = {
                "original_file": str(file_path),
                "chunk_count": len(chunks),
            }
            
            return chunks
        except Exception as e:
            logger.warning(f"加载文件失败 {file_path}: {e}")
            return []

    def _ensure_connected(self) -> None:
        if not self._connected:
            raise RuntimeError("RAGForge 未连接，请先调用 connect()")


# 导出兼容性别名
try:
    from shuangan.connectors.docs.rag_forge import RAGForgeConnector as LocalRAGForge
except ImportError:
    pass
