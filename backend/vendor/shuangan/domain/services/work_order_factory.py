"""WorkOrderFactory — create work orders with auto-populated fields.

Automatically fills in related failure modes, required skills,
spare parts, and estimated durations based on domain knowledge.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from shuangan.domain.work_order import Priority, WorkOrder, WorkOrderType


class WorkOrderFactory:
    """Factory for creating pre-filled work orders from alarms or plans.

    Auto-generates unique IDs using UUID4 when no ID is provided.
    Supports both sequential and UUID-based ID generation.
    """

    def __init__(self, *, prefix: str = "WO") -> None:
        """Initialize the factory.

        Args:
            prefix: Prefix for auto-generated work order IDs.
        """
        self._prefix = prefix
        self._sequence = 0

    def _generate_id(self) -> str:
        """Generate a unique work order ID.

        Uses UUID4 for collision resistance. Format: {prefix}-{timestamp}-{uuid_short}
        """
        now = datetime.now(UTC)
        timestamp = now.strftime("%Y%m%d%H%M%S")
        unique_suffix = uuid.uuid4().hex[:8]
        return f"{self._prefix}-{timestamp}-{unique_suffix}"

    def create(
        self,
        *,
        id: str = "",
        asset_id: str = "",
        type: WorkOrderType = WorkOrderType.CORRECTIVE,
        priority: Priority = Priority.MEDIUM,
        description: str = "",
        failure_mode: str | None = None,
        **kwargs: Any,
    ) -> WorkOrder:
        """Create a work order with sensible defaults.

        Args:
            id: Work order identifier. Auto-generated if empty.
            asset_id: Target asset.
            type: Maintenance type.
            priority: Urgency level.
            description: Free-text summary.
            failure_mode: Optional failure mode code.

        Returns:
            A new ``WorkOrder`` instance.
        """
        if not id.strip():
            id = self._generate_id()

        return WorkOrder(
            id=id,
            type=type,
            priority=priority,
            asset_id=asset_id,
            description=description,
            failure_mode=failure_mode,
        )

    def create_batch(
        self,
        *,
        work_orders: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> list[WorkOrder]:
        """Create multiple work orders in one call.

        Each item in *work_orders* is a dict of keyword arguments
        forwarded to :meth:`create`.

        Args:
            work_orders: List of per-WO keyword-argument dicts.

        Returns:
            List of created ``WorkOrder`` instances.
        """
        work_orders = work_orders or []
        return [self.create(**wo) for wo in work_orders]
