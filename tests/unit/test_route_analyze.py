"""Route analyze: mapping rules, NLCD classification, and endpoint guards."""

from __future__ import annotations

import os

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
    assert len(rules) == 23
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


def test_terrain_miles_scale_sample_spacing_and_keep_empty_categories():
    from app.route import miles_by_category

    miles = miles_by_category(
        [("wetland", 30.0), ("wetland", 30.0), ("forested", 30.0)]
    )
    assert miles["wetland"] == pytest.approx(60 / 1609.344, abs=0.005)
    assert miles["forested"] == pytest.approx(30 / 1609.344, abs=0.005)
    assert miles["mountain"] == 0
    assert miles["rolling_hills"] == 0
    assert set(miles) == set(TERRAIN_KEYS)


def test_config_mapping_rules_file_is_gone():
    from pathlib import Path

    assert not Path("config/mapping-rules.yaml").exists()


def test_zone_miles_keep_every_zone_so_a_redraw_can_zero_old_counties():
    from app.route import changes_for, zone_miles_from_rows

    zones = zone_miles_from_rows([{"zone": 6, "miles": 80.004}, {"zone": 99, "miles": 3}])
    assert zones["zone_6"] == 80.0
    assert zones["zone_1"] == 0.0
    assert zones["zone_15"] == 0.0
    assert "zone_99" not in zones
    assert set(zones) == {f"zone_{n}" for n in range(1, 16)}

    changes = changes_for({"terrain/nlcd": {}, "row/blm": zones})
    assert changes["11_project_row_details.right_of_way.zone_6.miles"] == 80.0
    assert changes["11_project_row_details.right_of_way.zone_1.miles"] == 0.0
    assert changes["11_project_row_details.right_of_way.zone_15.miles"] == 0.0


def test_normalize_zone_miles_scales_to_terrain_total():
    from app.route import normalize_zone_miles

    terrain = {"forested": 60.0, "farmland": 40.0, "wetland": 0.0}
    zones = {f"zone_{n}": 0.0 for n in range(1, 16)}
    zones["zone_6"] = 80.0
    zones["zone_7"] = 40.0
    scaled = normalize_zone_miles(zones, terrain)
    assert sum(scaled.values()) == pytest.approx(100.0, abs=0.01)
    assert scaled["zone_6"] == pytest.approx(66.67, abs=0.01)
    assert scaled["zone_7"] == pytest.approx(33.33, abs=0.01)
    assert scaled["zone_1"] == 0.0


def test_normalize_zone_miles_skips_when_zone_total_is_zero():
    from app.route import normalize_zone_miles

    terrain = {"forested": 10.0}
    zones = {f"zone_{n}": 0.0 for n in range(1, 16)}
    assert normalize_zone_miles(zones, terrain) == zones


def test_normalize_zone_miles_skips_when_terrain_total_is_zero():
    from app.route import normalize_zone_miles

    terrain = {"forested": 0.0, "farmland": 0.0}
    zones = {f"zone_{n}": 0.0 for n in range(1, 16)}
    zones["zone_6"] = 12.5
    assert normalize_zone_miles(zones, terrain) == zones


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


PORTLAND_LOS_ANGELES = {
    "route": {
        "type": "MultiLineString",
        "coordinates": [[[-122.67, 45.52], [-118.24, 34.05]]],
    }
}

PACIFIC_OCEAN = {
    "route": {
        "type": "MultiLineString",
        "coordinates": [[[-130.0, 35.0], [-125.0, 38.0]]],
    }
}

ANCHORAGE_FAIRBANKS = {
    "route": {
        "type": "MultiLineString",
        "coordinates": [[[-149.90, 61.22], [-147.72, 64.84]]],
    }
}

ENDPOINT_KEYS = (
    "sending_subregion",
    "receiving_subregion",
    "sending_gea",
    "receiving_gea",
    "sending_state",
    "receiving_state",
)


def _scrubbed_samples(points):
    """Stand in for NLCD so endpoint tests do not need the land-cover raster."""
    return [("scrubbed_flat", spacing) for _x, _y, spacing in points]


def test_fips_to_state_covers_states_dc_and_territories():
    from app.states import FIPS_TO_STATE, fips_to_abbrev

    assert len(FIPS_TO_STATE) == 56
    assert FIPS_TO_STATE["48"] == "TX"
    assert FIPS_TO_STATE["06"] == "CA"
    assert FIPS_TO_STATE["02"] == "AK"
    assert FIPS_TO_STATE["41"] == "OR"
    assert FIPS_TO_STATE["11"] == "DC"
    assert FIPS_TO_STATE["72"] == "PR"
    assert fips_to_abbrev("48") == "TX"
    assert fips_to_abbrev(None) is None
    assert fips_to_abbrev("99") is None


def test_endpoint_context_maps_fips_and_passes_nulls_through():
    from app.route import endpoint_context

    assert endpoint_context(
        {
            "sending_subregion": "ERCT",
            "receiving_subregion": "CAMX",
            "sending_gea": "ERCOT",
            "receiving_gea": None,
            "sending_statefp": "48",
            "receiving_statefp": "02",
        }
    ) == {
        "sending_subregion": "ERCT",
        "receiving_subregion": "CAMX",
        "sending_gea": "ERCOT",
        "receiving_gea": None,
        "sending_state": "TX",
        "receiving_state": "AK",
    }
    assert endpoint_context(None) == {key: None for key in ENDPOINT_KEYS}


def test_endpoint_sql_uses_covers_and_workbook_gea_names():
    from app.route import _ENDPOINT_SQL

    assert "ST_Covers" in _ENDPOINT_SQL
    assert "ST_Contains" not in _ENDPOINT_SQL
    assert "ref.gea_regions" in _ENDPOINT_SQL
    assert "gea_name" in _ENDPOINT_SQL
    assert "ref.subregions_egrid" in _ENDPOINT_SQL
    assert "ref.counties_tiger" in _ENDPOINT_SQL


@pytest.fixture
def analyze_client(monkeypatch):
    """POST /api/route/analyze against PostGIS. Skips without a test database."""
    dsn = os.environ.get("FORGE_DATABASE_URL_TEST")
    if not dsn:
        pytest.skip("FORGE_DATABASE_URL_TEST is not set")
    from app import main as main_module
    from app import route as route_module
    from app.main import app

    monkeypatch.setattr(main_module, "_FORGE_DATABASE_URL", dsn)
    monkeypatch.setattr(route_module, "sample_terrain", _scrubbed_samples)
    with TestClient(app) as client:
        yield client


def _analyze(client: TestClient, payload: dict) -> dict:
    response = client.post("/api/route/analyze", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_endpoint_attribution_austin_dallas(analyze_client):
    body = _analyze(analyze_client, AUSTIN_DALLAS)
    assert body["sending_subregion"] == "ERCT"
    assert body["receiving_subregion"] == "ERCT"
    assert body["sending_gea"] == "ERCOT"
    assert body["receiving_gea"] == "ERCOT"
    assert body["sending_state"] == "TX"
    assert body["receiving_state"] == "TX"


def test_endpoint_attribution_cross_region(analyze_client):
    body = _analyze(analyze_client, PORTLAND_LOS_ANGELES)
    assert body["sending_subregion"] == "NWPP"
    assert body["receiving_subregion"] == "CAMX"
    assert body["sending_gea"] == "NorthernGrid West"
    assert body["receiving_gea"] == "CAISO"
    assert body["sending_state"] == "OR"
    assert body["receiving_state"] == "CA"


def test_endpoint_attribution_ocean(analyze_client):
    body = _analyze(analyze_client, PACIFIC_OCEAN)
    assert {key: body[key] for key in ENDPOINT_KEYS} == {key: None for key in ENDPOINT_KEYS}


def test_endpoint_attribution_partial_null(analyze_client):
    body = _analyze(analyze_client, ANCHORAGE_FAIRBANKS)
    assert body["sending_subregion"] == "AKGD"
    assert body["receiving_subregion"] == "AKGD"
    assert body["sending_gea"] is None
    assert body["receiving_gea"] is None
    assert body["sending_state"] == "AK"
    assert body["receiving_state"] == "AK"


def test_endpoint_fields_present_on_normal_route(analyze_client):
    body = _analyze(analyze_client, AUSTIN_DALLAS)
    assert set(ENDPOINT_KEYS).issubset(body)
    for key in ENDPOINT_KEYS:
        assert body[key] is None or isinstance(body[key], str)


def test_existing_analyze_unchanged(analyze_client):
    body = _analyze(analyze_client, AUSTIN_DALLAS)
    assert body["total_miles"] == 183.4
    assert set(body["intersections"]) == {"terrain/nlcd", "row/blm"}
    assert set(body["intersections"]["terrain/nlcd"]) == set(TERRAIN_KEYS)
    assert isinstance(body["changes"], dict)
    assert "sending_subregion" not in body["changes"]
