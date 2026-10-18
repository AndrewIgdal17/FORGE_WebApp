"""Feature extraction for the substation name audit ML models."""

from __future__ import annotations

import math
import re

import jellyfish
import numpy as np

FEATURE_NAMES = (
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

_PLACEHOLDER_RE = re.compile(
    r"^(UNKNOWN|TAP|DEADEND|NOT AVAILABLE)\d*$",
    re.IGNORECASE,
)

HIFLD_TYPE_CODES = {"SUBSTATION": 0, "TAP": 1, "DEAD END": 2, "RISER": 3}
SOURCE_CODES = {"merged": 0, "hifld": 1}


def _finite(value: object) -> float:
    """Coerce a value to a finite float. None, non-numeric, NaN, and inf become 0."""
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(number):
        return 0.0
    return number


def _clean_name(name: str | None) -> str:
    if name is None:
        return ""
    return str(name).strip()


_KNOWN_PREFIX_RE = re.compile(
    r"^(UNKNOWN|TAP|DEADEND|DEAD END|NOT AVAILABLE|RISER)",
    re.IGNORECASE,
)

_HAS_DIGITS_RE = re.compile(r"\d")


def _is_placeholder(name: str) -> bool:
    if not name:
        return False
    return bool(_PLACEHOLDER_RE.match(name))


def _has_digits(name: str) -> bool:
    return bool(_HAS_DIGITS_RE.search(name)) if name else False


def _word_count(name: str) -> int:
    return len(name.split()) if name else 0


def _has_known_prefix(name: str) -> bool:
    return bool(_KNOWN_PREFIX_RE.match(name)) if name else False


def _token_overlap(left: str, right: str) -> float:
    tokens_left = set(left.upper().split())
    tokens_right = set(right.upper().split())
    union = tokens_left | tokens_right
    if not union:
        return 0.0
    return len(tokens_left & tokens_right) / len(union)


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
    """Return the audit features as finite floats, in FEATURE_NAMES order."""
    left = _clean_name(hifld_name)
    right = _clean_name(matched_name)
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

    left_placeholder = _is_placeholder(left)
    right_placeholder = _is_placeholder(right)
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
        "corridor_source_code": SOURCE_CODES.get(source_key, 1),
        "state_match": bool(state_match),
        "sub_area_sqm": sub_area_sqm,
        "corridor_degree": corridor_degree,
        "nlcd_class": nlcd_class,
        "hifld_name_has_digits": float(_has_digits(left)),
        "matched_name_has_digits": float(_has_digits(right)),
        "hifld_name_word_count": float(_word_count(left)),
        "matched_name_word_count": float(_word_count(right)),
        "hifld_name_known_prefix": float(_has_known_prefix(left)),
        "matched_name_known_prefix": float(_has_known_prefix(right)),
    }
    return {name: _finite(features[name]) for name in FEATURE_NAMES}


def features_to_array(features: dict[str, float]) -> np.ndarray:
    """Stack features in FEATURE_NAMES order into one float64 vector."""
    return np.array([_finite(features[name]) for name in FEATURE_NAMES], dtype=np.float64)
