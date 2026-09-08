"""Entity resolver — map natural language references to domain entities.

When a technician says "the pump in building A" or "P-201", the entity
resolver finds the matching asset(s) in the plant registry.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from shuangan.domain.asset import Asset
    from shuangan.domain.plant import Plant

logger = structlog.get_logger(__name__)

_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)

# Common Chinese industrial terms for segmentation
_CN_INDUSTRIAL_WORDS: set[str] = {
    "冷却", "水泵", "循环", "压缩机", "电机", "风机", "泵", "阀门",
    "换热器", "锅炉", "管道", "轴承", "齿轮", "变频器", "变压器",
    "发电机", "汽轮机", "反应釜", "储罐", "冷凝器", "蒸发器",
    "塔", "炉", "罐", "泵站", "车间", "装置", "系统", "机组",
    "栋", "楼", "层", "区", "线", "站", "厂", "房",
    "压力", "温度", "流量", "振动", "转速", "电流", "电压",
    "频率", "功率", "液位", "浓度", "湿度",
}


def _segment_chinese(text: str) -> set[str]:
    """Segment Chinese text using a simple dictionary-based approach.

    Uses longest-match for known industrial terms, and includes
    individual characters as fallback for unknown words.
    """
    segments: set[str] = set()
    i = 0
    while i < len(text):
        matched = False
        # Try longest match first (max 4 chars for industrial terms)
        for length in range(min(4, len(text) - i), 1, -1):
            candidate = text[i:i + length]
            if candidate in _CN_INDUSTRIAL_WORDS:
                segments.add(candidate)
                i += length
                matched = True
                break
        if not matched:
            # Add single character as fallback (only if CJK)
            if '\u4e00' <= text[i] <= '\u9fff':
                segments.add(text[i])
            i += 1

    return segments


def _tokenise(text: str) -> set[str]:
    """Tokenise text into lowercase words with punctuation stripped.

    Supports both English (whitespace-split) and Chinese (dictionary-based
    segmentation with character fallback).
    """
    cleaned = _PUNCT_RE.sub(" ", text.lower())

    tokens: set[str] = set()
    for part in cleaned.split():
        if not part:
            continue
        # Check if part contains Chinese characters
        if any('\u4e00' <= c <= '\u9fff' for c in part):
            # Chinese text: try dictionary-based segmentation
            tokens.update(_segment_chinese(part))
        else:
            tokens.add(part)

    return tokens


@dataclass
class ResolvedEntity:
    """Result of entity resolution.

    Args:
        asset: The matched asset.
        confidence: Confidence score (0.0-1.0).
        match_reason: How the match was determined.
    """

    asset: Asset
    confidence: float = 1.0
    match_reason: str = ""

    def __repr__(self) -> str:
        return (
            f"ResolvedEntity(asset={self.asset.id!r}, "
            f"confidence={self.confidence:.2f}, reason={self.match_reason!r})"
        )


class EntityResolver:
    """Resolves natural language references to assets in a plant.

    Uses a cascading strategy:
    1. Exact ID match (e.g. ``"P-201"``)
    2. Name match (e.g. ``"cooling water pump"``)
    3. Location match (e.g. ``"building A"``)
    4. Fuzzy keyword match across all asset fields

    Args:
        plant: The plant containing the asset registry.

    Example:
        ```python
        resolver = EntityResolver(plant)
        matches = resolver.resolve("the pump in building A")
        if matches:
            asset = matches[0].asset
        ```
    """

    def __init__(self, plant: Plant) -> None:
        self._plant = plant

    def resolve(self, text: str) -> list[ResolvedEntity]:
        """Resolve a natural language reference to zero or more assets.

        Args:
            text: User input that may reference an asset.

        Returns:
            List of :class:`ResolvedEntity` results, ordered by confidence
            (highest first). Empty if no matches found.
        """
        assets = self._plant.list_assets()
        if not assets:
            return []

        results: list[ResolvedEntity] = []

        # 1. Exact ID match — look for asset IDs embedded in the text
        for asset in assets:
            if asset.id.lower() in text.lower():
                results.append(ResolvedEntity(asset, confidence=1.0, match_reason="exact_id"))
                logger.debug(
                    "entity_resolved",
                    operation="resolve",
                    asset_id=asset.id,
                    match_reason="exact_id",
                )

        if results:
            return results

        # 2. Name match — check if the asset name appears in the text
        text_lower = text.lower()
        text_tokens = _tokenise(text)
        for asset in assets:
            name_lower = asset.name.lower()
            # Check full name match
            if name_lower in text_lower:
                results.append(ResolvedEntity(asset, confidence=0.9, match_reason="name_match"))
            else:
                # Check significant name words (skip short words)
                name_words = {w for w in name_lower.split() if len(w) > 2}
                overlap = name_words & text_tokens
                if overlap and len(overlap) >= len(name_words) * 0.5:
                    score = len(overlap) / len(name_words)
                    results.append(
                        ResolvedEntity(
                            asset,
                            confidence=round(0.7 * score, 2),
                            match_reason="name_keywords",
                        )
                    )

        # Chinese name matching: try matching Chinese characters in asset name
        if not results:
            for asset in assets:
                name_lower = asset.name.lower()
                # Extract Chinese characters from user text
                cn_chars_in_text = {c for c in text_lower if '\u4e00' <= c <= '\u9fff'}
                cn_chars_in_name = {c for c in name_lower if '\u4e00' <= c <= '\u9fff'}
                if cn_chars_in_text and cn_chars_in_name:
                    overlap = cn_chars_in_text & cn_chars_in_name
                    if len(overlap) >= 2:  # At least 2 Chinese chars match
                        score = len(overlap) / len(cn_chars_in_name)
                        results.append(
                            ResolvedEntity(
                                asset,
                                confidence=round(0.75 * score, 2),
                                match_reason="chinese_name_match",
                            )
                        )

        if results:
            results.sort(key=lambda r: r.confidence, reverse=True)
            return results

        # 3. Location match
        for asset in assets:
            if asset.location:
                loc_lower = asset.location.lower()
                loc_parts = re.split(r"[/\-,\s]+", loc_lower)
                loc_parts = [p for p in loc_parts if len(p) > 1]
                overlap = set(loc_parts) & text_tokens
                if overlap:
                    score = len(overlap) / max(len(loc_parts), 1)
                    results.append(
                        ResolvedEntity(
                            asset,
                            confidence=round(0.6 * score, 2),
                            match_reason="location_match",
                        )
                    )
                else:
                    # Chinese location matching
                    cn_chars_in_text = {c for c in text_lower if '\u4e00' <= c <= '\u9fff'}
                    cn_chars_in_loc = {c for c in loc_lower if '\u4e00' <= c <= '\u9fff'}
                    if cn_chars_in_text and cn_chars_in_loc:
                        cn_overlap = cn_chars_in_text & cn_chars_in_loc
                        if len(cn_overlap) >= 1:  # At least 1 Chinese char matches
                            score = len(cn_overlap) / max(len(cn_chars_in_loc), 1)
                            results.append(
                                ResolvedEntity(
                                    asset,
                                    confidence=round(0.55 * score, 2),
                                    match_reason="chinese_location_match",
                                )
                            )

        if results:
            results.sort(key=lambda r: r.confidence, reverse=True)
            return results

        # 4. Fuzzy keyword match across all fields
        for asset in assets:
            searchable = " ".join(
                [
                    asset.id,
                    asset.name,
                    asset.location,
                    asset.manufacturer,
                    asset.model,
                    asset.type.value,
                ]
            ).lower()

            text_tokens_list = [t for t in text_tokens if len(t) > 2]
            if not text_tokens_list:
                continue

            matches = sum(1 for token in text_tokens_list if token in searchable)
            if matches > 0:
                score = matches / len(text_tokens_list)
                results.append(
                    ResolvedEntity(
                        asset,
                        confidence=round(0.4 * score, 2),
                        match_reason="keyword_match",
                    )
                )

        results.sort(key=lambda r: r.confidence, reverse=True)
        return results

    def resolve_best(self, text: str) -> Asset | None:
        """Resolve to the single best-matching asset, or None.

        Args:
            text: User input that may reference an asset.

        Returns:
            The highest-confidence match, or ``None``.
        """
        matches = self.resolve(text)
        return matches[0].asset if matches else None
