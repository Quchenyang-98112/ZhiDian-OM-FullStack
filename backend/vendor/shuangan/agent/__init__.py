"""Agent layer — runtime, prompt engineering, and entity resolution."""

from shuangan.agent.entity_resolver import EntityResolver, ResolvedEntity
from shuangan.agent.runtime import Agent
from shuangan.agent.specialist_workflows import (
    AnomalyReport,
    DecisionReport,
    DiagnosisReport,
    run_anomaly_workflow,
    run_decision_workflow,
    run_diagnosis_workflow,
)
from shuangan.agent.specialists import (
    ANOMALY_PROFILE,
    DECISION_PROFILE,
    DIAGNOSIS_PROFILE,
    AgentProfile,
    create_specialist_agent,
)

__all__ = [
    "ANOMALY_PROFILE",
    "DECISION_PROFILE",
    "DIAGNOSIS_PROFILE",
    "Agent",
    "AgentProfile",
    "AnomalyReport",
    "DecisionReport",
    "DiagnosisReport",
    "EntityResolver",
    "ResolvedEntity",
    "create_specialist_agent",
    "run_anomaly_workflow",
    "run_decision_workflow",
    "run_diagnosis_workflow",
]
