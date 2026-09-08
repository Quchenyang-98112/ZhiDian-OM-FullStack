"""FailureMode entity — a specific way an asset can fail.

Failure modes are aligned with the ISO 14224 taxonomy and carry detection
methods, typical indicators, and recommended corrective actions.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class FailureMode(BaseModel):
    """A known failure mode for a class of equipment.

    Encodes domain knowledge about *how* equipment fails, *how* to
    detect the failure, and *what* to do about it.
    """

    code: str = Field(
        ...,
        description=(
            "shuangan-internal catalog identifier for this failure mode "
            "(e.g. 'BEAR-WEAR-01'). For the ISO 14224 standard code, "
            "use 'iso_14224_code'."
        ),
    )
    name: str = Field(..., description="Human-readable failure mode name")
    mechanism: str = Field(
        default="",
        description=(
            "Failure mechanism (e.g. 'fatigue', 'corrosion'); aligns with "
            "ISO 14224 Table B.2 subdivisions."
        ),
    )
    category: str = Field(
        default="",
        description=(
            "Top-level category (e.g. 'mechanical', 'electrical'); aligns "
            "with ISO 14224 Table B.2 top-level failure mechanism groups."
        ),
    )
    detection_methods: list[str] = Field(
        default_factory=list,
        description="Methods to detect this failure (e.g. 'vibration_analysis')",
    )
    typical_indicators: list[str] = Field(
        default_factory=list,
        description="Observable symptoms when this failure is developing",
    )
    recommended_actions: list[str] = Field(
        default_factory=list,
        description="Corrective actions to resolve this failure",
    )
    mtbf_hours: float | None = Field(
        default=None,
        ge=0,
        description="Mean Time Between Failures in hours",
    )
    iso_14224_code: str | None = Field(
        default=None,
        description=(
            "ISO 14224 Annex B Table B.15 failure mode code "
            "(e.g. 'VIB' vibration, 'ELP' external leakage of process medium, "
            "'BRD' breakdown, 'OHE' overheating, 'PLU' plugged/choked)."
        ),
    )
    
    gb_failure_code: str | None = Field(
        default=None,
        description=(
            "Chinese GB standard failure mode code / 中国国家标准故障模式代码 "
            "(e.g. GB/T 35249-2017: 设备故障分类编码 for failure categorization, "
            "GB/T 40641: 设备故障分类与代码)."
        ),
    )
    
    gb_standard_ref: list[str] = Field(
        default_factory=list,
        description=(
            "Relevant Chinese GB standards / 相关中国国家标准 "
            "(e.g. ['GB/T 35249', 'GB/T 40641'])."
        ),
    )

    model_config = {"frozen": False, "str_strip_whitespace": True}

    @field_validator("code")
    @classmethod
    def _validate_code(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("code cannot be empty")
        return v.strip()
