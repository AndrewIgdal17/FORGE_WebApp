"""Server footprint flags on scenario create. The database is mocked.

A project row carries substation gids. The footprint lookup is a separate
read: true flags let an end 183 m off snap; no row keeps the 100 m test;
point terminals never ask the database.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

from fastapi.responses import JSONResponse

from app import scenarios as scenarios_module
from app.models import ScenarioCreate

USER_ID = "abababab-abab-abab-abab-abababababab"
PROJECT_ID = UUID("cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd")
SCENARIO_ID = UUID("efefefef-efef-efef-efef-efefefefefef")
SEND_GID = 101
RECV_GID = 202
SEND = (-97.74, 30.27)
RECV = (-96.80, 32.78)
NOW = datetime(2026, 11, 27, tzinfo=UTC)


def _offset_north(point: tuple[float, float], delta_m: float) -> tuple[float, float]:
    """Move a point north by ``delta_m`` metres (same scale as the terminal tests)."""
    return (point[0], point[1] + delta_m / 111_194.926)


def _route(first: tuple[float, float], last: tuple[float, float]) -> dict:
    mid = ((first[0] + last[0]) / 2, (first[1] + last[1]) / 2)
    return {
        "type": "MultiLineString",
        "coordinates": [[[first[0], first[1]], [mid[0], mid[1]], [last[0], last[1]]]],
    }


def _scenario_body(route: dict) -> dict:
    return {
        "name": "Line",
        "source": "manual",
        "defaults_id": scenarios_module._DEFAULTS_ID,
        "changes": {"kept": True},
        "route": route,
        "row_width_ft": 100,
        "project_id": str(PROJECT_ID),
    }


def _project_row(**overrides) -> dict:
    row = {
        "id": PROJECT_ID,
        "user_id": UUID(USER_ID),
        "base_scenario_id": SCENARIO_ID,
        "sending_substation_gid": SEND_GID,
        "receiving_substation_gid": RECV_GID,
        "sending_lon": SEND[0],
        "sending_lat": SEND[1],
        "receiving_lon": RECV[0],
        "receiving_lat": RECV[1],
    }
    row.update(overrides)
    return row


def _scenario_row(**overrides) -> dict:
    row = {
        "id": SCENARIO_ID,
        "user_id": UUID(USER_ID),
        "name": "Line",
        "source": "manual",
        "defaults_id": scenarios_module._DEFAULTS_ID,
        "changes": "{}",
        "results": {"provenance": {"inputs_id": "test"}},
        "calculator": {"package": "forge-calc"},
        "inputs_id": "test",
        "computed_at": NOW,
        "calc_error": None,
        "revision": 1,
        "created_at": NOW,
        "updated_at": NOW,
        "route": None,
        "segments": None,
        "layer_releases": None,
        "project_id": PROJECT_ID,
    }
    row.update(overrides)
    return row


class _Conn:
    def __init__(self, fetchrow):
        self.calls: list[tuple[str, tuple]] = []
        self._fetchrow = fetchrow

    async def fetchrow(self, sql, *args):
        self.calls.append((sql, args))
        return self._fetchrow(sql, args)


class _Pool:
    def __init__(self, conn: _Conn):
        self.conn = conn
        self.acquires = 0

    def acquire(self):
        self.acquires += 1
        conn = self.conn

        class _Hold:
            async def __aenter__(self):
                return conn

            async def __aexit__(self, *_exc):
                return False

        return _Hold()


def _patch(monkeypatch, project, footprint_row):
    conn = _Conn(_transaction_fetchrow(project))
    footprint = _Conn(lambda _sql, _args: footprint_row)
    pool = _Pool(footprint)

    @asynccontextmanager
    async def _tx(_user_id):
        yield conn

    async def fake_analysis(_route, _row_width_ft):
        return JSONResponse(content={"changes": {}, "layer_releases": {}})

    def _calculate(_name, _changes):
        return {
            "results": {"provenance": {"inputs_id": "test"}},
            "calculator": {"package": "forge-calc"},
            "inputs_id": "test",
            "computed_at": NOW,
            "calc_error": None,
        }, None

    monkeypatch.setattr(scenarios_module.db_module, "forge_api_transaction", _tx)
    monkeypatch.setattr(scenarios_module.db_module, "get_db_pool", lambda: pool)
    monkeypatch.setattr(scenarios_module, "run_route_analysis", fake_analysis)
    monkeypatch.setattr(scenarios_module, "_calculate", _calculate)
    return conn, footprint, pool


def _transaction_fetchrow(project):
    def fetchrow(sql, args):
        low = " ".join(sql.lower().split())
        if low.startswith("select") and "from public.project" in low:
            return project
        if "source = 'paper'" in low:
            return {"is_paper": False}
        if "insert into public.scenario" in low:
            return _scenario_row(route=json.loads(args[10]))
        raise AssertionError(sql)

    return fetchrow


def _error(response) -> dict:
    return json.loads(response.body)["error"]


def _stored_route(conn: _Conn) -> dict:
    inserts = [
        args
        for sql, args in conn.calls
        if "insert into public.scenario" in " ".join(sql.lower().split())
    ]
    assert len(inserts) == 1
    return json.loads(inserts[0][10])


def _create(route: dict):
    return asyncio.run(
        scenarios_module.create_scenario(
            USER_ID,
            ScenarioCreate.model_validate(_scenario_body(route)),
        )
    )


def test_create_scenario_passes_footprint_flags(monkeypatch):
    first = _offset_north(SEND, 183)
    last = _offset_north(RECV, 183)
    conn, footprint, _pool = _patch(
        monkeypatch,
        _project_row(),
        {"sending_inside": True, "receiving_inside": True},
    )

    response = _create(_route(first, last))

    assert response.status_code == 201, response.body
    stored = _stored_route(conn)
    assert stored["coordinates"][0][0] == [SEND[0], SEND[1]]
    assert stored["coordinates"][-1][-1] == [RECV[0], RECV[1]]
    assert len(footprint.calls) == 1
    sql, args = footprint.calls[0]
    compact = " ".join(sql.lower().split())
    assert "st_covers" in compact
    assert "st_transform" in compact
    assert "st_setsrid" in compact
    assert "st_makepoint" in compact
    assert "4326" in compact
    assert "5070" in compact
    assert "polygon" in compact
    assert "multipolygon" in compact
    assert first[0] in args and first[1] in args
    assert last[0] in args and last[1] in args
    assert SEND_GID in args and RECV_GID in args
    # One statement, not two round trips.
    assert len(footprint.calls) == 1


def test_deleted_substation_falls_back_to_100m(monkeypatch):
    conn, footprint, _pool = _patch(monkeypatch, _project_row(), None)

    near = _create(_route(_offset_north(SEND, 30), _offset_north(RECV, -30)))
    assert near.status_code == 201, near.body
    stored = _stored_route(conn)
    assert stored["coordinates"][0][0] == [SEND[0], SEND[1]]
    assert stored["coordinates"][-1][-1] == [RECV[0], RECV[1]]

    far = _create(_route(_offset_north(SEND, 183), RECV))
    assert far.status_code == 422
    assert _error(far)["code"] == "route_terminals_mismatch"
    assert "sending" in _error(far)["message"]
    assert footprint.calls
    assert all(
        "insert into public.scenario" not in " ".join(sql.lower().split())
        or json.loads(args[10])["coordinates"][0][0] == [SEND[0], SEND[1]]
        for sql, args in conn.calls
    )
    # The 183 m end was refused, so only the 30 m route was inserted.
    inserts = [
        args
        for sql, args in conn.calls
        if "insert into public.scenario" in " ".join(sql.lower().split())
    ]
    assert len(inserts) == 1


def test_point_terminal_never_queries_footprint(monkeypatch):
    conn, footprint, pool = _patch(
        monkeypatch,
        _project_row(sending_substation_gid=None, receiving_substation_gid=None),
        {"sending_inside": True, "receiving_inside": True},
    )

    def _refuse_pool():
        raise AssertionError("point terminals must not open a footprint read")

    monkeypatch.setattr(scenarios_module.db_module, "get_db_pool", _refuse_pool)

    response = _create(_route(SEND, RECV))

    assert response.status_code == 201, response.body
    stored = _stored_route(conn)
    assert stored["coordinates"][0][0] == [SEND[0], SEND[1]]
    selects = [
        sql
        for sql, _args in conn.calls
        if "from public.project" in " ".join(sql.lower().split())
    ]
    assert selects
    assert "sending_substation_gid" in selects[0].lower()
    assert "receiving_substation_gid" in selects[0].lower()
    assert pool.acquires == 0
    assert footprint.calls == []
    assert not any("ref.substations" in sql.lower() for sql, _args in conn.calls)
