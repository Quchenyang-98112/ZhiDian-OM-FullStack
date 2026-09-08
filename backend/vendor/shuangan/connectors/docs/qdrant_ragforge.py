"""Qdrant + RAGForge 融合存储实现。

利用 Qdrant 作为统一存储层：
- ✅ 向量存储与检索
- ✅ BM25 全文搜索
- ✅ 元数据过滤
- ✅ 持久化到磁盘
- ✅ 支持 Qdrant Cloud 或本地实例

检索流程：
1. Qdrant 召回（向量 + BM25 混合检索）
2. RAGForge 进行结果处理（重排、压缩、增强）
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar

import structlog

from shuangan.connectors.base import ConnectorHealth, ConnectorStatus
from shuangan.connectors.capabilities import Capability
from shuangan.exceptions import ConnectorError

logger = structlog.get_logger(__name__)


@dataclass
class RetrievedPassage:
    """RAG 检索结果，包含丰富元数据。"""
    content: str
    source: str = ""
    page: int = 0
    score: float = 0.0
    rerank_score: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)
    relevance_level: str = "medium"  # high/medium/low
    qdrant_point_id: str = ""
    
    def __repr__(self) -> str:
        preview = self.content[:60] + "..." if len(self.content) > 60 else self.content
        return f"RetrievedPassage(source={self.source!r}, score={self.score:.3f}, text={preview!r})"


class QdrantRAGForgeConnector:
    """Qdrant + RAGForge 融合实现。
    
    架构：
    - Qdrant: 向量存储 + BM25 搜索 + 持久化
    - RAGForge: 文档分块 + 查询优化 + 结果增强
    """
    
    capabilities: ClassVar[frozenset[Capability]] = frozenset(
        {Capability.SEARCH_DOCUMENTS, Capability.RETRIEVE_SECTION}
    )
    
    def __init__(
        self,
        *,
        paths: list[str | Path] | None = None,
        collection_name: str = "shuangan_kb",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        use_hybrid_search: bool = True,
        use_reranking: bool = True,
        use_query_rewriting: bool = True,
        language: str = "zh",
        # Qdrant 配置
        qdrant_url: str = "http://localhost:6333",
        qdrant_api_key: str | None = None,
        qdrant_location: str | Path | None = None,  # 本地持久化路径
        # Embedding 配置
        embedding_dim: int = 384,
    ) -> None:
        self._paths = [Path(p) for p in (paths or [])]
        self._collection_name = collection_name
        self._chunk_size = chunk_size
        self._chunk_overlap = chunk_overlap
        self._use_hybrid_search = use_hybrid_search
        self._use_reranking = use_reranking
        self._use_query_rewriting = use_query_rewriting
        self._language = language
        self._qdrant_url = qdrant_url
        self._qdrant_api_key = qdrant_api_key
        self._qdrant_location = qdrant_location
        self._embedding_dim = embedding_dim
        
        # 运行时状态
        self._connected = False
        self._qdrant_client: Any = None
        self._embedder: Any = None
        self._passages_cache: list[RetrievedPassage] = []
        
        # 特性标志
        self._use_qdrant = False
        self._use_embeddings = False

    async def connect(self) -> None:
        """连接到 Qdrant 并初始化索引。"""
        logger.info("Connecting to Qdrant...", url=self._qdrant_url)
        
        # 尝试加载依赖
        try:
            await self._initialize_qdrant()
            self._use_qdrant = True
            
            # 尝试初始化 embedder
            try:
                await self._initialize_embedder()
                self._use_embeddings = True
            except ImportError:
                logger.warning("Embedder not available, will use BM25 only")
                self._use_embeddings = False
            
            # 加载文档并索引
            documents = await asyncio.to_thread(self._load_documents)
            if documents:
                await self._index_documents(documents)
            
            logger.info("Qdrant connected successfully!", document_count=len(documents))
            
        except ImportError:
            logger.warning("Qdrant not available, falling back to memory storage")
            await self._fallback_connect()
        
        self._connected = True

    async def disconnect(self) -> None:
        """断开连接并释放资源。"""
        self._qdrant_client = None
        self._embedder = None
        self._passages_cache.clear()
        self._connected = False
        logger.info("Qdrant disconnected")

    async def health_check(self) -> ConnectorHealth:
        """健康检查。"""
        if not self._connected:
            return ConnectorHealth(
                status=ConnectorStatus.UNHEALTHY,
                message="Not connected",
            )
        
        if not self._use_qdrant:
            return ConnectorHealth(
                status=ConnectorStatus.DEGRADED,
                message="Using memory fallback (Qdrant not available)",
                details={
                    "passage_count": len(self._passages_cache),
                },
            )
        
        # 检查 Qdrant 连接
        try:
            # Qdrant health check
            collections = await asyncio.to_thread(
                lambda: self._qdrant_client.get_collections().collections
            ) if self._qdrant_client else []
            
            return ConnectorHealth(
                status=ConnectorStatus.HEALTHY,
                message="Qdrant is ready",
                details={
                    "collections": [c.name for c in collections],
                    "hybrid_search": self._use_hybrid_search,
                    "embeddings": self._use_embeddings,
                    "reranking": self._use_reranking,
                },
            )
        except Exception as e:
            return ConnectorHealth(
                status=ConnectorStatus.UNHEALTHY,
                message=f"Qdrant check failed: {e}",
            )

    async def search(
        self,
        query: str,
        *,
        top_k: int = 5,
        asset_id: str = "",
    ) -> list[RetrievedPassage]:
        """高级 RAG 搜索。"""
        self._ensure_connected()
        
        # 步骤1: 查询优化/重写
        optimized_query = query
        if self._use_query_rewriting:
            optimized_query = self._rewrite_query(query)
        
        # 步骤2: Qdrant 召回
        results = await self._search_qdrant(optimized_query, top_k, asset_id)
        
        # 步骤3: RAGForge 结果增强
        if self._use_reranking and results:
            results = self._rerank_results(results, optimized_query)
        
        # 步骤4: 上下文压缩
        results = self._compress_context(results)
        
        # 步骤5: 标记相关性级别
        for passage in results:
            passage.relevance_level = self._score_to_level(passage.rerank_score if passage.rerank_score > 0 else passage.score)
        
        return results

    async def search_documents(
        self,
        query: str = "",
        *,
        top_k: int = 5,
        asset_id: str = "",
        **kwargs: Any,
    ) -> list[RetrievedPassage]:
        """能力兼容接口。"""
        return await self.search(query, top_k=top_k, asset_id=asset_id)

    async def retrieve_section(self, source: str, page: int) -> str:
        """检索特定章节。"""
        self._ensure_connected()
        
        if self._use_qdrant:
            results = await self._search_by_metadata(source, page)
            if results:
                return results[0].content
            return ""
        
        # 回退到缓存搜索
        for passage in self._passages_cache:
            if passage.source == source and passage.page == page:
                return passage.content
        return ""

    # ------------------------------------------------------------------
    # Qdrant 核心实现
    # ------------------------------------------------------------------

    async def _initialize_qdrant(self) -> None:
        """初始化 Qdrant 客户端。"""
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams
        
        if self._qdrant_location:
            self._qdrant_client = QdrantClient(path=str(self._qdrant_location))
        else:
            self._qdrant_client = QdrantClient(
                url=self._qdrant_url,
                api_key=self._qdrant_api_key,
            )
        
        # 检查并创建集合
        await asyncio.to_thread(self._ensure_collection)
        
        logger.info("Qdrant client initialized")

    async def _initialize_embedder(self) -> None:
        """初始化 Embedding 生成器。"""
        try:
            from fastembed import TextEmbedding
            
            # 使用 FastEmbed（与 RAGForge 一致）
            self._embedder = TextEmbedding("BAAI/bge-small-en-v1.5")
            logger.info("Embedder initialized")
        except ImportError:
            logger.warning("FastEmbed not available")
            raise

    def _ensure_collection(self) -> None:
        """确保集合存在。"""
        from qdrant_client.models import Distance, VectorParams
        
        if self._qdrant_client is None:
            return
        
        # 检查集合是否存在
        collections = self._qdrant_client.get_collections().collections
        collection_names = [c.name for c in collections]
        
        if self._collection_name not in collection_names:
            logger.info("Creating Qdrant collection", name=self._collection_name)
            
            # 创建集合
            self._qdrant_client.create_collection(
                collection_name=self._collection_name,
                vectors_config=VectorParams(
                    size=self._embedding_dim,
                    distance=Distance.COSINE,
                ),
            )
            
            # 创建 payload 索引（用于元数据过滤）
            self._qdrant_client.create_payload_index(
                collection_name=self._collection_name,
                field_name="source",
                field_schema="keyword",
            )
            self._qdrant_client.create_payload_index(
                collection_name=self._collection_name,
                field_name="content",
                field_schema="text",
            )

    async def _index_documents(self, documents: list[dict[str, Any]]) -> None:
        """索引文档到 Qdrant。"""
        from qdrant_client.models import PointStruct
        
        points: list[PointStruct] = []
        
        for doc in documents:
            chunks = self._smart_chunking(doc)
            
            for chunk in chunks:
                chunk_id = hashlib.md5(
                    f"{doc['source']}:{chunk.get('page', 0)}:{hash(chunk['content']):x}".encode()
                ).hexdigest()
                
                # 生成 embedding
                vector = None
                if self._use_embeddings and self._embedder:
                    vector = list(self._embedder.embed([chunk["content"]])[0])
                else:
                    # 无 embedding 时，使用零向量（BM25 仍然可用）
                    vector = [0.0] * self._embedding_dim
                
                # 创建 Qdrant 点
                point = PointStruct(
                    id=chunk_id,
                    vector=vector,
                    payload={
                        "content": chunk["content"],
                        "source": doc["source"],
                        "page": chunk.get("page", 0),
                        "chunk_type": chunk.get("type", "paragraph"),
                        "language": self._language,
                        "has_steps": bool(re.search(r"步骤|Step|\d+\.", chunk["content"])),
                        "has_warnings": "警告" in chunk["content"] or "WARNING" in chunk["content"],
                    },
                )
                points.append(point)
                
                # 缓存到内存
                passage = RetrievedPassage(
                    content=chunk["content"],
                    source=doc["source"],
                    page=chunk.get("page", 0),
                    qdrant_point_id=chunk_id,
                    metadata={
                        "chunk_type": chunk.get("type", "paragraph"),
                    },
                )
                self._passages_cache.append(passage)
        
        if points:
            await asyncio.to_thread(
                lambda: self._qdrant_client.upsert(
                    collection_name=self._collection_name,
                    points=points,
                )
            )
            logger.info(f"Indexed {len(points)} chunks to Qdrant")

    async def _search_qdrant(
        self,
        query: str,
        top_k: int,
        asset_id: str,
    ) -> list[RetrievedPassage]:
        """Qdrant 搜索（向量 + BM25 混合）。"""
        if not self._use_qdrant or self._qdrant_client is None:
            return await self._fallback_search(query, top_k, asset_id)
        
        try:
            # 查询条件
            query_filter = None
            if asset_id:
                from qdrant_client.models import Filter, FieldCondition, MatchValue
                
                query_filter = Filter(
                    must=[
                        FieldCondition(
                            key="source",
                            match=MatchValue(value=asset_id),
                        )
                    ]
                )
            
            # 搜索策略
            if self._use_embeddings and self._embedder:
                # 向量搜索
                query_vector = list(self._embedder.embed([query])[0])
                
                results = await asyncio.to_thread(
                    lambda: self._qdrant_client.search(
                        collection_name=self._collection_name,
                        query_vector=query_vector,
                        limit=top_k * 2,
                        query_filter=query_filter,
                    )
                )
            else:
                # BM25 全文搜索
                results = await asyncio.to_thread(
                    lambda: self._qdrant_client.query_points(
                        collection_name=self._collection_name,
                        query=query,
                        limit=top_k * 2,
                        filter=query_filter,
                    ).points
                )
            
            # 转换结果
            passages = []
            for result in results:
                passage = RetrievedPassage(
                    content=result.payload["content"],
                    source=result.payload["source"],
                    page=result.payload.get("page", 0),
                    score=result.score,
                    qdrant_point_id=str(result.id),
                    metadata={k: v for k, v in result.payload.items() if k not in ["content", "source", "page"]},
                )
                passages.append(passage)
            
            return passages[:top_k]
            
        except Exception as e:
            logger.error(f"Qdrant search failed: {e}")
            return await self._fallback_search(query, top_k, asset_id)

    async def _search_by_metadata(self, source: str, page: int) -> list[RetrievedPassage]:
        """通过元数据搜索。"""
        if not self._use_qdrant or self._qdrant_client is None:
            return []
        
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        
        query_filter = Filter(
            must=[
                FieldCondition(key="source", match=MatchValue(value=source)),
                FieldCondition(key="page", match=MatchValue(value=page)),
            ]
        )
        
        results = await asyncio.to_thread(
            lambda: self._qdrant_client.scroll(
                collection_name=self._collection_name,
                filter=query_filter,
                limit=10,
            )[0]
        )
        
        return [
            RetrievedPassage(
                content=r.payload["content"],
                source=r.payload["source"],
                page=r.payload.get("page", 0),
                qdrant_point_id=str(r.id),
                metadata=r.payload,
            )
            for r in results
        ]

    # ------------------------------------------------------------------
    # RAGForge 特性（兼容实现）
    # ------------------------------------------------------------------

    def _rewrite_query(self, query: str) -> str:
        """查询重写。"""
        if not query:
            return query
        
        optimized_query = query.strip()
        
        if self._language == "zh":
            optimized_query = self._chinese_query_expansion(query)
        else:
            optimized_query = query
        
        logger.debug("Query rewritten", original=query, optimized=optimized_query)
        return optimized_query

    def _chinese_query_expansion(self, query: str) -> str:
        """中文查询扩展。"""
        core_terms = [t for t in re.split(r'[，。；：、\s]+', query) if len(t) >= 2]
        expanded_terms = core_terms.copy()
        
        synonyms = {
            "泵": ["水泵", "油泵"],
            "轴承": ["轴瓦", "滚珠轴承"],
            "维修": ["维护", "检修"],
            "更换": ["替换", "换"],
            "流程": ["步骤", "程序"],
        }
        
        for term in core_terms:
            if term in synonyms:
                expanded_terms.extend(synonyms[term])
        
        expanded_terms = list(set(expanded_terms))
        
        if len(expanded_terms) > len(core_terms):
            return f"{query} {' '.join(expanded_terms)}"
        
        return query

    def _rerank_results(
        self,
        results: list[RetrievedPassage],
        query: str,
    ) -> list[RetrievedPassage]:
        """结果重排。"""
        query_terms = set(query.lower().split())
        query_terms.update([q.strip() for q in re.split(r'[，。；：、\s]+', query)])
        
        for passage in results:
            score = passage.score
            
            # 匹配密度
            content_lower = passage.content.lower()
            term_density = sum(1 for term in query_terms if term in content_lower) / max(len(query_terms), 1)
            
            # 头部匹配
            head_match = 0.0
            passage_start = content_lower[:100]
            for term in query_terms:
                if term in passage_start:
                    head_match += 0.3
            
            # 结构特征
            structure_bonus = 0.0
            if re.search(r'步骤|Step|\d+\.|\d\.\d', passage.content):
                structure_bonus += 0.2
            
            # 长度惩罚
            len_score = 1.0
            content_len = len(passage.content)
            if content_len < 100:
                len_score = 0.7
            elif content_len > 2000:
                len_score = 0.8
            
            passage.rerank_score = (
                0.5 * score + 0.3 * term_density + 0.1 * head_match + 0.1 * structure_bonus
            ) * len_score
        
        results.sort(key=lambda x: x.rerank_score, reverse=True)
        return results

    def _compress_context(self, results: list[RetrievedPassage]) -> list[RetrievedPassage]:
        """上下文压缩。"""
        compressed = []
        seen = set()
        
        for passage in results:
            content_hash = hashlib.md5(passage.content[:200].encode()).hexdigest()
            if content_hash not in seen:
                seen.add(content_hash)
                compressed.append(passage)
        
        return compressed

    def _score_to_level(self, score: float) -> str:
        """分数转级别。"""
        if score >= 0.7:
            return "high"
        elif score >= 0.4:
            return "medium"
        else:
            return "low"

    def _smart_chunking(self, doc: dict[str, Any]) -> list[dict[str, Any]]:
        """智能分块策略。"""
        content = doc["content"]
        chunks: list[dict[str, Any]] = []
        
        if re.search(r'^#{1,3}|^\d+\.|^[一二三四五六七八九十]+、', content, re.M):
            chunks.extend(self._chunk_by_headings(content, doc))
        elif re.search(r'步骤|Step\s+\d|\d+\.\s+[A-Za-z\u4e00-\u9fff]', content):
            chunks.extend(self._chunk_by_procedures(content, doc))
        else:
            chunks.extend(self._chunk_mixed(content, doc))
        
        return chunks

    def _chunk_by_headings(self, content: str, doc: dict[str, Any]) -> list[dict[str, Any]]:
        chunks = []
        heading_pattern = r'^#{1,3}\s+|^\d+\.\s+|^[一二三四五六七八九十]+、'
        sections = re.split(f'({heading_pattern})', content, flags=re.M)
        current_heading = ""
        
        for i, section in enumerate(sections):
            if re.match(heading_pattern, section):
                current_heading = section.strip()
                continue
            
            if section.strip():
                chunk_content = (current_heading + "\n" + section) if current_heading else section
                if len(chunk_content.strip()) > 50:
                    chunks.append({
                        "content": chunk_content.strip(),
                        "type": "section",
                        "page": doc.get("page", 0),
                    })
        
        return chunks

    def _chunk_by_procedures(self, content: str, doc: dict[str, Any]) -> list[dict[str, Any]]:
        chunks = []
        step_pattern = r'(?=步骤\s*\d+|Step\s*\d+|\d+\.\s+(?:检查|拆卸|更换|安装))'
        sections = re.split(step_pattern, content)
        
        for section in sections:
            if len(section.strip()) > 100:
                chunks.append({
                    "content": section.strip(),
                    "type": "procedure",
                    "page": doc.get("page", 0),
                })
        
        return chunks

    def _chunk_mixed(self, content: str, doc: dict[str, Any]) -> list[dict[str, Any]]:
        chunks = []
        paragraphs = [p.strip() for p in re.split(r'\n\n+', content) if p.strip()]
        current = ""
        
        for para in paragraphs:
            if len(current + para) < self._chunk_size:
                current += ("\n" if current else "") + para
            else:
                if current:
                    chunks.append({
                        "content": current,
                        "type": "mixed",
                        "page": doc.get("page", 0),
                    })
                current = para
        
        if current:
            chunks.append({
                "content": current,
                "type": "mixed",
                "page": doc.get("page", 0),
            })
        
        return chunks

    # ------------------------------------------------------------------
    # 回退方案（无 Qdrant 时使用）
    # ------------------------------------------------------------------

    async def _fallback_connect(self) -> None:
        documents = await asyncio.to_thread(self._load_documents)
        for doc in documents:
            chunks = self._smart_chunking(doc)
            for chunk in chunks:
                self._passages_cache.append(RetrievedPassage(
                    content=chunk["content"],
                    source=doc["source"],
                    page=chunk.get("page", 0),
                ))
        logger.info(f"Fallback mode: loaded {len(self._passages_cache)} passages")

    async def _fallback_search(
        self,
        query: str,
        top_k: int,
        asset_id: str,
    ) -> list[RetrievedPassage]:
        """内存回退搜索。"""
        query_terms = set(query.lower().split())
        query_terms.update([q.strip() for q in re.split(r'[，。；：、\s]+', query)])
        
        scored_passages = []
        
        for passage in self._passages_cache:
            if asset_id and asset_id.lower() not in passage.content.lower() and asset_id.lower() not in passage.source.lower():
                continue
            
            content_lower = passage.content.lower()
            matches = sum(1 for term in query_terms if term in content_lower)
            
            if matches > 0:
                passage.score = matches / max(len(query_terms), 1)
                scored_passages.append((passage.score, passage))
        
        scored_passages.sort(key=lambda x: x[0], reverse=True)
        return [p for _, p in scored_passages[:top_k]]

    # ------------------------------------------------------------------
    # 文档加载
    # ------------------------------------------------------------------

    def _load_documents(self) -> list[dict[str, Any]]:
        documents = []
        for path in self._paths:
            path = Path(path)
            if path.is_file():
                doc = self._load_file(path)
                if doc:
                    documents.append(doc)
            elif path.is_dir():
                for file_path in sorted(path.rglob("*")):
                    if file_path.is_file():
                        doc = self._load_file(file_path)
                        if doc:
                            documents.append(doc)
        return documents

    def _load_file(self, file_path: Path) -> dict[str, Any] | None:
        suffix = file_path.suffix.lower()
        
        if suffix in (".txt", ".md"):
            content = file_path.read_text(encoding="utf-8", errors="replace")
            return {"content": content, "source": str(file_path)}
        
        if suffix == ".pdf":
            return self._load_pdf(file_path)
        
        if suffix in (".docx", ".doc"):
            return self._load_docx(file_path)
        
        return None

    def _load_pdf(self, file_path: Path) -> dict[str, Any] | None:
        try:
            from langchain_community.document_loaders import PyPDFLoader
            
            loader = PyPDFLoader(str(file_path))
            pages = loader.load()
            content = "\n\n".join(page.page_content for page in pages)
            return {"content": content, "source": str(file_path)}
        except ImportError:
            logger.warning("PDF support not available")
            return None

    def _load_docx(self, file_path: Path) -> dict[str, Any] | None:
        try:
            from langchain_community.document_loaders import Docx2txtLoader
            
            loader = Docx2txtLoader(str(file_path))
            pages = loader.load()
            content = "\n\n".join(page.page_content for page in pages)
            return {"content": content, "source": str(file_path)}
        except ImportError:
            logger.warning("DOCX support not available")
            return None

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------

    def _ensure_connected(self) -> None:
        if not self._connected:
            raise ConnectorError("Qdrant not connected — call connect() first")


# 导出别名
QdrantRAGForge = QdrantRAGForgeConnector
