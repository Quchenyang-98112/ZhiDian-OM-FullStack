"""FastAPI adapter that exposes simulation, knowledge and agent APIs.

The adapter is deliberately independent of the existing Node API. Vite sends
only the plant/agent/knowledge/llm namespaces here, while unrelated Nexus
routes keep using the original Express service.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import knowledge
from .simulation import SCENARIOS, simulation


class ScenarioRequest(BaseModel):
    scenario: str = Field(default="正常运行")


class KnowledgeRenameRequest(BaseModel):
    name: str


class LlmConfigRequest(BaseModel):
    provider: str
    baseUrl: str
    model: str
    apiKey: str


class ChatRequest(BaseModel):
    messages: list[dict[str, str]]
    temperature: float = 0.2
    maxTokens: int = 1200


class AgentTaskRequest(BaseModel):
    """Optional operator-selected context for an agent run."""

    unitId: str | None = None
    deviceId: str | None = None
    measurementPointId: str | None = None
    timeWindow: str = "最近 30 分钟"


app = FastAPI(title="智电运维 FastAPI Adapter", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5178", "http://localhost:5178", "http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_llm_config: dict[str, str] | None = None


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "healthy", "mode": "simulation", "service": "zhidian-fastapi-adapter", "scenario": simulation.scenario}


@app.get("/api/plant/overview")
async def plant_overview() -> dict[str, Any]:
    return simulation.snapshot()


@app.get("/api/plant/health")
async def plant_health() -> dict[str, Any]:
    return await health()


@app.get("/api/simulation/scenario")
async def get_scenario() -> dict[str, Any]:
    return {"scenario": simulation.scenario, "available": list(SCENARIOS)}


@app.post("/api/simulation/scenario")
async def set_scenario(payload: ScenarioRequest) -> dict[str, Any]:
    return {"scenario": simulation.set_scenario(payload.scenario), "snapshot": simulation.snapshot()}


async def _telemetry_events() -> AsyncIterator[str]:
    for _ in range(30):
        simulation.tick += 1
        yield f"event: snapshot\ndata: {json.dumps(simulation.snapshot(), ensure_ascii=False)}\n\n"
        await asyncio.sleep(2)


@app.get("/api/plant/stream")
async def plant_stream() -> StreamingResponse:
    return StreamingResponse(_telemetry_events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


def _resolve_task(payload: AgentTaskRequest | None = None) -> dict[str, Any]:
    snap = simulation.snapshot()
    devices = snap["devices"]
    points = snap["measurementPoints"]
    unit_id = payload.unitId if payload and payload.unitId else "unit-2"
    device = next((item for item in devices if item["id"] == (payload.deviceId if payload else None)), None)
    if device is None:
        device = next((item for item in devices if item["unitId"] == unit_id), devices[0])
    unit_id = device["unitId"]
    point = next((item for item in points if item["id"] == (payload.measurementPointId if payload else None)), None)
    if point is None:
        point = next((item for item in points if item["deviceId"] == device["id"]), points[0])
    return {
        "unitId": unit_id,
        "unitName": device["unitName"],
        "deviceId": device["id"],
        "deviceName": device["name"],
        "system": device["system"],
        "measurementPointId": point["id"],
        "measurementPointName": point["name"],
        "value": point["value"],
        "unit": point["unit"],
        "timeWindow": payload.timeWindow if payload and payload.timeWindow else "最近 30 分钟",
    }


def _agent_report(role: str, task: dict[str, Any] | None = None) -> dict[str, Any]:
    snap = simulation.snapshot()
    scenario = simulation.scenario
    context = task or _resolve_task()
    if role == "monitor":
        return {
            "agent": "监控 Agent",
            "status": "已完成",
            "summary": f"已完成 {context['unitName']} / {context['deviceName']} / {context['measurementPointName']} 的测点质量检查，当前场景为“{scenario}”。",
            "findings": ["实时数据连续性正常", f"当前值 {context['value']} {context['unit']}，已标记异常与能效候选", f"已关联 {context['timeWindow']} 的历史窗口"],
            "next": "正常或能效偏低路径进入双碳分析；异常路径交给诊断 Agent。",
            "task": context,
            "snapshot": snap,
        }
    if role == "diagnosis":
        return {
            "agent": "诊断 Agent",
            "status": "已完成",
            "summary": f"已结合 {context['deviceName']} 的实时异常、历史曲线、规程与历史案例形成诊断证据链。",
            "findings": [f"{context['measurementPointName']} 当前值 {context['value']} {context['unit']}", "知识库检索结果已与设备系统和历史案例交叉验证", f"证据置信度 86%，时间窗口为 {context['timeWindow']}"],
            "next": "将候选措施交给决策 Agent 进行安全、能耗、碳排和成本比较。",
            "task": context,
            "evidence": knowledge.search_documents(f"{context['deviceName']} {context['system']}")[:6],
        }
    return {
        "agent": "决策 Agent",
        "status": "待人工确认",
        "summary": "已完成三类措施的多目标比较，安全约束优先。",
        "recommended": "碳感知运行优化" if scenario == "新能源消纳" else "维护时机优化",
        "task": context,
        "options": [
            {"name": "运行参数优化", "carbonReduction": "8.25 kgCO₂e/h", "score": 91, "risk": "低", "cost": "低"},
            {"name": "维护时机优化", "carbonReduction": "52.8 kgCO₂e/日", "score": 94, "risk": "中", "cost": "中"},
            {"name": "碳感知运行优化", "carbonReduction": "420 kgCO₂e/日", "score": 96, "risk": "低", "cost": "低"},
        ],
        "approvalRequired": True,
    }


def _clean_llm_output(text: str) -> str:
    """Turn model output into user-facing Chinese prose instead of raw JSON."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(line for line in lines if not line.strip().startswith("```")).strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        return cleaned
    if not isinstance(payload, dict):
        return cleaned
    parts: list[str] = []
    for key in ("summary", "answer", "recommendation", "recommended", "next"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
    findings = payload.get("findings")
    if isinstance(findings, list):
        parts.extend(f"{index + 1}. {item}" for index, item in enumerate(findings) if isinstance(item, str))
    options = payload.get("options")
    if isinstance(options, list):
        names = [item.get("name") for item in options if isinstance(item, dict) and item.get("name")]
        if names:
            parts.append(f"可比较方案：{'、'.join(str(name) for name in names)}。")
    return "\n".join(parts) or "模型已返回结果，但未生成可展示的中文说明。"


async def _enrich_with_llm(role: str, report: dict[str, Any]) -> dict[str, Any]:
    """Let the configured model explain the deterministic evidence.

    Deterministic rules remain the safe fallback and provide repeatable demo
    data. When a key is configured, the same three roles can additionally
    produce a model-backed explanation through the ShuangAn LiteLLM boundary.
    """
    if not _llm_config:
        report["llmEnabled"] = False
        return report
    prompt = {
        "monitor": "请作为监控 Agent，根据电厂测点和当前场景，概括异常、能效偏差和下一步分支。",
        "diagnosis": "请作为诊断 Agent，根据异常、历史曲线和知识库证据，说明候选原因、证据充分度和维护时机建议。",
        "decision": "请作为决策 Agent，根据三类措施比较，说明安全优先的综合推荐和预计双碳收益。",
    }[role]
    prompt += "只输出面向值长和运维人员的简体中文自然语言，不要输出 JSON、代码块、字段名或完整数据对象。"
    try:
        result = await _call_llm_via_shuangan(
            [
                {"role": "system", "content": "你是智电运维火力发电厂多 Agent 系统的一部分。只基于给定数据，不虚构现场事实。"},
                {"role": "user", "content": f"{prompt}\n\n结构化结果：{json.dumps(report, ensure_ascii=False)}"},
            ],
            0.2,
            1200,
        )
        report["llmEnabled"] = True
        report["llmOutput"] = _clean_llm_output(result["content"])
        report["llmModel"] = result["model"]
    except Exception as exc:
        report["llmEnabled"] = True
        report["llmError"] = f"模型调用失败，已保留规则引擎结果：{exc}"
    return report


@app.post("/api/agents/{role}/run")
async def run_agent(role: str, payload: AgentTaskRequest | None = None) -> dict[str, Any]:
    if role not in {"monitor", "diagnosis", "decision"}:
        raise HTTPException(status_code=404, detail="未知 Agent")
    return await _enrich_with_llm(role, _agent_report(role, _resolve_task(payload)))


async def _collaboration_events(task: dict[str, Any]) -> AsyncIterator[str]:
    steps = [("monitor", "监控 Agent", "完成测点质量检查与异常分支判断"), ("diagnosis", "诊断 Agent", "检索规程、历史案例与时间窗口"), ("decision", "决策 Agent", "比较三类措施并生成综合决策")]
    for role, agent, text in steps:
        yield f"event: progress\ndata: {json.dumps({'role': role, 'agent': agent, 'text': text, 'status': 'running'}, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0.7)
        result = await _enrich_with_llm(role, _agent_report(role, task))
        yield f"event: result\ndata: {json.dumps(result, ensure_ascii=False)}\n\n"
    yield f"event: complete\ndata: {json.dumps({'status': 'completed'}, ensure_ascii=False)}\n\n"


@app.post("/api/agents/collaboration/stream")
async def collaboration_stream(payload: AgentTaskRequest | None = None) -> StreamingResponse:
    return StreamingResponse(_collaboration_events(_resolve_task(payload)), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/api/knowledge/documents")
async def get_documents() -> list[dict[str, Any]]:
    return knowledge.list_documents()


@app.get("/api/knowledge/search")
async def search_documents(q: str = "") -> list[dict[str, Any]]:
    return knowledge.search_documents(q)


@app.get("/api/knowledge/documents/{document_id}/content")
async def document_content(document_id: str) -> dict[str, str]:
    try:
        return {"content": knowledge.read_document(document_id)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="文档不存在") from exc


@app.post("/api/knowledge/documents")
async def upload_document(
    file: UploadFile = File(...),
    folder: str = Form("未分类"),
    system: str = Form("通用"),
) -> dict[str, Any]:
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="单个文件不能超过 20 MB")
    return knowledge.save_upload(file.filename or "未命名文档", content, folder, system)


@app.post("/api/knowledge/documents/{document_id}/parse")
async def parse_document(document_id: str) -> dict[str, Any]:
    try:
        item = next(item for item in knowledge.list_documents() if item["id"] == document_id)
        return {**item, "status": "已解析", "chunks": max(1, item["chunks"] or len(item["name"]) * 2)}
    except StopIteration as exc:
        raise HTTPException(status_code=404, detail="文档不存在") from exc


@app.patch("/api/knowledge/documents/{document_id}")
async def rename_document(document_id: str, payload: KnowledgeRenameRequest) -> dict[str, Any]:
    try:
        return knowledge.rename_document(document_id, payload.name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="文档不存在") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@app.delete("/api/knowledge/documents/{document_id}")
async def delete_document(document_id: str) -> dict[str, bool]:
    try:
        knowledge.delete_document(document_id)
        return {"deleted": True}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="文档不存在") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@app.get("/api/llm/config")
async def get_llm_config() -> dict[str, Any]:
    if not _llm_config:
        return {"configured": False}
    return {"configured": True, "provider": _llm_config["provider"], "baseUrl": _llm_config["baseUrl"], "model": _llm_config["model"], "apiKeyMasked": f"{_llm_config['apiKey'][:4]}••••{_llm_config['apiKey'][-4:]}"}


@app.put("/api/llm/config")
async def put_llm_config(payload: LlmConfigRequest) -> dict[str, Any]:
    global _llm_config
    if not payload.apiKey.strip():
        raise HTTPException(status_code=400, detail="API Key 不能为空")
    _llm_config = payload.model_dump()
    return await get_llm_config()


async def _call_llm_via_shuangan(
    messages: list[dict[str, str]], temperature: float, max_tokens: int
) -> dict[str, Any]:
    """Use the vendored ShuangAn-compatible LiteLLM boundary.

    The original framework's ``LLMProvider`` delegates to LiteLLM. Keeping the
    key in this process and passing it only to this call preserves the same
    boundary without writing the secret to a backend file or environment file.
    """
    import litellm

    provider = _llm_config["provider"].lower()
    provider_name = "openai" if provider == "custom" else provider
    model_name = f"{provider_name}/{_llm_config['model']}"
    response = await litellm.acompletion(
        model=model_name,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        api_key=_llm_config["apiKey"],
        api_base=_llm_config["baseUrl"].rstrip("/"),
        timeout=60,
    )
    return {
        "content": str(response.choices[0].message.content or ""),
        "model": str(getattr(response, "model", _llm_config["model"])),
        "source": "shuang-an-llm-provider",
    }


def _call_llm_sync(messages: list[dict[str, str]], temperature: float, max_tokens: int) -> dict[str, Any]:
    if not _llm_config:
        raise RuntimeError("LLM 尚未配置")
    try:
        return asyncio.run(_call_llm_via_shuangan(messages, temperature, max_tokens))
    except Exception:
        # Keep a small OpenAI-compatible fallback for custom endpoints that do
        # not have a LiteLLM provider mapping.
        pass
    base_url = _llm_config["baseUrl"].rstrip("/")
    if not base_url.endswith("/v1") and "openai" in _llm_config["provider"].lower():
        base_url = f"{base_url}/v1"
    request = Request(
        f"{base_url}/chat/completions",
        data=json.dumps({"model": _llm_config["model"], "messages": messages, "temperature": temperature, "max_tokens": max_tokens}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {_llm_config['apiKey']}"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return {"content": payload.get("choices", [{}])[0].get("message", {}).get("content", ""), "model": payload.get("model", _llm_config["model"]), "source": "llm"}
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"LLM 请求失败：{exc}") from exc


@app.post("/api/llm/chat")
async def chat(payload: ChatRequest) -> dict[str, Any]:
    if not _llm_config:
        raise HTTPException(status_code=400, detail="请先在前端配置 LLM API")
    try:
        return await asyncio.to_thread(_call_llm_sync, payload.messages, payload.temperature, payload.maxTokens)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


async def _llm_text_stream(
    messages: list[dict[str, str]], temperature: float, max_tokens: int
) -> AsyncIterator[str]:
    """Yield model text chunks for the floating assistant."""
    if not _llm_config:
        raise RuntimeError("请先在前端配置 LLM API")
    try:
        import litellm

        provider = _llm_config["provider"].lower()
        provider_name = "openai" if provider == "custom" else provider
        response = await litellm.acompletion(
            model=f"{provider_name}/{_llm_config['model']}",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            api_key=_llm_config["apiKey"],
            api_base=_llm_config["baseUrl"].rstrip("/"),
            timeout=60,
            stream=True,
        )
        async for chunk in response:
            content = getattr(chunk.choices[0].delta, "content", None)
            if content:
                yield str(content)
        return
    except Exception:
        # A custom endpoint may not support LiteLLM streaming. The fallback
        # still returns one Chinese answer instead of exposing a raw object.
        result = await asyncio.to_thread(_call_llm_sync, messages, temperature, max_tokens)
        yield _clean_llm_output(result["content"])


@app.post("/api/llm/chat/stream")
async def chat_stream(payload: ChatRequest) -> StreamingResponse:
    async def events() -> AsyncIterator[str]:
        try:
            async for text in _llm_text_stream(payload.messages, payload.temperature, payload.maxTokens):
                yield f"event: token\ndata: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"
            yield "event: complete\ndata: {\"status\":\"completed\"}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'message': f'模型调用失败：{exc}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
