"""Asset entity — physical equipment in a maintenance hierarchy.

Assets form a hierarchy: Plant → Area → System → Equipment → Component.
Each asset has a criticality classification and can be associated with
known failure modes.
"""

from __future__ import annotations

from datetime import date  # noqa: TC003
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class AssetType(StrEnum):
    """Pragmatic equipment classification inspired by ISO 14224 and common industry usage.

    This enum uses shuangan-specific buckets that blend ISO 14224 equipment
    categories (rotating, electrical, safety) with common industry terms
    (static, instrument, piping, structural, HVAC). Also compatible with
    Chinese standards GB/T 35249, GB/T 40639, etc.
    
    For strict ISO 14224 alignment, use ``Asset.equipment_class_code``.
    For Chinese GB standards alignment, see ``Asset.gb_equipment_code``.
    """

    ROTATING_EQUIPMENT = "rotating_equipment"
    STATIC_EQUIPMENT = "static_equipment"
    INSTRUMENT = "instrument"
    ELECTRICAL = "electrical"
    PIPING = "piping"
    STRUCTURAL = "structural"
    HVAC = "hvac"
    SAFETY = "safety"


class Criticality(StrEnum):
    """Asset criticality classification for maintenance prioritisation.

    A = Critical (production-stopping), B = Important, C = Standard.
    """

    A = "A"
    B = "B"
    C = "C"


class Asset(BaseModel):
    """A physical piece of equipment in the maintenance hierarchy.

    Assets represent any maintainable item — from an entire plant down to
    an individual bearing.  They carry metadata for identification, location,
    and maintenance strategy.
    """

    id: str = Field(..., description="Unique asset identifier (e.g. 'P-201')")
    name: str = Field(..., description="Human-readable asset name")
    type: AssetType = Field(..., description="Equipment classification")
    location: str = Field(default="", description="Physical location path")
    manufacturer: str = Field(default="", description="Equipment manufacturer")
    model: str = Field(default="", description="Manufacturer model number")
    serial_number: str = Field(default="", description="Serial number")
    install_date: date | None = Field(default=None, description="Installation date")
    criticality: Criticality = Field(
        default=Criticality.C, description="Criticality classification"
    )
    parent: str | None = Field(default=None, description="Parent asset ID")
    children: list[str] = Field(default_factory=list, description="Child asset IDs")
    failure_modes: list[str] = Field(
        default_factory=list,
        description="Associated failure mode codes",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Arbitrary key-value metadata",
    )
    equipment_class_code: str | None = Field(
        default=None,
        description=(
            "ISO 14224 Annex A Table A.4 equipment class code "
            "(e.g. 'PU' pumps, 'CO' compressors, 'HE' heat exchangers, "
            "'EM' electric motors, 'GT' gas turbines, 'ST' steam turbines, "
            "'VE' pressure vessels, 'TA' storage tanks)."
        ),
    )
    
    gb_equipment_code: str | None = Field(
        default=None,
        description=(
            "Chinese GB standard equipment class code / 中国国家标准设备分类代码 "
            "(e.g. GB/T 35249: 设备分类编码 for asset classification, "
            "GB/T 40639: 设备代码 for process equipment, "
            "GB/T 37157: 机械分类编码)."
        ),
    )
    
    gb_standard_ref: list[str] = Field(
        default_factory=list,
        description=(
            "Relevant Chinese GB standards / 相关中国国家标准 "
            "(e.g. ['GB/T 35249', 'GB/T 40639', 'GB/T 37157'])."
        ),
    )

    model_config = {"frozen": False, "str_strip_whitespace": True}

    @field_validator("id")
    @classmethod
    def _validate_id(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("id cannot be empty")
        return v.strip()
