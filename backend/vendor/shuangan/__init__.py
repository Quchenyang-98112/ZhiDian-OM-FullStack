"""ShuangAn — The open-source Python framework for AI agents in industrial maintenance."""

from shuangan.agent.runtime import Agent
from shuangan.domain.alarm import Alarm, Severity
from shuangan.domain.asset import Asset, AssetType, Criticality
from shuangan.domain.failure_mode import FailureMode
from shuangan.domain.maintenance_plan import Interval, MaintenancePlan
from shuangan.domain.plant import Plant
from shuangan.domain.spare_part import SparePart
from shuangan.domain.work_order import Priority, WorkOrder, WorkOrderStatus, WorkOrderType
from shuangan.workflows import Step, Workflow, WorkflowEngine

__version__ = "0.3.0"

__all__ = [
    "Agent",
    "Alarm",
    "Asset",
    "AssetType",
    "Criticality",
    "FailureMode",
    "Interval",
    "MaintenancePlan",
    "Plant",
    "Priority",
    "Severity",
    "SparePart",
    "Step",
    "WorkOrder",
    "WorkOrderStatus",
    "WorkOrderType",
    "Workflow",
    "WorkflowEngine",
    "__version__",
]

