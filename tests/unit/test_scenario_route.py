"""Scenario create/update persist route geometry and segments.

These tests mock the database. They lock the SQL the API sends: GeoJSON in,
``ST_AsGeoJSON`` out, and name-only saves that leave a stored route alone.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

from app import scenarios as scenarios_module
from app.models import ScenarioCreate, ScenarioUpdate

USER_ID = "11111111-1111-1111-1111-111111111111"
SCENARIO_ID = UUID("22222222-2222-2222-2222-222222222222")
ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[[-97.74, 30.27], [-96.80, 32.78]]],
}
SEGMENTS = [
    {
        "id": "seg-1",
        "geometry": ROUTE,
        "intersections": {"terrain/nlcd": {"urban": 1.0}},
    }
]


def _record(**overrides):
    row = {
        "id": SCENARIO_ID,
        "user_id": UUID(USER_ID),
        "name": "Test scenario",
        "source": "manual",
        "defaults_id": scenarios_module._DEFAULTS_ID,
        "changes": "{}",
        "results": None,
        "calculator": None,
        "inputs_id": None,
        "computed_at": None,
        "calc_error": None,
        "revision": 1,
        "created_at": datetime(2026, 10, 13, tzinfo=UTC),
        "updated_at": datetime(2026, 10, 13, tzinfo=UTC),
        "route": None,
        "segments": None,
    }
    row.update(overrides)
    return row


class _Capture:
    def __init__(self, rows):
        self.rows = list(rows)
        self.calls: list[tuple[str, tuple]] = []

    async def fetchrow(self, sql, *args):
        self.calls.append((sql, args))
        return self.rows.pop(0)


def _patch_db(monkeypatch, conn: _Capture) -> None:
    @asynccontextmanager
    async def _tx(_user_id):
        yield conn

    monkeypatch.setattr(scenarios_module.db_module, "forge_api_transaction", _tx)


def _patch_calc(monkeypatch) -> None:
    def _calculate(_name, _changes):
        return {
            "results": {"provenance": {"inputs_id": "test"}},
            "calculator": {"package": "forge-calc"},
            "inputs_id": "test",
            "computed_at": datetime(2026, 10, 13, tzinfo=UTC),
            "calc_error": None,
        }, None

    monkeypatch.setattr(scenarios_module, "_calculate", _calculate)


def _create_payload(**overrides) -> ScenarioCreate:
    fields = {
        "name": "Plain",
        "source": "manual",
        "defaults_id": scenarios_module._DEFAULTS_ID,
        "changes": {"kept": True},
    }
    fields.update(overrides)
    return ScenarioCreate(**fields)


def test_row_to_dict_decodes_segments_and_route_json_text():
    row = scenarios_module._row_to_dict(
        _record(route=json.dumps(ROUTE), segments=json.dumps(SEGMENTS))
    )
    assert row["route"] == ROUTE
    assert row["segments"] == SEGMENTS


def test_row_to_dict_keeps_route_dict_and_null_segments():
    row = scenarios_module._row_to_dict(_record(route=ROUTE, segments=None))
    assert row["route"] == ROUTE
    assert row["segments"] is None


def test_create_without_route_inserts_null_geometry(monkeypatch):
    conn = _Capture([_record()])
    _patch_db(monkeypatch, conn)
    _patch_calc(monkeypatch)

    response = asyncio.run(scenarios_module.create_scenario(USER_ID, _create_payload()))

    assert response.status_code == 201
    sql, args = conn.calls[0]
    assert "ST_GeomFromGeoJSON($11::text)" in sql
    assert "ST_SetSRID" in sql
    assert "$12::jsonb" in sql
    assert "segments" in sql
    assert "ST_AsGeoJSON(route)::jsonb AS route" in sql
    assert args[10] is None
    assert args[11] is None
    body = json.loads(response.body)
    assert body["route"] is None
    assert "segments" in body
    assert body["segments"] is None


def test_create_with_route_passes_geojson_text(monkeypatch):
    conn = _Capture([_record(route=ROUTE, segments=SEGMENTS)])
    _patch_db(monkeypatch, conn)
    _patch_calc(monkeypatch)

    response = asyncio.run(
        scenarios_module.create_scenario(
            USER_ID, _create_payload(route=ROUTE, segments=SEGMENTS)
        )
    )

    assert response.status_code == 201
    _sql, args = conn.calls[0]
    assert args[10] == json.dumps(ROUTE)
    assert args[11] == json.dumps(SEGMENTS)
    body = json.loads(response.body)
    assert body["route"]["type"] == "MultiLineString"
    assert body["segments"][0]["id"] == "seg-1"


def test_update_name_only_does_not_rewrite_route(monkeypatch):
    existing = _record(route=json.dumps(ROUTE), segments=json.dumps(SEGMENTS))
    updated = _record(name="Renamed", revision=2, route=ROUTE, segments=SEGMENTS)
    conn = _Capture([existing, updated])
    _patch_db(monkeypatch, conn)

    response = asyncio.run(
        scenarios_module.update_scenario(
            USER_ID,
            str(SCENARIO_ID),
            ScenarioUpdate(revision=1, name="Renamed"),
        )
    )

    assert response.status_code == 200
    select_sql, _select_args = conn.calls[0]
    update_sql, _update_args = conn.calls[1]
    assert "ST_AsGeoJSON(route)::jsonb AS route" in select_sql
    assert "ST_GeomFromGeoJSON" not in update_sql
    assert "segments =" not in update_sql
    body = json.loads(response.body)
    assert body["route"] == ROUTE
    assert body["name"] == "Renamed"


def test_update_sets_route_and_segments_when_present(monkeypatch):
    conn = _Capture([_record(), _record(revision=2, route=ROUTE, segments=SEGMENTS)])
    _patch_db(monkeypatch, conn)

    response = asyncio.run(
        scenarios_module.update_scenario(
            USER_ID,
            str(SCENARIO_ID),
            ScenarioUpdate(revision=1, route=ROUTE, segments=SEGMENTS),
        )
    )

    assert response.status_code == 200
    update_sql, update_args = conn.calls[1]
    assert "ST_GeomFromGeoJSON" in update_sql
    assert "ST_SetSRID" in update_sql
    assert "segments =" in update_sql
    assert "ST_AsGeoJSON(route)::jsonb AS route" in update_sql
    assert json.dumps(ROUTE) in update_args
    assert json.dumps(SEGMENTS) in update_args
    assert SCENARIO_ID in update_args
    assert 1 in update_args
    body = json.loads(response.body)
    assert body["segments"][0]["id"] == "seg-1"


def test_update_route_only_leaves_segments_unchanged(monkeypatch):
    conn = _Capture([_record(), _record(revision=2, route=ROUTE)])
    _patch_db(monkeypatch, conn)
    payload = ScenarioUpdate(revision=1, route=ROUTE)
    assert "segments" not in payload.model_fields_set

    response = asyncio.run(
        scenarios_module.update_scenario(USER_ID, str(SCENARIO_ID), payload)
    )

    assert response.status_code == 200
    update_sql, update_args = conn.calls[1]
    assert "ST_GeomFromGeoJSON" in update_sql
    assert "segments =" not in update_sql
    assert json.dumps(ROUTE) in update_args


def test_update_explicit_null_clears_route_and_segments(monkeypatch):
    conn = _Capture(
        [_record(route=ROUTE, segments=SEGMENTS), _record(revision=2, route=None, segments=None)]
    )
    _patch_db(monkeypatch, conn)
    payload = ScenarioUpdate.model_validate({"revision": 1, "route": None, "segments": None})
    assert "route" in payload.model_fields_set
    assert "segments" in payload.model_fields_set

    response = asyncio.run(
        scenarios_module.update_scenario(USER_ID, str(SCENARIO_ID), payload)
    )

    assert response.status_code == 200
    update_sql, update_args = conn.calls[1]
    assert "ST_GeomFromGeoJSON" in update_sql
    assert "segments =" in update_sql
    geom_index = update_sql.index("ST_GeomFromGeoJSON")
    # The geometry parameter is the $N inside ST_GeomFromGeoJSON($N::text).
    placeholder = update_sql[geom_index:].split("($", 1)[1].split("::text", 1)[0]
    assert update_args[int(placeholder) - 1] is None
    body = json.loads(response.body)
    assert body["route"] is None
    assert body["segments"] is None
