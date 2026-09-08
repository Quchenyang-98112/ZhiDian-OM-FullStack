"""Domain model entities for industrial maintenance."""

from shuangan.domain.alarm import Alarm, Severity
from shuangan.domain.asset import Asset, AssetType, Criticality
from shuangan.domain.calendar import CalendarEvent, EventType, PlannedDowntime, ShiftPattern
from shuangan.domain.carbon import (
    CarbonImpactReport,
    CarbonMetricsInput,
    CarbonMetricsReport,
    CarbonScenarioInput,
    CarbonScenarioType,
)
from shuangan.domain.failure_mode import FailureMode
from shuangan.domain.maintenance_plan import Interval, MaintenancePlan
from shuangan.domain.plant import Plant
from shuangan.domain.spare_part import SparePart
from shuangan.domain.work_order import (
    FailureImpact,
    Priority,
    WorkOrder,
    WorkOrderStatus,
    WorkOrderType,
)

__all__ = [
    "Alarm",
    "Asset",
    "AssetType",
    "CalendarEvent",
    "CarbonImpactReport",
    "CarbonMetricsInput",
    "CarbonMetricsReport",
    "CarbonScenarioInput",
    "CarbonScenarioType",
    "Criticality",
    "EventType",
    "FailureImpact",
    "FailureMode",
    "Interval",
    "MaintenancePlan",
    "PlannedDowntime",
    "Plant",
    "Priority",
    "Severity",
    "ShiftPattern",
    "SparePart",
    "WorkOrder",
    "WorkOrderStatus",
    "WorkOrderType",
]
