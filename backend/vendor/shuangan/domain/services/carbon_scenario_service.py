"""Incremental carbon scenario evaluation."""

from __future__ import annotations

import math

from shuangan.domain.carbon import CarbonImpactReport, CarbonMetricsReport, CarbonScenarioInput


class CarbonScenarioService:
    """Evaluate projected values using an already calculated baseline report."""

    def evaluate(self, baseline: CarbonMetricsReport, scenario: CarbonScenarioInput) -> CarbonImpactReport:
        values = (scenario.projected_energy_consumption, scenario.projected_renewable_consumption, scenario.projected_renewable_generation)
        if any(not math.isfinite(value) or value < 0 for value in values):
            raise ValueError("projected energy values must be finite and non-negative")
        projected_curtailed = max(scenario.projected_renewable_generation - scenario.projected_renewable_consumption, 0.0)
        projected_emission = scenario.projected_energy_consumption * baseline.grid_emission_factor
        return CarbonImpactReport(
            scenario.scenario_type, baseline.carbon_emission, projected_emission,
            projected_emission - baseline.carbon_emission,
            baseline.renewable_consumption, scenario.projected_renewable_consumption,
            scenario.projected_renewable_consumption - baseline.renewable_consumption,
            baseline.curtailed_energy, projected_curtailed,
            projected_curtailed - baseline.curtailed_energy,
            scenario.projected_energy_consumption - baseline.energy_consumption,
        )
