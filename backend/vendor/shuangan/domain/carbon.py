"""Small deterministic carbon accounting models."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class CarbonScenarioType(StrEnum):
    HEALTHY_OPTIMIZATION = "healthy_optimization"
    CONTINUE_FAULT_OPERATION = "continue_fault_operation"
    AFTER_MAINTENANCE = "after_maintenance"


@dataclass(frozen=True)
class CarbonMetricsInput:
    """One accounting window; energy values are grid kWh."""

    asset_id: str
    energy_consumption: float
    renewable_generation: float
    renewable_consumption: float
    grid_emission_factor: float
    baseline_emission_factor: float | None = None


@dataclass(frozen=True)
class CarbonMetricsReport:
    """Baseline metrics; energy is kWh and carbon is kgCO2e."""

    asset_id: str
    energy_consumption: float
    renewable_generation: float
    renewable_consumption: float
    curtailed_energy: float
    renewable_consumption_rate: float
    carbon_emission: float
    carbon_reduction: float
    carbon_efficiency: float | None
    grid_emission_factor: float
    baseline_emission_factor: float


@dataclass(frozen=True)
class CarbonScenarioInput:
    """Projected absolute values for one scenario, in the same units as baseline."""

    scenario_type: CarbonScenarioType
    projected_energy_consumption: float
    projected_renewable_consumption: float
    projected_renewable_generation: float


@dataclass(frozen=True)
class CarbonImpactReport:
    """Scenario impact; every delta is projected minus baseline."""

    scenario_type: CarbonScenarioType
    baseline_carbon_emission: float
    projected_carbon_emission: float
    carbon_emission_delta: float
    baseline_renewable_consumption: float
    projected_renewable_consumption: float
    renewable_consumption_delta: float
    baseline_curtailed_energy: float
    projected_curtailed_energy: float
    curtailed_energy_delta: float
    energy_consumption_delta: float

