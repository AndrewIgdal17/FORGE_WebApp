"""Route analyze: mapping rules, NLCD classification, and endpoint guards."""

from __future__ import annotations

import forge
import pytest
from fastapi.testclient import TestClient

AUSTIN_DALLAS = {
    "route": {
        "type": "MultiLineString",
        "coordinates": [[[-97.74, 30.27], [-97.10, 31.50], [-96.80, 32.78]]],
    }
}

TERRAIN_KEYS = (
    "forested",
    "wetland",
    "scrubbed_flat",
    "urban",
    "farmland",
    "desert_barren",
    "mountain",
    "rolling_hills",
    "subsea",
)


def _leaf(template: dict, path: str):
    node = template
    for part in path.split("."):
        assert isinstance(node, dict) and part in node, path
        node = node[part]
    assert not isinstance(node, dict), path
    return node


def test_mapping_rules_cover_terrain_and_row_zones():
    from app.route import load_mapping_rules

    rules = load_mapping_rules()
    assert len(rules) == 24
    terrain = [rule for rule in rules if rule["layer"] == "terrain/nlcd"]
    zones = [rule for rule in rules if rule["layer"] == "row/blm"]
    assert [rule["key"] for rule in terrain] == list(TERRAIN_KEYS)
    assert [rule["key"] for rule in zones] == [f"zone_{n}" for n in range(1, 16)]
    assert all(rule["transform"] == "direct" for rule in rules)

    template = forge.get_defaults_template()
    for rule in rules:
        if rule["layer"] == "terrain/nlcd":
            assert rule["forge_path"] == (
                f"02_project_physical_details.terrain.terrain_miles.{rule['key']}"
            )
        else:
            assert rule["forge_path"] == (
                f"11_project_row_details.right_of_way.{rule['key']}.miles"
            )
        _leaf(template, rule["forge_path"])


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        (90, "wetland"),
        (95, "wetland"),
        (41, "forested"),
        (42, "forested"),
        (43, "forested"),
        (21, "urban"),
        (22, "urban"),
        (23, "urban"),
        (24, "urban"),
        (81, "farmland"),
        (82, "farmland"),
        (31, "desert_barren"),
        (52, "scrubbed_flat"),
        (71, "scrubbed_flat"),
        (11, "scrubbed_flat"),
        (12, "scrubbed_flat"),
        (0, "scrubbed_flat"),
    ],
)
def test_classify_nlcd_uses_precedence_and_defaults_the_rest(code, expected):
    from app.route import classify_nlcd

    assert classify_nlcd(code) == expected


def test_terrain_miles_scale_sample_spacing_and_keep_empty_categories():
    from app.route import miles_by_category

    miles = miles_by_category(
        [("wetland", 30.0), ("wetland", 30.0), ("forested", 30.0)]
    )
    assert miles["wetland"] == pytest.approx(60 / 1609.344, abs=0.005)
    assert miles["forested"] == pytest.approx(30 / 1609.344, abs=0.005)
    assert miles["mountain"] == 0
    assert miles["rolling_hills"] == 0
    assert miles["subsea"] == 0
    assert set(miles) == set(TERRAIN_KEYS)


def test_changes_copy_present_intersection_keys_onto_forge_paths():
    from app.route import changes_for

    changes = changes_for(
        {
            "terrain/nlcd": {"forested": 12.5, "wetland": 0.0},
            "row/blm": {"zone_6": 80.0},
        }
    )
    assert changes["02_project_physical_details.terrain.terrain_miles.forested"] == 12.5
    assert changes["02_project_physical_details.terrain.terrain_miles.wetland"] == 0.0
    assert changes["11_project_row_details.right_of_way.zone_6.miles"] == 80.0
    assert "11_project_row_details.right_of_way.zone_1.miles" not in changes
    assert "02_project_physical_details.terrain.terrain_miles.urban" not in changes


def test_analyze_rejects_a_line_that_is_not_a_multilinestring():
    from app.main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/api/route/analyze",
        json={
            "route": {
                "type": "LineString",
                "coordinates": [[-97.74, 30.27], [-96.80, 32.78]],
            }
        },
    )
    assert response.status_code == 422


def test_analyze_rejects_a_line_with_one_position():
    from app.main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/api/route/analyze",
        json={"route": {"type": "MultiLineString", "coordinates": [[[-97.74, 30.27]]]}},
    )
    assert response.status_code == 422


def test_analyze_returns_503_when_rasterio_is_unavailable(monkeypatch):
    from app import route as route_module
    from app.main import app

    monkeypatch.setattr(route_module, "rasterio", None)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/api/route/analyze", json=AUSTIN_DALLAS)
    assert response.status_code == 503
