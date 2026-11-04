"""Terrain classification and wetland length transfer.

The rules file is the only crosswalk. route.py does not keep a second copy.
"""

from __future__ import annotations

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
