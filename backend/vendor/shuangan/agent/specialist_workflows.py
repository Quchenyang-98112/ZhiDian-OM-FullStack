"""Deterministic internal workflows for specialist agents."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from shuangan.agent.runtime import Agent


@dataclass
class AnomalyReport:
    asset_id: str
    metric: str
    trend_summary: dict[str, Any] | None = None
    anomalies: list[dict[str, Any]] = field(default_factory=list)
    is_anomalous: bool = False
    severity: str | None = None
    evidence: list[str] = field(default_factory=list)


@dataclass
class DiagnosisReport:
    asset_id: str
    suspected_faults: list[dict[str, Any]] = field(default_factory=list)
    primary_fault: str | None = None
    confidence: str | None = None
    evidence: list[Any] = field(default_factory=list)
    history_summary: list[dict[str, Any]] = field(default_factory=list)
    document_evidence: list[dict[str, Any]] = field(default_factory=list)
    needs_more_evidence: bool = False


@dataclass
class DecisionReport:
    asset_id: str
    fault: str | None
    priority: str | None
    recommended_action: str | None
    maintenance_plan: list[dict[str, Any]] = field(default_factory=list)
    spare_parts_status: list[dict[str, Any]] = field(default_factory=list)
    decision_reason: str = ""
    work_order_created: bool = False
    work_order_id: str | None = None
    carbon_metrics: Any | None = None
    carbon_impact: Any | None = None


def _asset_id(agent: Agent, task: str, value: str) -> str:
    if value:
        return value
    matches = agent._resolver.resolve(task)
    return matches[0].asset.id if matches else ""


def _metric(task: str, value: str) -> str:
    if value:
        return value
    lowered = task.lower()
    return next((item for item in ("vibration", "temperature", "pressure") if item in lowered), "")


async def run_anomaly_workflow(agent: Agent, task: str, *, asset_id: str = "", metric: str = "", need_trend: bool | None = None, need_anomaly: bool | None = None) -> AnomalyReport:
    """Run requested trend and/or anomaly tools and return structured evidence."""
    asset_id, metric = _asset_id(agent, task, asset_id), _metric(task, metric)
    lowered = task.lower()
    need_trend = need_trend if need_trend is not None else ("趋势" in task or "trend" in lowered)
    need_anomaly = need_anomaly if need_anomaly is not None else ("异常" in task or "anomal" in lowered)
    if not asset_id or not metric:
        return AnomalyReport(asset_id, metric, evidence=["asset_id and metric are required"])
    await agent.execute_tool("get_asset_details", {"asset_id": asset_id})
    trend = await agent.execute_tool("predict_trend", {"asset_id": asset_id, "parameter": metric}) if need_trend else None
    result = await agent.execute_tool("detect_anomalies", {"asset_id": asset_id, "parameter": metric}) if need_anomaly else {}
    anomalies = result.get("anomalies", [])
    severity = max((item.get("severity", "") for item in anomalies), default=None)
    return AnomalyReport(asset_id, metric, trend, anomalies, bool(anomalies), severity, ["asset details", "trend", "anomaly"])


def _as_dict(report: DiagnosisReport | dict[str, Any]) -> dict[str, Any]:
    return asdict(report) if isinstance(report, DiagnosisReport) else report


async def run_diagnosis_workflow(agent: Agent, anomaly_report: AnomalyReport | dict[str, Any] | None = None, *, asset_id: str = "", anomaly_description: str = "") -> DiagnosisReport:
    """Fuse supplied anomaly facts with history, documents, and diagnosis."""
    source = asdict(anomaly_report) if isinstance(anomaly_report, AnomalyReport) else anomaly_report or {}
    asset_id = asset_id or source.get("asset_id", "")
    if not asset_id:
        return DiagnosisReport("", needs_more_evidence=True)
    details = await agent.execute_tool("get_asset_details", {"asset_id": asset_id})
    history = await agent.execute_tool("read_work_orders", {"asset_id": asset_id})
    query = anomaly_description or " ".join(source.get("evidence", [])) or "equipment failure"
    documents = await agent.execute_tool("search_documents", {"asset_id": asset_id, "query": query})
    symptoms = [anomaly_description or source.get("metric", "anomaly")]
    diagnosis = await agent.execute_tool("diagnose_failure", {"asset_id": asset_id, "symptoms": symptoms})
    faults = diagnosis.get("probable_failures", [])
    primary = faults[0] if faults else {}
    return DiagnosisReport(asset_id, faults, primary.get("name"), primary.get("confidence"), [details, diagnosis], history, documents, not bool(faults))


async def run_decision_workflow(agent: Agent, diagnosis_report: DiagnosisReport | dict[str, Any], *, analysis_type: str = "", analysis: dict[str, Any] | None = None, create_work_order: bool = False, carbon_metrics: Any | None = None, carbon_impact: Any | None = None) -> DecisionReport:
    """Collect maintenance facts and return the specialist's decision report."""
    source = _as_dict(diagnosis_report)
    asset_id, fault = source.get("asset_id", ""), source.get("primary_fault")
    plans = await agent.execute_tool("get_maintenance_schedule", {"asset_id": asset_id})
    parts = await agent.execute_tool("check_spare_parts", {"asset_id": asset_id})
    await agent.execute_tool("read_work_orders", {"asset_id": asset_id})
    has_parts = bool(parts) and not (isinstance(parts, dict) and parts.get("error"))
    priority = "high" if fault else "medium"
    action = "schedule_maintenance" if fault else "monitor"
    reason = "已完成故障、维护计划和备件信息汇总，由 DecisionAgent 形成维护建议。"  # noqa: RUF001
    if fault and not has_parts:
        reason += " 当前未确认备件充足性。"
    created = await agent.execute_tool("create_work_order", {"asset_id": asset_id, "description": fault or "Maintenance action", "priority": priority}) if create_work_order else None
    return DecisionReport(asset_id, fault, priority, action, plans if isinstance(plans, list) else [], parts if isinstance(parts, list) else [], reason, bool(created), created.get("id") if created else None, carbon_metrics, carbon_impact)
