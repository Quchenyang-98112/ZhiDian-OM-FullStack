"""DecisionEngine — autonomous decision making for predictive maintenance.

Evaluates predictions and decides what actions to take:
- Generate alarms
- Create work orders
- Send notifications
- Escalate severity
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import structlog

from shuangan.domain.alarm import Alarm, Severity
from shuangan.domain.work_order import FailureImpact, Priority, WorkOrder, WorkOrderStatus, WorkOrderType

logger = structlog.get_logger(__name__)


@dataclass
class Decision:
    """An autonomous decision with its rationale."""

    action: str  # "alarm", "work_order", "notify", "escalate", "none"
    asset_id: str
    parameter: str
    severity: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class DecisionEngine:
    """Autonomous decision engine for predictive maintenance.

    Evaluates trend predictions and anomaly detections, then decides
    whether to generate alarms, create work orders, or send notifications.

    Decision rules:
    - CRITICAL: immediate work order + notification
    - WARNING: alarm + work order (if trend is worsening)
    - DEGRADING: notification + schedule maintenance
    - NORMAL: no action (just log)

    Example:
        ```python
        engine = DecisionEngine()

        decision = engine.evaluate_prediction(prediction)
        if decision.action == "work_order":
            await cmms.create_work_order(decision.details["work_order"])
        if decision.action in ("alarm", "work_order"):
            await channel.send_message(decision.message)
        ```
    """

    def __init__(
        self,
        *,
        alarm_threshold_hours: float = 24.0,
        work_order_threshold_hours: float = 72.0,
        notification_threshold_hours: float = 168.0,
    ) -> None:
        self.alarm_threshold_hours = alarm_threshold_hours
        self.work_order_threshold_hours = work_order_threshold_hours
        self.notification_threshold_hours = notification_threshold_hours
        self._decision_history: list[Decision] = []

    def evaluate_prediction(
        self,
        prediction: Any,
        current_alarms: list[Alarm] | None = None,
    ) -> Decision:
        """Evaluate a trend prediction and return a decision.

        Args:
            prediction: A TrendPrediction object.
            current_alarms: Existing active alarms for this asset.

        Returns:
            A Decision object describing what action to take.
        """
        asset_id = prediction.asset_id
        parameter = prediction.parameter
        current_value = prediction.current_value
        trend_direction = prediction.trend_direction
        threshold_crossing = prediction.threshold_crossing_time
        confidence = prediction.confidence

        # Check if we already have an active alarm for this
        has_active_alarm = False
        if current_alarms:
            has_active_alarm = any(
                a.asset_id == asset_id and a.parameter == parameter
                for a in current_alarms
            )

        # Calculate hours until threshold crossing
        hours_until = None
        if threshold_crossing:
            hours_until = (threshold_crossing - datetime.now(timezone.utc)).total_seconds() / 3600

        # Decision logic
        if hours_until is not None and hours_until <= self.alarm_threshold_hours:
            # CRITICAL: Threshold will be crossed within alarm_threshold_hours
            return self._create_critical_decision(
                asset_id, parameter, current_value, hours_until, prediction
            )

        if hours_until is not None and hours_until <= self.work_order_threshold_hours:
            # WARNING: Threshold will be crossed within work_order_threshold_hours
            return self._create_warning_decision(
                asset_id, parameter, current_value, hours_until, prediction
            )

        if hours_until is not None and hours_until <= self.notification_threshold_hours:
            # DEGRADING: Threshold will be crossed within notification_threshold_hours
            return self._create_degrading_decision(
                asset_id, parameter, current_value, hours_until, prediction
            )

        if trend_direction in ("increasing", "decreasing") and confidence in ("high", "medium"):
            # Trend is worsening (in either direction) but no immediate threat
            return self._create_monitoring_decision(
                asset_id, parameter, current_value, prediction
            )

        # No action needed
        return Decision(
            action="none",
            asset_id=asset_id,
            parameter=parameter,
            severity="info",
            message=f"{asset_id} {parameter} 正常: {current_value:.1f}",
        )

    def evaluate_anomaly(
        self,
        anomaly: Any,
    ) -> Decision:
        """Evaluate an anomaly detection and return a decision.

        Args:
            anomaly: An AnomalyDetection object.

        Returns:
            A Decision object.
        """
        asset_id = anomaly.asset_id
        parameter = anomaly.parameter
        value = anomaly.value
        severity = anomaly.severity

        if severity == "critical":
            return Decision(
                action="work_order",
                asset_id=asset_id,
                parameter=parameter,
                severity="critical",
                message=(
                    f"[CRITICAL] {asset_id} {parameter} 异常: {value:.2f} "
                    f"(正常范围: {anomaly.expected_range[0]:.2f}-{anomaly.expected_range[1]:.2f})"
                ),
                details={
                    "work_order": self._build_work_order(
                        asset_id, parameter, value, "critical", anomaly
                    ),
                    "alarm": self._build_alarm(asset_id, parameter, value, Severity.CRITICAL, anomaly),
                },
            )

        return Decision(
            action="alarm",
            asset_id=asset_id,
            parameter=parameter,
            severity="warning",
            message=(
                f"[WARNING] {asset_id} {parameter} 异常: {value:.2f} "
                f"(正常范围: {anomaly.expected_range[0]:.2f}-{anomaly.expected_range[1]:.2f})"
            ),
            details={
                "alarm": self._build_alarm(asset_id, parameter, value, Severity.WARNING, anomaly),
            },
        )

    def _create_critical_decision(
        self,
        asset_id: str,
        parameter: str,
        current_value: float,
        hours_until: float,
        prediction: Any,
    ) -> Decision:
        """Create a CRITICAL decision (immediate action required)."""
        message = (
            f"[CRITICAL] {asset_id} {parameter}={current_value:.1f} "
            f"预计 {hours_until:.1f} 小时后超过阈值! "
            f"建议立即停机检修。"
        )

        return Decision(
            action="work_order",
            asset_id=asset_id,
            parameter=parameter,
            severity="critical",
            message=message,
            details={
                "work_order": self._build_work_order(
                    asset_id, parameter, current_value, "critical", prediction
                ),
                "alarm": self._build_alarm(
                    asset_id, parameter, current_value, Severity.CRITICAL, prediction
                ),
                "hours_until_threshold": hours_until,
            },
        )

    def _create_warning_decision(
        self,
        asset_id: str,
        parameter: str,
        current_value: float,
        hours_until: float,
        prediction: Any,
    ) -> Decision:
        """Create a WARNING decision (action needed soon)."""
        message = (
            f"[WARNING] {asset_id} {parameter}={current_value:.1f} "
            f"预计 {hours_until:.1f} 小时后超过阈值。 "
            f"建议安排维护。"
        )

        return Decision(
            action="work_order",
            asset_id=asset_id,
            parameter=parameter,
            severity="warning",
            message=message,
            details={
                "work_order": self._build_work_order(
                    asset_id, parameter, current_value, "warning", prediction
                ),
                "alarm": self._build_alarm(
                    asset_id, parameter, current_value, Severity.WARNING, prediction
                ),
                "hours_until_threshold": hours_until,
            },
        )

    def _create_degrading_decision(
        self,
        asset_id: str,
        parameter: str,
        current_value: float,
        hours_until: float,
        prediction: Any,
    ) -> Decision:
        """Create a DEGRADING decision (monitor closely)."""
        days_until = hours_until / 24
        message = (
            f"[DEGRADING] {asset_id} {parameter}={current_value:.1f} "
            f"预计 {days_until:.1f} 天后超过阈值。 "
            f"建议纳入下周维护计划。"
        )

        return Decision(
            action="notify",
            asset_id=asset_id,
            parameter=parameter,
            severity="warning",
            message=message,
            details={
                "hours_until_threshold": hours_until,
                "recommendation": "schedule_maintenance",
            },
        )

    def _create_monitoring_decision(
        self,
        asset_id: str,
        parameter: str,
        current_value: float,
        prediction: Any,
    ) -> Decision:
        """Create a MONITORING decision (trend worsening but not urgent)."""
        direction_text = "上升" if prediction.trend_direction == "increasing" else "下降"
        message = (
            f"[MONITOR] {asset_id} {parameter}={current_value:.1f} "
            f"呈{direction_text}趋势，建议加强监控。"
        )

        return Decision(
            action="none",
            asset_id=asset_id,
            parameter=parameter,
            severity="info",
            message=message,
            details={
                "recommendation": "increase_monitoring_frequency",
            },
        )

    def _build_work_order(
        self,
        asset_id: str,
        parameter: str,
        value: float,
        severity: str,
        source: Any,
    ) -> WorkOrder:
        """Build a work order from decision context."""
        priority_map = {
            "critical": Priority.EMERGENCY,
            "warning": Priority.HIGH,
        }

        impact_map = {
            "critical": FailureImpact.CRITICAL,
            "warning": FailureImpact.DEGRADED,
        }

        description = f"自主预测维护: {asset_id} {parameter}={value:.1f} 趋势异常"
        if hasattr(source, "recommendation"):
            description += f"\n建议: {source.recommendation}"

        return WorkOrder(
            id=f"WO-AUTO-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}",
            type=WorkOrderType.PREDICTIVE,
            priority=priority_map.get(severity, Priority.MEDIUM),
            asset_id=asset_id,
            description=description,
            failure_impact=impact_map.get(severity, FailureImpact.DEGRADED),
        )

    def _build_alarm(
        self,
        asset_id: str,
        parameter: str,
        value: float,
        severity: Severity,
        source: Any,
    ) -> Alarm:
        """Build an alarm from decision context."""
        threshold = 0.0
        unit = ""

        if hasattr(source, "threshold"):
            threshold = source.threshold
        if hasattr(source, "unit"):
            unit = source.unit

        return Alarm(
            id=f"ALM-AUTO-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}",
            asset_id=asset_id,
            severity=severity,
            parameter=parameter,
            value=value,
            threshold=threshold,
            unit=unit,
        )

    def get_decision_history(
        self,
        asset_id: str = "",
        limit: int = 50,
    ) -> list[Decision]:
        """Get recent decisions, optionally filtered by asset."""
        decisions = self._decision_history
        if asset_id:
            decisions = [d for d in decisions if d.asset_id == asset_id]
        return decisions[-limit:]

    def record_decision(self, decision: Decision) -> None:
        """Record a decision for audit trail."""
        self._decision_history.append(decision)
        if len(self._decision_history) > 1000:
            self._decision_history = self._decision_history[-1000:]
