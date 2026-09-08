"""Minimal LangGraph orchestration for the maintenance specialists."""

from __future__ import annotations

import operator
from typing import TYPE_CHECKING, Annotated, TypedDict

from langgraph.graph import END, START, StateGraph

from shuangan.agent.specialist_workflows import (
    AnomalyReport,
    DecisionReport,
    DiagnosisReport,
    run_anomaly_workflow,
    run_decision_workflow,
    run_diagnosis_workflow,
)
from shuangan.domain.carbon import (  # noqa: TC001
    CarbonImpactReport,
    CarbonMetricsReport,
    CarbonScenarioInput,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from shuangan.agent.runtime import Agent


class MaintenanceState(TypedDict, total=False):
    user_query: str
    asset_id: str | None
    metric: str | None
    runtime_context: dict[str, object] | None
    carbon_metrics: CarbonMetricsReport | None
    carbon_impact: CarbonImpactReport | None
    anomaly_report: AnomalyReport | None
    diagnosis_report: DiagnosisReport | None
    decision_report: DecisionReport | None
    current_agent: str | None
    execution_path: Annotated[list[str], operator.add]


def build_maintenance_graph(anomaly_agent: Agent, diagnosis_agent: Agent, decision_agent: Agent, *, runtime_context_provider: Callable[[MaintenanceState], dict[str, object]] | None = None, scenario_input_provider: Callable[[MaintenanceState], CarbonScenarioInput] | None = None):
    """Compile one graph around existing agents and carbon services."""
    from shuangan.domain.carbon import CarbonMetricsInput
    from shuangan.domain.services.carbon_metrics_service import CarbonMetricsService
    from shuangan.domain.services.carbon_scenario_service import CarbonScenarioService

    async def runtime_context(state: MaintenanceState) -> dict[str, object]:
        return {"runtime_context": runtime_context_provider(state), "execution_path": ["runtime_context"]} if runtime_context_provider else {"execution_path": ["runtime_context"]}

    async def carbon_metrics(state: MaintenanceState) -> dict[str, object]:
        if not runtime_context_provider:
            return {"execution_path": ["carbon_metrics"]}
        data = CarbonMetricsInput(**(state["runtime_context"] or {}))
        return {"carbon_metrics": CarbonMetricsService().calculate(data), "execution_path": ["carbon_metrics"]}

    async def anomaly(state: MaintenanceState) -> dict[str, object]:
        report = await run_anomaly_workflow(anomaly_agent, state.get("user_query", ""), asset_id=state.get("asset_id") or "", metric=state.get("metric") or "")
        return {"anomaly_report": report, "current_agent": "AnomalyAgent", "execution_path": ["anomaly"]}

    async def diagnosis(state: MaintenanceState) -> dict[str, object]:
        report = await run_diagnosis_workflow(diagnosis_agent, state.get("anomaly_report"), asset_id=state.get("asset_id") or "", anomaly_description=state.get("user_query", ""))
        return {"diagnosis_report": report, "current_agent": "DiagnosisAgent", "execution_path": ["diagnosis"]}

    async def carbon_scenario(state: MaintenanceState) -> dict[str, object]:
        baseline = state.get("carbon_metrics")
        if not scenario_input_provider:
            return {"execution_path": ["carbon_scenario"]}
        if baseline is None:
            raise ValueError("carbon_metrics is required before carbon_scenario")
        return {"carbon_impact": CarbonScenarioService().evaluate(baseline, scenario_input_provider(state)), "execution_path": ["carbon_scenario"]}

    async def decision(state: MaintenanceState) -> dict[str, object]:
        anomaly_report = state.get("anomaly_report")
        analysis = anomaly_report.anomalies[0] if anomaly_report and anomaly_report.anomalies else None
        report = await run_decision_workflow(decision_agent, state.get("diagnosis_report") or {"asset_id": state.get("asset_id", "")}, analysis_type="anomaly" if analysis else "", analysis=analysis, create_work_order=False, carbon_metrics=state.get("carbon_metrics"), carbon_impact=state.get("carbon_impact"))
        return {"decision_report": report, "current_agent": "DecisionAgent", "execution_path": ["decision"]}

    def after_anomaly(state: MaintenanceState) -> str:
        report = state.get("anomaly_report")
        return "diagnosis" if report and report.is_anomalous else "optimization_check"

    def after_diagnosis(state: MaintenanceState) -> str:
        report = state.get("diagnosis_report")
        return "carbon_scenario" if report and not report.needs_more_evidence else "decision"

    def after_optimization(state: MaintenanceState) -> str:
        metrics = state.get("carbon_metrics")
        return "carbon_scenario" if metrics and metrics.curtailed_energy > 0 else "decision"

    builder = StateGraph(MaintenanceState)
    builder.add_node("runtime_context", runtime_context)
    builder.add_node("carbon_metrics", carbon_metrics)
    builder.add_node("anomaly", anomaly)
    builder.add_node("diagnosis", diagnosis)
    builder.add_node("carbon_scenario", carbon_scenario)
    builder.add_node("decision", decision)
    builder.add_node("optimization_check", lambda state: {"execution_path": ["optimization_check"]})
    builder.add_edge(START, "runtime_context")
    builder.add_edge("runtime_context", "carbon_metrics")
    builder.add_edge("carbon_metrics", "anomaly")
    builder.add_conditional_edges("anomaly", after_anomaly, {"diagnosis": "diagnosis", "optimization_check": "optimization_check"})
    builder.add_conditional_edges("diagnosis", after_diagnosis, {"carbon_scenario": "carbon_scenario", "decision": "decision"})
    builder.add_conditional_edges("optimization_check", after_optimization, {"carbon_scenario": "carbon_scenario", "decision": "decision"})
    builder.add_edge("carbon_scenario", "decision")
    builder.add_edge("decision", END)
    return builder.compile()
