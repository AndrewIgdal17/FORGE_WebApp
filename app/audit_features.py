"""Feature extraction for Phase A substation-identity verification.

28 features comparing an HIFLD point to an OSM polygon to determine
whether they represent the same physical substation.
"""

from __future__ import annotations

import math
import re

import jellyfish
import numpy as np

FEATURE_NAMES = (
    "distance_m",
    "hifld_inside_osm",
    "osm_area_sqm",
    "hifld_to_boundary_m",
    "name_levenshtein",
    "name_jaro_winkler",
    "name_token_overlap",
    "hifld_name_length",
    "osm_name_length",
    "both_have_name",
    "hifld_placeholder",
    "osm_placeholder",
    "voltage_match",
    "hifld_voltage_kv",
    "osm_voltage_kv",
    "hifld_type_code",
    "osm_type_code",
    "hifld_type_is_substation",
    "nearby_hifld_count",
    "nearby_osm_count",
    "corridor_degree",
    "state_match",
    "osm_compactness",
    "osm_orientation_deg",
    "nlcd_at_hifld",
    "nlcd_at_osm",
    "hifld_name_has_digits",
    "osm_name_has_digits",
)

_PLACEHOLDER_RE = re.compile(
    r"^(UNKNOWN|TAP|DEADEND|DEAD END|NOT AVAILABLE)\d*$",
    re.IGNORECASE,
)

HIFLD_TYPE_CODES = {"SUBSTATION": 0, "TAP": 1, "DEAD END": 2, "RISER": 3}
OSM_TYPE_CODES = {
    "transmission": 0,
    "distribution": 1,
    "generation": 2,
    "converter": 3,
    "traction": 4,
}
_HAS_DIGITS_RE = re.compile(r"\d")


def _finite(value: object) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(number):
        return 0.0
    return number


def _clean(name: str | None) -> str:
    if name is None:
        return ""
    return str(name).strip()


def _is_placeholder(name: str) -> bool:
    if not name:
        return True  # empty/NULL OSM names count as placeholder
    return bool(_PLACEHOLDER_RE.match(name))


def _token_overlap(left: str, right: str) -> float:
    tl = set(left.upper().split())
    tr = set(right.upper().split())
    union = tl | tr
    if not union:
        return 0.0
    return len(tl & tr) / len(union)


def compute_phase_a_features(
    distance_m: float,
    hifld_inside: bool,
    osm_area_sqm: float,
    boundary_distance_m: float,
    hifld_name: str | None,
    osm_name: str | None,
    voltage_match: float,
    hifld_voltage_kv: float | None,
    osm_voltage_kv: float | None,
    hifld_type: str | None,
    osm_type: str | None,
    nearby_hifld: int,
    nearby_osm: int,
    corridor_degree: int,
    state_match: bool,
    compactness: float,
    orientation_deg: float,
    nlcd_at_hifld: float,
    nlcd_at_osm: float,
) -> dict[str, float]:
    """Return 28 features as finite floats in FEATURE_NAMES order."""
    left = _clean(hifld_name)
    right = _clean(osm_name)
    both_present = bool(left) and bool(right) and not _is_placeholder(left) and not _is_placeholder(right)

    if both_present:
        left_upper = left.upper()
        right_upper = right.upper()
        levenshtein = float(jellyfish.levenshtein_distance(left_upper, right_upper))
        jaro_winkler = float(jellyfish.jaro_winkler_similarity(left_upper, right_upper))
        token_overlap = _token_overlap(left, right)
    else:
        levenshtein = 0.0
        jaro_winkler = 0.0
        token_overlap = 0.0

    ht = (hifld_type or "").strip().upper()
    ot = (osm_type or "").strip().lower()

    features = {
        "distance_m": distance_m,
        "hifld_inside_osm": float(hifld_inside),
        "osm_area_sqm": osm_area_sqm,
        "hifld_to_boundary_m": boundary_distance_m,
        "name_levenshtein": levenshtein,
        "name_jaro_winkler": jaro_winkler,
        "name_token_overlap": token_overlap,
        "hifld_name_length": float(len(left)),
        "osm_name_length": float(len(right)),
        "both_have_name": float(both_present),
        "hifld_placeholder": float(_is_placeholder(left)),
        "osm_placeholder": float(_is_placeholder(right)),
        "voltage_match": voltage_match,
        "hifld_voltage_kv": hifld_voltage_kv or 0,
        "osm_voltage_kv": osm_voltage_kv or 0,
        "hifld_type_code": HIFLD_TYPE_CODES.get(ht, 4),
        "osm_type_code": OSM_TYPE_CODES.get(ot, 5),
        "hifld_type_is_substation": float(ht == "SUBSTATION"),
        "nearby_hifld_count": nearby_hifld,
        "nearby_osm_count": nearby_osm,
        "corridor_degree": corridor_degree,
        "state_match": float(state_match),
        "osm_compactness": compactness,
        "osm_orientation_deg": orientation_deg,
        "nlcd_at_hifld": nlcd_at_hifld,
        "nlcd_at_osm": nlcd_at_osm,
        "hifld_name_has_digits": float(bool(_HAS_DIGITS_RE.search(left))),
        "osm_name_has_digits": float(bool(_HAS_DIGITS_RE.search(right))),
    }
    return {name: _finite(features[name]) for name in FEATURE_NAMES}


def features_to_array(features: dict[str, float]) -> np.ndarray:
    """Stack features in FEATURE_NAMES order into one float64 vector."""
    return np.array(
        [_finite(features.get(name, 0.0)) for name in FEATURE_NAMES], dtype=np.float64
    )


# ---------------------------------------------------------------------------
# Legacy corridor-audit interface (kept for app/audit.py backward compat)
# ---------------------------------------------------------------------------

_LEGACY_FEATURE_NAMES = (
    "levenshtein",
    "jaro_winkler",
    "token_overlap",
    "both_placeholder",
    "one_placeholder",
    "length_ratio",
    "distance_m",
    "match_tier",
    "voltage_match",
    "corridor_miles",
    "corridor_voltage_kv",
    "hifld_type_code",
    "corridor_source_code",
    "state_match",
    "sub_area_sqm",
    "corridor_degree",
    "nlcd_class",
    "hifld_name_has_digits",
    "matched_name_has_digits",
    "hifld_name_word_count",
    "matched_name_word_count",
    "hifld_name_known_prefix",
    "matched_name_known_prefix",
)

_KNOWN_PREFIX_RE = re.compile(
    r"^(UNKNOWN|TAP|DEADEND|DEAD END|NOT AVAILABLE|RISER)",
    re.IGNORECASE,
)

_SOURCE_CODES = {"merged": 0, "hifld": 1}


def _legacy_is_placeholder(name: str) -> bool:
    if not name:
        return False
    return bool(_PLACEHOLDER_RE.match(name))


def compute_features(
    hifld_name: str | None,
    matched_name: str | None,
    distance_m: float,
    match_tier: int,
    voltage_match: float,
    corridor_miles: float,
    corridor_voltage_kv: float | None,
    hifld_type: str | None,
    corridor_source: str,
    state_match: bool,
    sub_area_sqm: float | None = None,
    corridor_degree: float | None = None,
    nlcd_class: float | None = None,
) -> dict[str, float]:
    """Legacy corridor-audit features (23). Kept for app/audit.py callers."""
    left = _clean(hifld_name)
    right = _clean(matched_name)
    both_present = bool(left) and bool(right)

    if both_present:
        levenshtein = float(jellyfish.levenshtein_distance(left, right))
        jaro_winkler = float(jellyfish.jaro_winkler_similarity(left, right))
        token_overlap = _token_overlap(left, right)
        length_ratio = min(len(left), len(right)) / max(len(left), len(right))
    else:
        levenshtein = 0.0
        jaro_winkler = 0.0
        token_overlap = 0.0
        length_ratio = 0.0

    left_placeholder = _legacy_is_placeholder(left)
    right_placeholder = _legacy_is_placeholder(right)
    type_key = (hifld_type or "").strip().upper()
    source_key = (corridor_source or "").strip().lower()

    features = {
        "levenshtein": levenshtein,
        "jaro_winkler": jaro_winkler,
        "token_overlap": token_overlap,
        "both_placeholder": float(left_placeholder and right_placeholder),
        "one_placeholder": float(left_placeholder != right_placeholder),
        "length_ratio": length_ratio,
        "distance_m": distance_m,
        "match_tier": match_tier,
        "voltage_match": voltage_match,
        "corridor_miles": corridor_miles,
        "corridor_voltage_kv": corridor_voltage_kv or 0,
        "hifld_type_code": HIFLD_TYPE_CODES.get(type_key, 4),
        "corridor_source_code": _SOURCE_CODES.get(source_key, 1),
        "state_match": bool(state_match),
        "sub_area_sqm": sub_area_sqm,
        "corridor_degree": corridor_degree,
        "nlcd_class": nlcd_class,
        "hifld_name_has_digits": float(bool(_HAS_DIGITS_RE.search(left))),
        "matched_name_has_digits": float(bool(_HAS_DIGITS_RE.search(right))),
        "hifld_name_word_count": float(len(left.split()) if left else 0),
        "matched_name_word_count": float(len(right.split()) if right else 0),
        "hifld_name_known_prefix": float(bool(_KNOWN_PREFIX_RE.match(left)) if left else False),
        "matched_name_known_prefix": float(bool(_KNOWN_PREFIX_RE.match(right)) if right else False),
    }
    return {name: _finite(features[name]) for name in _LEGACY_FEATURE_NAMES}
