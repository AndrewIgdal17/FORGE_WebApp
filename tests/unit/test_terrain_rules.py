"""Land-cover class from app/mapping_rules.yaml."""

from __future__ import annotations

import pytest

from app.terrain_rules import (
    ClassifiedSample,
    apply_wetland_transfer,
    equivalent_length_m,
    land_cover_class,
    load_classification,
    retain_wetland,
)


@pytest.fixture
def rules():
    return load_classification()


@pytest.mark.parametrize(
    ("code", "slope", "expected"),
    [
        (90, 15.0, "forested"),
        (95, 0.5, "scrubbed_flat"),
        (95, 5.0, "rolling_hills"),
        (95, 9.0, "mountain"),
        (11, 0.5, "scrubbed_flat"),
        (11, 5.0, "rolling_hills"),
        (12, 0.0, "mountain"),
        (12, None, "mountain"),
        (41, 15.0, "forested"),
        (71, 12.0, "mountain"),
        (71, 5.0, "rolling_hills"),
        (71, 0.5, "scrubbed_flat"),
        (71, None, "scrubbed_flat"),
        (None, 9.0, "mountain"),
        (21, 20.0, "urban"),
        (31, 20.0, "desert_barren"),
        (82, 20.0, "farmland"),
    ],
)
def test_land_cover_class(rules, code, slope, expected):
    assert land_cover_class(code, slope, rules) == expected


@pytest.mark.parametrize(
    ("code", "kept"),
    [
        ("PEM1C", True),
        ("pem1c", True),
        (" PFO1A ", True),
        ("PSS", True),
        ("E2EM1N", True),
        ("E2FO", True),
        ("E2SS1", True),
        ("PEM/PSS", False),
        ("PAB1", False),
        ("R2UBH", False),
        ("E1AB", False),
        ("", False),
    ],
)
def test_retain_wetland_keeps_stems_and_drops_mixed_codes(rules, code, kept):
    assert retain_wetland(code, rules.wetland) is kept


def test_equivalent_length_matches_equation_ii_4():
    # One acre inside a 100 ft corridor is 0.0825 miles = 132.77088 m.
    one_acre_m2 = 43560 * (0.3048 ** 2)
    assert equivalent_length_m(one_acre_m2, 100.0) == pytest.approx(132.77088, abs=1e-4)


def test_transfer_caps_at_the_sample_length_and_reports_open_water():
    width_m = 100.0 * 0.3048
    full_slice = 30.0 * width_m
    samples = [
        ClassifiedSample("forested", 30.0, 90, full_slice * 3),
        ClassifiedSample("forested", 30.0, 41, 0.0),
        ClassifiedSample("scrubbed_flat", 30.0, 11, 0.0),
    ]
    result = apply_wetland_transfer(samples, 100.0)
    assert result.miles["wetland"] == pytest.approx(30.0 / 1609.344, abs=0.005)
    assert result.miles["forested"] == pytest.approx(30.0 / 1609.344, abs=0.005)
    assert result.miles["scrubbed_flat"] == pytest.approx(30.0 / 1609.344, abs=0.005)
    assert result.open_water_miles == pytest.approx(30.0 / 1609.344, abs=0.005)
    assert "subsea" not in result.miles
    assert sum(result.miles.values()) == pytest.approx(90.0 / 1609.344, abs=0.05)


def test_transfer_leaves_class_90_as_forest_when_no_polygon_is_retained():
    samples = [ClassifiedSample("forested", 30.0, 90, 0.0)]
    result = apply_wetland_transfer(samples, 100.0)
    assert result.miles["wetland"] == 0
    assert result.miles["forested"] == pytest.approx(30.0 / 1609.344, abs=0.005)
