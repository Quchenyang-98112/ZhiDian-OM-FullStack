"""Deterministic baseline carbon metrics."""

from __future__ import annotations

import math

from shuangan.domain.carbon import CarbonMetricsInput, CarbonMetricsReport


class CarbonMetricsService:
    """Calculate one grid-energy carbon baseline without external dependencies."""

    def calculate(self, data: CarbonMetricsInput) -> CarbonMetricsReport:
        values = (data.energy_consumption, data.renewable_generation, data.renewable_consumption)
        if any(not math.isfinite(value) or value < 0 for value in values):
            raise ValueError("energy values must be finite and non-negative")
        if not math.isfinite(data.grid_emission_factor) or data.grid_emission_factor < 0:
            raise ValueError("grid_emission_factor must be finite and non-negative")
        baseline_factor = data.baseline_emission_factor
        if baseline_factor is None:
            baseline_factor = data.grid_emission_factor
        if not math.isfinite(baseline_factor) or baseline_factor < 0:
            raise ValueError("baseline_emission_factor must be finite and non-negative")
        curtailed = max(data.renewable_generation - data.renewable_consumption, 0.0)
        rate = data.renewable_consumption / data.renewable_generation if data.renewable_generation else 0.0
        emission = data.energy_consumption * data.grid_emission_factor
        reduction = data.renewable_consumption * baseline_factor
        efficiency = reduction / emission if emission else None
        return CarbonMetricsReport(data.asset_id, data.energy_consumption, data.renewable_generation, data.renewable_consumption, curtailed, rate, emission, reduction, efficiency, data.grid_emission_factor, baseline_factor)
