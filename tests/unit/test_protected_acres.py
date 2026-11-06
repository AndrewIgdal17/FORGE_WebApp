"""Protected-area acres from slice overlap and the wetland length share."""

from __future__ import annotations

import pytest

from app.terrain_rules import (
    FT_PER_MILE,
    HABITAT_CLASSES,
    METERS_PER_FOOT,
    METERS_PER_MILE,
    SQ_FT_PER_ACRE,
    ClassifiedSample,
    equivalent_length_m,
    protected_acres,
)

MILE_M = 1609.344
ACRE_M2 = 4046.8564224
WIDTH_FT = 100.0


def _zeros() -> dict[str, float]:
    return {name: 0.0 for name in HABITAT_CLASSES}


def _area_m2_for_length(length_m: float, row_width_ft: float) -> float:
    miles = length_m / METERS_PER_MILE
    acres = miles * (FT_PER_MILE * row_width_ft / SQ_FT_PER_ACRE)
    return acres * (METERS_PER_FOOT ** 2) * SQ_FT_PER_ACRE


def test_one_forested_acre_with_no_wetland():
    sample = ClassifiedSample("forested", MILE_M, 41, 0.0)
    result = protected_acres([sample], [ACRE_M2], WIDTH_FT)
    assert list(result) == list(HABITAT_CLASSES)
    assert result["forested"] == pytest.approx(1.0)
    assert result["scrubbed_flat"] == 0.0
    assert result["desert_barren"] == 0.0
    assert result["rolling_hills"] == 0.0
    assert result["mountain"] == 0.0


def test_half_the_length_keeps_half_the_overlap():
    sample = ClassifiedSample(
        "forested",
        MILE_M,
        41,
        _area_m2_for_length(MILE_M / 2, WIDTH_FT),
    )
    moved = equivalent_length_m(sample.wetland_area_m2, WIDTH_FT)
    assert moved == pytest.approx(MILE_M / 2)
    result = protected_acres([sample], [2 * ACRE_M2], WIDTH_FT)
    assert result["forested"] == pytest.approx(1.0)
    assert sum(result.values()) == pytest.approx(1.0)


def test_a_full_wetland_transfer_contributes_nothing():
    sample = ClassifiedSample(
        "forested",
        MILE_M,
        41,
        _area_m2_for_length(MILE_M, WIDTH_FT),
    )
    result = protected_acres([sample], [ACRE_M2], WIDTH_FT)
    assert result == _zeros()


def test_farmland_overlap_contributes_nothing():
    sample = ClassifiedSample("farmland", MILE_M, 82, 0.0)
    assert protected_acres([sample], [ACRE_M2], WIDTH_FT) == _zeros()


def test_open_water_contributes_nothing():
    scrubbed = ClassifiedSample("scrubbed_flat", MILE_M, 11, 0.0)
    hills = ClassifiedSample("rolling_hills", MILE_M, 11, 0.0)
    assert protected_acres([scrubbed], [ACRE_M2], WIDTH_FT) == _zeros()
    assert protected_acres([hills], [ACRE_M2], WIDTH_FT) == _zeros()


def test_overlap_is_capped_at_the_remaining_class_acres():
    sample = ClassifiedSample("forested", MILE_M, 41, 0.0)
    result = protected_acres([sample], [1e12], WIDTH_FT)
    assert result["forested"] == pytest.approx(4400 / 363)
    assert result["forested"] < 1e12 / (METERS_PER_FOOT ** 2) / SQ_FT_PER_ACRE


def test_an_unknown_land_cover_name_is_scrubbed_flat():
    sample = ClassifiedSample("pasture", MILE_M, 41, 0.0)
    result = protected_acres([sample], [ACRE_M2], WIDTH_FT)
    assert result["scrubbed_flat"] == pytest.approx(1.0)
    assert result["forested"] == 0.0


def test_an_empty_sample_list_returns_five_zeros():
    assert protected_acres([], [], WIDTH_FT) == _zeros()


def test_a_shorter_overlap_list_is_refused():
    sample = ClassifiedSample("forested", MILE_M, 41, 0.0)
    with pytest.raises(
        RuntimeError,
        match="protected-area count does not match sample count",
    ):
        protected_acres([sample], [], WIDTH_FT)


def test_a_negative_overlap_is_refused():
    sample = ClassifiedSample("forested", MILE_M, 41, 0.0)
    with pytest.raises(ValueError):
        protected_acres([sample], [-1.0], WIDTH_FT)
