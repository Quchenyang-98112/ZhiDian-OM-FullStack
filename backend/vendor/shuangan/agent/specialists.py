"""Specialist agent profiles built on top of the shared Agent runtime."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from shuangan.agent.runtime import Agent


@dataclass(frozen=True)
class AgentProfile:
    """Thin configuration for a specialist agent."""

    name: str
    description: str
    role_instruction: str
    allowed_tools: tuple[str, ...]


ANOMALY_PROFILE = AgentProfile(
    name="AnomalyAgent",
    description="Detects and describes sensor anomalies and degradation trends.",
    role_instruction=(
        "You are AnomalyAgent. Focus only on detecting and describing anomalies, "
        "out-of-range measurements, and worsening trends. Use asset lookup and sensor-analysis "
        "tools to produce anomaly facts for downstream diagnosis. Do not diagnose root causes, "
        "do not recommend maintenance actions, do not create work orders, and do not execute workflows."
    ),
    allowed_tools=("search_assets", "get_asset_details", "predict_trend", "detect_anomalies"),
)

DIAGNOSIS_PROFILE = AgentProfile(
    name="DiagnosisAgent",
    description="Diagnoses likely failure modes from anomaly evidence and maintenance context.",
    role_instruction=(
        "You are DiagnosisAgent. Focus only on diagnosing likely failure causes from anomaly facts, "
        "documents, work-order history, and failure-mode knowledge. Use diagnosis-oriented tools to "
        "explain evidence and confidence. Do not create work orders, do not choose maintenance timing, "
        "do not evaluate final maintenance actions, and do not execute workflows."
    ),
    allowed_tools=(
        "search_assets",
        "get_asset_details",
        "read_work_orders",
        "search_documents",
        "diagnose_failure",
    ),
)

DECISION_PROFILE = AgentProfile(
    name="DecisionAgent",
    description="Turns anomaly and diagnosis findings into maintenance decisions and actions.",
    role_instruction=(
        "You are DecisionAgent. Focus only on maintenance decision-making from anomaly facts and "
        "diagnosis results. Use schedule, spare-parts, work-order, workflow, and decision tools to "
        "recommend or execute maintenance actions. Do not redo anomaly detection and do not redo full fault diagnosis."
    ),
    allowed_tools=(
        "search_assets",
        "get_asset_details",
        "read_work_orders",
        "check_spare_parts",
        "get_maintenance_schedule",
        "create_work_order",
        "execute_workflow",
    ),
)


def create_specialist_agent(
    profile: AgentProfile,
    *,
    plant: Any = None,
    connectors: Sequence[Any] | None = None,
    channels: Sequence[Any] | None = None,
    llm: Any = "openai:gpt-4o",
    temperature: float = 0.1,
    max_history: int = 20,
    workflows: Sequence[Any] | None = None,
    sandbox: bool = False,
) -> Agent:
    """Create a specialist agent without duplicating runtime logic."""

    return Agent(
        name=profile.name,
        description=profile.description,
        plant=plant,
        connectors=list(connectors or []),
        channels=list(channels or []),
        llm=llm,
        temperature=temperature,
        max_history=max_history,
        workflows=list(workflows or []),
        sandbox=sandbox,
        allowed_tools=profile.allowed_tools,
        role_instruction=profile.role_instruction,
    )
