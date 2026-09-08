"""Small local knowledge-library adapter used by the demo API."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent / "data" / "knowledge"
UPLOAD_ROOT = Path(__file__).resolve().parent / "data" / "runtime" / "knowledge"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
META_PATH = UPLOAD_ROOT / ".metadata.json"


def _metadata() -> dict[str, dict[str, str]]:
    if not META_PATH.exists():
        return {}
    try:
        return json.loads(META_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_metadata(metadata: dict[str, dict[str, str]]) -> None:
    META_PATH.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_name(name: str) -> str:
    cleaned = re.sub(r"[^\w\u4e00-\u9fff.()（）-]+", "_", name).strip("._")
    return cleaned or "未命名文档.md"


def _folder_for(path: Path) -> str:
    relative = path.relative_to(ROOT if path.is_relative_to(ROOT) else UPLOAD_ROOT)
    return relative.parts[0] if len(relative.parts) > 1 else "未分类"


def _system_for(text: str) -> str:
    for name in ("锅炉系统", "汽轮机系统", "给水系统", "风烟系统", "环保系统", "电气系统"):
        if name in text:
            return name
    return "通用"


def list_documents() -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for base in (ROOT, UPLOAD_ROOT):
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.name.startswith("."):
                continue
            stat = path.stat()
            content = path.read_text(encoding="utf-8", errors="ignore") if path.suffix.lower() in {".md", ".txt", ".json"} else ""
            digest = hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:12]
            folder = _folder_for(path)
            item = {
                "id": f"kb-{digest}",
                "name": path.name,
                "fileType": path.suffix.lstrip(".").upper() or "FILE",
                "size": f"{stat.st_size / 1024:.1f} KB" if stat.st_size < 1024 * 1024 else f"{stat.st_size / 1024 / 1024:.1f} MB",
                "folder": folder,
                "system": _system_for(f"{path.name} {content[:2000]}"),
                "status": "已解析" if content or path.suffix.lower() == ".md" else "未解析",
                "chunks": max(1, len(re.findall(r"\S+", content)) // 80) if content else 0,
                "updatedAt": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                "source": "内置知识库" if base == ROOT else "用户上传",
                "path": str(path.relative_to(base)),
            }
            if base == UPLOAD_ROOT:
                metadata = _metadata().get(str(path.relative_to(UPLOAD_ROOT)), {})
                item["folder"] = metadata.get("folder", item["folder"])
                item["system"] = metadata.get("system", item["system"])
            documents.append(item)
    return sorted(documents, key=lambda item: item["updatedAt"], reverse=True)


def find_path(document_id: str) -> Path | None:
    for item in list_documents():
        if item["id"] == document_id:
            base = ROOT if item["source"] == "内置知识库" else UPLOAD_ROOT
            path = base / item["path"]
            return path if path.exists() else None
    return None


def read_document(document_id: str) -> str:
    path = find_path(document_id)
    if not path:
        raise FileNotFoundError(document_id)
    if path.suffix.lower() not in {".md", ".txt", ".json"}:
        return "该文件已建立索引；当前演示适配器只直接展示 Markdown、TXT、JSON 内容。"
    return path.read_text(encoding="utf-8", errors="ignore")


def rename_document(document_id: str, name: str) -> dict[str, Any]:
    path = find_path(document_id)
    if not path:
        raise FileNotFoundError(document_id)
    new_path = path.with_name(_safe_name(name))
    if path.is_relative_to(UPLOAD_ROOT):
        metadata = _metadata()
        old_key = str(path.relative_to(UPLOAD_ROOT))
        new_key = str(new_path.relative_to(UPLOAD_ROOT))
        if old_key in metadata:
            metadata[new_key] = metadata.pop(old_key)
            _save_metadata(metadata)
    path.rename(new_path)
    base = UPLOAD_ROOT if new_path.is_relative_to(UPLOAD_ROOT) else ROOT
    relative = str(new_path.relative_to(base))
    return next(item for item in list_documents() if item["path"] == relative)


def delete_document(document_id: str) -> None:
    path = find_path(document_id)
    if not path:
        raise FileNotFoundError(document_id)
    if path.is_relative_to(ROOT):
        raise PermissionError("内置知识库文档不可删除，请复制后再管理")
    metadata = _metadata()
    metadata.pop(str(path.relative_to(UPLOAD_ROOT)), None)
    _save_metadata(metadata)
    path.unlink()


def save_upload(filename: str, content: bytes, folder: str, system: str) -> dict[str, Any]:
    folder_path = UPLOAD_ROOT / _safe_name(folder or "未分类")
    folder_path.mkdir(parents=True, exist_ok=True)
    path = folder_path / _safe_name(filename)
    path.write_bytes(content)
    metadata = _metadata()
    metadata[str(path.relative_to(UPLOAD_ROOT))] = {"folder": folder or "未分类", "system": system or "通用"}
    _save_metadata(metadata)
    return next(item for item in list_documents() if item["path"] == str(path.relative_to(UPLOAD_ROOT)))


def search_documents(query: str) -> list[dict[str, Any]]:
    needle = query.strip().lower()
    if not needle:
        return list_documents()
    results: list[dict[str, Any]] = []
    for item in list_documents():
        try:
            content = read_document(item["id"])
        except (FileNotFoundError, UnicodeError):
            content = ""
        haystack = f"{item['name']} {item['folder']} {item['system']} {content}".lower()
        if needle in haystack:
            results.append(item)
    return results
