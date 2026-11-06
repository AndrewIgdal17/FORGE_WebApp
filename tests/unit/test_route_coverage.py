"""Whole-route lower-48 coverage. No database."""

from app.route import (
    _COVERAGE_SQL,
    COVERAGE_TOLERANCE_M,
    ROUTE_REQUIRED,
    lower_48_dc_fips,
    route_not_covered,
)
from app.states import FIPS_TO_STATE


def test_tolerance_and_detail_are_fixed():
    assert COVERAGE_TOLERANCE_M == 1.0
    assert ROUTE_REQUIRED == "A drawn route inside the lower 48 is required."


def test_lower_48_list_includes_dc_and_drops_outside():
    codes = lower_48_dc_fips()
    assert codes == sorted(codes)
    assert "11" in codes
    assert "48" in codes
    assert "53" in codes
    for outside in ("02", "15", "60", "66", "69", "72", "78"):
        assert outside not in codes
    assert len(codes) == len(FIPS_TO_STATE) - 7


def test_empty_or_alaska_or_no_lower_48_county_is_outside():
    assert route_not_covered(1000.0, 1000.0, []) is True
    assert route_not_covered(1000.0, 1000.0, ["02"]) is True
    assert route_not_covered(1000.0, 1000.0, ["48", "02"]) is True
    assert route_not_covered(None, None, ["48"]) is True


def test_texas_and_dc_with_equal_length_are_inside():
    assert route_not_covered(1000.0, 1000.0, ["48"]) is False
    assert route_not_covered(1000.0, 999.2, ["11"]) is False


def test_washington_to_british_columbia_shortfall_is_outside():
    assert route_not_covered(5000.0, 2100.0, ["53"]) is True
    assert route_not_covered(5000.0, 4999.0, ["53"]) is False


def test_coverage_sql_compares_lengths_inside_lower_48_counties():
    assert "ST_Length" in _COVERAGE_SQL
    assert "ST_Intersection" in _COVERAGE_SQL
    assert "ST_UnaryUnion" in _COVERAGE_SQL
    assert "ref.counties_tiger" in _COVERAGE_SQL
    assert "$2" in _COVERAGE_SQL
