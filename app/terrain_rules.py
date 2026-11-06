"""Terrain classification and wetland length transfer.

The rules file is the only crosswalk. route.py does not keep a second copy.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

_RULES_PATH = Path(__file__).with_name("mapping_rules.yaml")
_cache: dict[str, Any] | None = None


@dataclass(frozen=True)
class SlopeThresholds:
    mountain_above_pct: float
    rolling_hills_at_or_above_pct: float


@dataclass(frozen=True)
class WetlandRule:
    stems: tuple[str, ...]
    mixed: str


@dataclass(frozen=True)
class Classification:
    default: str
    slope: SlopeThresholds
    nlcd: dict[int, str]
    wetland: WetlandRule


def clear_rules_cache() -> None:
    global _cache
    _cache = None


def load_rules_document() -> dict[str, Any]:
    global _cache
    if _cache is None:
        with _RULES_PATH.open() as handle:
            document = yaml.safe_load(handle)
        if not isinstance(document, dict):
            raise RuntimeError("mapping_rules.yaml must be a mapping")
        _cache = document
    return _cache


def load_mapping_rules() -> list[dict[str, Any]]:
    rules = load_rules_document()["rules"]
    if not isinstance(rules, list):
        raise RuntimeError("mapping_rules.yaml is missing a rules list")
    return rules


def load_classification() -> Classification:
    raw = load_rules_document()["classification"]
    slope = raw["slope"]
    nlcd = {int(code): str(name) for code, name in raw["nlcd"].items()}
    wetland = raw["wetland"]
    return Classification(
        default=str(raw["default"]),
        slope=SlopeThresholds(
            mountain_above_pct=float(slope["mountain_above_pct"]),
            rolling_hills_at_or_above_pct=float(slope["rolling_hills_at_or_above_pct"]),
        ),
        nlcd=nlcd,
        wetland=WetlandRule(
            stems=tuple(str(stem) for stem in wetland["stems"]),
            mixed=str(wetland["mixed"]),
        ),
    )


def _from_slope(slope_pct: float | None, classification: Classification) -> str:
    if slope_pct is None:
        return classification.default
    if slope_pct > classification.slope.mountain_above_pct:
        return "mountain"
    if slope_pct >= classification.slope.rolling_hills_at_or_above_pct:
        return "rolling_hills"
    return classification.default


def land_cover_class(
    code: int | None,
    slope_pct: float | None,
    classification: Classification,
) -> str:
    """Map one NLCD class and a percent slope to a terrain class."""
    if code is None:
        return _from_slope(slope_pct, classification)
    mapped = classification.nlcd.get(int(code), "slope")
    if mapped == "slope":
        return _from_slope(slope_pct, classification)
    return mapped


METERS_PER_FOOT = 0.3048
SQ_FT_PER_ACRE = 43560
FT_PER_MILE = 5280
METERS_PER_MILE = 1609.344

# equivalent_length_m undershoots a full-slice area by a few ulps
# (one ulp on a mile at 100 ft). A shortfall inside this band is a
# complete move. One ulp past it leaves a remainder.
WETLAND_TRANSFER_SNAP_ULPS = 8

TERRAIN_CLASSES = (
    "forested",
    "wetland",
    "scrubbed_flat",
    "urban",
    "farmland",
    "desert_barren",
    "mountain",
    "rolling_hills",
)

HABITAT_CLASSES = (
    "forested",
    "scrubbed_flat",
    "desert_barren",
    "rolling_hills",
    "mountain",
)


def moved_length_m(
    length_m: float, wetland_area_m2: float, row_width_ft: float
) -> float:
    """Meters moved onto wetland for one sample.

    Terrain miles and protected acres both call this so they keep the same
    remaining length after the transfer.
    """
    if length_m < 0 or wetland_area_m2 < 0:
        raise ValueError("sample length and wetland area must be non-negative")
    equivalent = equivalent_length_m(wetland_area_m2, row_width_ft)
    if length_m - equivalent <= WETLAND_TRANSFER_SNAP_ULPS * math.ulp(length_m):
        equivalent = length_m
    return min(length_m, equivalent)


def protected_acres(
    samples: list[ClassifiedSample],
    overlap_m2: list[float],
    row_width_ft: float,
) -> dict[str, float]:
    """PAD-US overlap acres left in each habitat class after the wetland transfer.

    NLCD code 11 contributes nothing. The terrain name is not the test.
    """
    if len(samples) != len(overlap_m2):
        raise RuntimeError("protected-area count does not match sample count")
    acres = {name: 0.0 for name in HABITAT_CLASSES}
    for sample, area_m2 in zip(samples, overlap_m2, strict=True):
        if sample.length_m < 0 or sample.wetland_area_m2 < 0 or area_m2 < 0:
            raise ValueError(
                "sample length, wetland area, and overlap must be non-negative"
            )
        if sample.nlcd_code == 11 or sample.length_m == 0 or area_m2 == 0:
            continue
        source = (
            sample.land_cover if sample.land_cover in TERRAIN_CLASSES else "scrubbed_flat"
        )
        if source not in acres:
            continue
        moved = moved_length_m(sample.length_m, sample.wetland_area_m2, row_width_ft)
        remaining = sample.length_m - moved
        share = remaining / sample.length_m
        overlap_acres = area_m2 / (METERS_PER_FOOT ** 2) / SQ_FT_PER_ACRE
        remaining_acres = (
            remaining / METERS_PER_MILE * FT_PER_MILE * row_width_ft / SQ_FT_PER_ACRE
        )
        acres[source] += min(overlap_acres * share, remaining_acres)
    return acres


def retain_wetland(code: str, rule: WetlandRule) -> bool:
    """True when every code segment begins with a configured wetland stem."""
    text = code.strip().upper()
    if not text:
        return False
    stems_upper = tuple(stem.upper() for stem in rule.stems)

    def segment_matches(segment: str) -> bool:
        if not segment:
            return False
        return any(segment.startswith(stem) for stem in stems_upper)

    if "/" in text:
        if rule.mixed == "exclude":
            return False
        if rule.mixed != "every_part":
            raise ValueError(f"unsupported mixed-code rule: {rule.mixed}")
        parts = [part.strip().upper() for part in text.split("/")]
        return all(segment_matches(part) for part in parts)
    return segment_matches(text)


def equivalent_length_m(area_m2: float, row_width_ft: float) -> float:
    """Equation (II.4), in meters. Acres / (5280 * W_ft / 43560), times meters per mile."""
    if row_width_ft <= 0:
        raise ValueError("row_width_ft must be positive")
    if area_m2 < 0:
        raise ValueError("area_m2 must be non-negative")
    acres = area_m2 / (METERS_PER_FOOT ** 2) / SQ_FT_PER_ACRE
    miles = acres / (FT_PER_MILE * row_width_ft / SQ_FT_PER_ACRE)
    return miles * METERS_PER_MILE


@dataclass(frozen=True)
class SampleHit:
    land_cover: str
    length_m: float
    nlcd_code: int | None


@dataclass(frozen=True)
class ClassifiedSample(SampleHit):
    wetland_area_m2: float


@dataclass(frozen=True)
class TerrainResult:
    miles: dict[str, float]
    open_water_miles: float


# Route-derived terrain totals match the route length inside this tolerance.
ROUTE_MILES_TOLERANCE = 1e-6


def terrain_matches_route_length(terrain_miles: float, route_miles: float) -> bool:
    """True when a terrain total is within 1e-6 mile of the route length."""
    return abs(terrain_miles - route_miles) <= ROUTE_MILES_TOLERANCE


def apply_wetland_transfer(
    samples: list[ClassifiedSample],
    row_width_ft: float,
) -> TerrainResult:
    meters = {name: 0.0 for name in TERRAIN_CLASSES}
    open_water_m = 0.0
    for sample in samples:
        if sample.length_m < 0 or sample.wetland_area_m2 < 0:
            raise ValueError("sample length and wetland area must be non-negative")
        source = sample.land_cover if sample.land_cover in meters else "scrubbed_flat"
        moved = moved_length_m(sample.length_m, sample.wetland_area_m2, row_width_ft)
        meters[source] += sample.length_m - moved
        meters["wetland"] += moved
        if sample.nlcd_code == 11:
            open_water_m += sample.length_m
    return TerrainResult(
        miles={name: value / METERS_PER_MILE for name, value in meters.items()},
        open_water_miles=open_water_m / METERS_PER_MILE,
    )
