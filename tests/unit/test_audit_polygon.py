"""Polygon validation and the audit SQL that stores a yard footprint."""

from __future__ import annotations

import pytest

from app.audit import (
    _NEXT_SQL,
    _POLYGON_LOG_SQL,
    _SAVE_POLYGON_SQL,
    _SPECIFIC_SQL,
    _mismatch_payload,
    polygon_geojson,
)

_SQUARE = [
    [-97.0, 30.0],
    [-97.0, 30.001],
    [-96.999, 30.001],
    [-97.0, 30.0],
]


def test_polygon_geojson_accepts_a_closed_ring():
    polygon = polygon_geojson({"type": "Polygon", "coordinates": [_SQUARE]})
    assert polygon == {"type": "Polygon", "coordinates": [_SQUARE]}


def test_polygon_geojson_drops_a_third_coordinate():
    ring = [[lon, lat, 12.0] for lon, lat in _SQUARE]
    polygon = polygon_geojson({"type": "Polygon", "coordinates": [ring]})
    assert polygon["coordinates"] == [_SQUARE]


def test_polygon_geojson_rejects_other_geometry():
    with pytest.raises(ValueError, match="Polygon"):
        polygon_geojson({"type": "Point", "coordinates": [-97.0, 30.0]})


def test_polygon_geojson_rejects_an_open_ring():
    open_ring = [
        [-97.0, 30.0],
        [-97.0, 30.001],
        [-96.999, 30.001],
        [-96.999, 30.0],
    ]
    with pytest.raises(ValueError, match="closed"):
        polygon_geojson({"type": "Polygon", "coordinates": [open_ring]})


def test_polygon_geojson_rejects_coordinates_outside_lon_lat():
    ring = [[-97.0, 30.0], [-97.0, 91.0], [-96.999, 30.001], [-97.0, 30.0]]
    with pytest.raises(ValueError, match="longitude"):
        polygon_geojson({"type": "Polygon", "coordinates": [ring]})


def test_polygon_geojson_rejects_too_few_positions():
    with pytest.raises(ValueError, match="four positions"):
        polygon_geojson(
            {
                "type": "Polygon",
                "coordinates": [[[-97.0, 30.0], [-97.0, 30.0], [-97.0, 30.0]]],
            }
        )


def test_save_polygon_sql_transforms_and_logs():
    assert "ST_Transform" in _SAVE_POLYGON_SQL
    assert "ST_SetSRID" in _SAVE_POLYGON_SQL
    assert "4326" in _SAVE_POLYGON_SQL
    assert "5070" in _SAVE_POLYGON_SQL
    assert "ST_GeomFromGeoJSON" in _SAVE_POLYGON_SQL
    assert "ST_Area" in _SAVE_POLYGON_SQL
    assert "ref.substations" in _SAVE_POLYGON_SQL
    assert "ref.audit_polygon_log" in _POLYGON_LOG_SQL


def test_specific_next_sql_is_not_random():
    assert "ORDER BY random()" in _NEXT_SQL
    assert "ORDER BY random()" not in _SPECIFIC_SQL
    assert "c.gid = $1" in _SPECIFIC_SQL
    assert "c.sub_1_flag = 'mismatch'" in _SPECIFIC_SQL
    assert "ST_Area(s.geom) AS sub_area_sqm" in _SPECIFIC_SQL


def test_mismatch_payload_includes_substation_area():
    row = {
        "gid": 10,
        "endpoint": "a",
        "volt_class": "230-345",
        "voltage_kv": 345,
        "source": "hifld",
        "hifld_name": "ALPHA",
        "sub_gid": 99,
        "matched_name": "BETA",
        "sub_voltage_kv": 345,
        "sub_state": "TX",
        "hifld_type": "SUBSTATION",
        "distance_m": 12,
        "corridor_miles": 8.2,
        "match_tier": 1,
        "sub_area_sqm": 4321.4,
        "corridor_statefp": "48",
        "corridor_degree": 2,
        "corridor_geojson": '{"type":"LineString","coordinates":[]}',
        "sub_geojson": '{"type":"Polygon","coordinates":[]}',
        "endpoint_geojson": '{"type":"Point","coordinates":[-97,30]}',
    }
    payload = _mismatch_payload(row, 21)
    assert payload["sub_area_sqm"] == 4321.4
    assert payload["match_tier"] == 1
    assert payload["sub_gid"] == 99
