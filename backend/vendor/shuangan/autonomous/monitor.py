"""AutonomousMonitor — self-running predictive maintenance monitor.

Continuously monitors sensor data, runs predictions, makes decisions,
and executes actions automatically without human intervention.

Features:
- Periodic sensor polling
- Automatic trend analysis
- Autonomous decision making
- Automatic work order creation
- Multi-channel notifications
- Configurable monitoring intervals
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Callable

import structlog

from shuangan.autonomous.decision_engine import Decision, DecisionEngine
from shuangan.autonomous.predictor import TrendPredictor
from shuangan.connectors.base import BaseConnector

logger = structlog.get_logger(__name__)


class AutonomousMonitor:
    """Autonomous predictive maintenance monitor.

    Runs a continuous monitoring loop that:
    1. Polls sensors at configured intervals
    2. Analyzes trends using TrendPredictor
    3. Makes decisions using DecisionEngine
    4. Executes actions (alarms, work orders, notifications)

    Example:
        ```python
        monitor = AutonomousMonitor(
            sensor_connector=sensors,
            cmms_connector=cmms,
            comms_connector=dingtalk,
            check_interval_seconds=300,  # 5 minutes
        )

        # Start autonomous monitoring
        await monitor.start()

        # ... runs continuously ...

        # Stop monitoring
        await monitor.stop()
        ```
    """

    def __init__(
        self,
        *,
        sensor_connector: BaseConnector,
        cmms_connector: BaseConnector | None = None,
        comms_connector: BaseConnector | None = None,
        check_interval_seconds: float = 300.0,
        asset_ids: list[str] | None = None,
        parameters: list[str] | None = None,
        thresholds: dict[str, dict[str, float]] | None = None,
        on_decision: Callable[[Decision], Any] | None = None,
    ) -> None:
        """Initialize the autonomous monitor.

        Args:
            sensor_connector: Connector for reading sensor data.
            cmms_connector: Optional CMMS connector for creating work orders.
            comms_connector: Optional communication connector for notifications.
            check_interval_seconds: How often to check sensors (default 5 min).
            asset_ids: List of asset IDs to monitor. If None, monitors all.
            parameters: List of parameters to monitor. If None, monitors all.
            thresholds: Dict of {asset_id: {parameter: threshold_value}}.
            on_decision: Optional callback for each decision made.
        """
        self._sensor = sensor_connector
        self._cmms = cmms_connector
        self._comms = comms_connector
        self._interval = check_interval_seconds
        self._asset_ids = asset_ids or []
        self._parameters = parameters or []
        self._thresholds = thresholds or {}
        self._on_decision = on_decision

        self._predictor = TrendPredictor()
        self._decision_engine = DecisionEngine()

        self._running = False
        self._task: asyncio.Task | None = None
        self._active_alarms: list[Any] = []

    async def start(self) -> None:
        """Start the autonomous monitoring loop."""
        if self._running:
            logger.warning("monitor_already_running")
            return

        self._running = True
        logger.info(
            "autonomous_monitor_started",
            interval_seconds=self._interval,
            assets=self._asset_ids,
            parameters=self._parameters,
        )

        # Connect connectors
        await self._sensor.connect()
        if self._cmms:
            await self._cmms.connect()
        if self._comms:
            await self._comms.connect()

        # Discover assets if not specified
        if not self._asset_ids:
            await self._discover_assets()

        # Start monitoring loop
        self._task = asyncio.create_task(self._monitor_loop())

    async def stop(self) -> None:
        """Stop the autonomous monitoring loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        # Disconnect connectors
        await self._sensor.disconnect()
        if self._cmms:
            await self._cmms.disconnect()
        if self._comms:
            await self._comms.disconnect()

        logger.info("autonomous_monitor_stopped")

    async def _discover_assets(self) -> None:
        """Discover assets from the sensor connector."""
        try:
            # Try to get asset list from sensor connector
            if hasattr(self._sensor, "_readings"):
                self._asset_ids = list(self._sensor._readings.keys())
                logger.info(
                    "assets_discovered",
                    count=len(self._asset_ids),
                    assets=self._asset_ids,
                )
        except Exception as exc:
            logger.warning("asset_discovery_failed", error=str(exc))

    async def _monitor_loop(self) -> None:
        """Main monitoring loop."""
        while self._running:
            try:
                await self._check_all_assets()
            except Exception as exc:
                logger.error("monitor_loop_error", error=str(exc), exc_info=True)

            # Wait for next check
            await asyncio.sleep(self._interval)

    async def _check_all_assets(self) -> None:
        """Check all monitored assets."""
        for asset_id in self._asset_ids:
            try:
                await self._check_asset(asset_id)
            except Exception as exc:
                logger.error(
                    "asset_check_failed",
                    asset_id=asset_id,
                    error=str(exc),
                )

    async def _check_asset(self, asset_id: str) -> None:
        """Check a single asset for predictive maintenance needs."""
        # Get sensor readings
        trend_data = await self._sensor.get_related_readings(asset_id)
        readings = trend_data.get("readings", [])

        if not readings:
            logger.debug("no_readings", asset_id=asset_id)
            return

        # Determine parameters to check
        params_to_check = self._parameters
        if not params_to_check and readings:
            # Auto-discover from latest reading
            latest_sensors = readings[-1].get("sensors", {})
            params_to_check = list(latest_sensors.keys())

        for parameter in params_to_check:
            await self._check_parameter(asset_id, parameter, readings)

    async def _check_parameter(
        self,
        asset_id: str,
        parameter: str,
        readings: list[dict[str, Any]],
    ) -> None:
        """Check a specific parameter for trends and anomalies."""
        # Get threshold
        threshold = None
        if asset_id in self._thresholds and parameter in self._thresholds[asset_id]:
            threshold = self._thresholds[asset_id][parameter]
        else:
            # Try to get from sensor data
            try:
                if hasattr(self._sensor, "_readings"):
                    data = self._sensor._readings.get(asset_id, {})
                    thresholds = data.get("thresholds", {})
                    if parameter in thresholds:
                        param_thresh = thresholds[parameter]
                        if isinstance(param_thresh, dict):
                            threshold = param_thresh.get("critical") or param_thresh.get("warning")
                        else:
                            threshold = float(param_thresh)
            except Exception:
                pass

        # Run trend prediction
        prediction = self._predictor.predict_trend(
            asset_id=asset_id,
            parameter=parameter,
            readings=readings,
            threshold=threshold,
        )

        if prediction:
            # Make decision
            decision = self._decision_engine.evaluate_prediction(
                prediction,
                current_alarms=self._active_alarms,
            )

            # Execute decision
            if decision.action != "none":
                await self._execute_decision(decision)

        # Run anomaly detection
        anomalies = self._predictor.detect_anomalies(
            asset_id=asset_id,
            parameter=parameter,
            readings=readings,
        )

        for anomaly in anomalies:
            decision = self._decision_engine.evaluate_anomaly(anomaly)
            await self._execute_decision(decision)

    async def _execute_decision(self, decision: Decision) -> None:
        """Execute the actions specified by a decision."""
        logger.info(
            "executing_decision",
            action=decision.action,
            asset_id=decision.asset_id,
            parameter=decision.parameter,
            severity=decision.severity,
        )

        # Record decision
        self._decision_engine.record_decision(decision)

        # Call user callback if provided
        if self._on_decision:
            try:
                self._on_decision(decision)
            except Exception as exc:
                logger.warning("decision_callback_error", error=str(exc))

        # Execute based on action type
        if decision.action == "work_order":
            await self._create_work_order(decision)
            await self._send_notification(decision)

        elif decision.action == "alarm":
            await self._send_notification(decision)

        elif decision.action == "notify":
            await self._send_notification(decision)

    async def _create_work_order(self, decision: Decision) -> None:
        """Create a work order via CMMS connector."""
        if not self._cmms:
            logger.warning("no_cmms_connector", decision=decision.action)
            return

        wo = decision.details.get("work_order")
        if not wo:
            return

        try:
            created = await self._cmms.create_work_order(wo)
            logger.info(
                "work_order_created",
                work_order_id=created.id,
                asset_id=decision.asset_id,
            )
        except Exception as exc:
            logger.error(
                "work_order_creation_failed",
                asset_id=decision.asset_id,
                error=str(exc),
            )

    async def _send_notification(self, decision: Decision) -> None:
        """Send notification via communication connector."""
        if not self._comms:
            logger.debug("no_comms_connector", message=decision.message)
            return

        try:
            # Try different send methods based on connector type
            if hasattr(self._comms, "send_message"):
                await self._comms.send_message("maintenance_team", decision.message)
            elif hasattr(self._comms, "broadcast"):
                await self._comms.broadcast(decision.message)

            logger.info(
                "notification_sent",
                asset_id=decision.asset_id,
                message_preview=decision.message[:100],
            )
        except Exception as exc:
            logger.error(
                "notification_failed",
                asset_id=decision.asset_id,
                error=str(exc),
            )

    @property
    def is_running(self) -> bool:
        """Return whether the monitor is currently running."""
        return self._running

    def get_status(self) -> dict[str, Any]:
        """Get current monitor status."""
        return {
            "running": self._running,
            "interval_seconds": self._interval,
            "monitored_assets": self._asset_ids,
            "monitored_parameters": self._parameters,
            "active_alarms": len(self._active_alarms),
            "recent_decisions": len(self._decision_engine.get_decision_history(limit=10)),
        }
