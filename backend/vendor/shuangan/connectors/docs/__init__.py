"""Document and knowledge connector implementations."""

from shuangan.connectors.docs.document_store import DocumentStoreConnector
from shuangan.connectors.docs.rag_forge import RAGForgeConnector as LocalRAGForgeConnector
from shuangan.connectors.docs.ragforge import RAGForgeConnector
from shuangan.connectors.docs.qdrant_ragforge import QdrantRAGForgeConnector
from shuangan.connectors.docs.excel import ExcelCsvConnector

# 兼容性别名
RAGForge = RAGForgeConnector
QdrantRAGForge = QdrantRAGForgeConnector

__all__ = [
    "DocumentStoreConnector",
    "RAGForgeConnector",
    "RAGForge",
    "LocalRAGForgeConnector",
    "QdrantRAGForgeConnector",
    "QdrantRAGForge",
    "ExcelCsvConnector",
]

