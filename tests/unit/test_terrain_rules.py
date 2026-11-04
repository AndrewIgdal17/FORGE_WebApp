"""Land-cover class from app/mapping_rules.yaml."""

from __future__ import annotations

import pytest

from app.terrain_rules import land_cover_class, load_classification


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
