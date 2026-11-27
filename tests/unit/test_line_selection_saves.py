"""Scenario saves with line selection. The database is mocked."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

from fastapi.responses import JSONResponse

from app import scenarios as scenarios_module
from app.layer_releases import CORRIDORS_RELEASE
from app.models import LineSelectionIn, ScenarioCreate, ScenarioUpdate

USER_ID = "12121212-1212-1212-1212-121212121212"
PROJECT_ID = UUID("45454545-4545-4545-4545-454545454545")
SCENARIO_ID = UUID("56565656-5656-5656-5656-565656565656")
SEND = (-97.74, 30.27)
RECV = (-96.80, 32.78)
NOW = datetime(2026, 11, 27, tzinfo=UTC)
STORED_RESULTS = {"bcr": {"bcr_societal": 1.42}}
PROJECT_TYPE = "01_project_technical_details.project.project_type"
ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[list(SEND), [-97.10, 31.50], list(RECV)]],
}
ASSEMBLED_ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[[SEND[0], SEND[1]], [-97.20, 31.00], [RECV[0], RECV[1]]]],
}
ASSEMBLY_CONNECTORS = [
    {
        "end": "sending",
        "length_m": 240.0,
        "coordinates": [[SEND[0], SEND[1]], [-97.72, 30.29]],
    }
]
LINE_SELECTION_IN = LineSelectionIn(gids=[101, 102], stretch_end=None)
STORED_LINE_SELECTION = {
    "gids": [101, 102],
    "stretch_end": None,
    "connectors": ASSEMBLY_CONNECTORS,
    "corridors_release": CORRIDORS_RELEASE,
}


def _changes(project_type: str, **extra) -> dict:
    base = {PROJECT_TYPE: project_type}
    base.update(extra)
    return base


def _scenario_body(**overrides) -> dict:
    fields = {
        "name": "Line",
        "source": "manual",
        "defaults_id": scenarios_module._DEFAULTS_ID,
        "changes": _changes("greenfield"),
        "route": ROUTE,
        "row_width_ft": 100.0,
        "project_id": str(PROJECT_ID),
    }
    fields.update(overrides)
    return fields


def _scenario_row(**overrides) -> dict:
    row = {
        "id": SCENARIO_ID,
        "user_id": UUID(USER_ID),
        "name": "Line",
        "source": "manual",
        "defaults_id": scenarios_module._DEFAULTS_ID,
        "changes": json.dumps(_changes("greenfield")),
        "results": STORED_RESULTS,
        "calculator": {"package": "forge-calc"},
        "inputs_id": "inputs",
        "computed_at": NOW,
        "calc_error": None,
        "revision": 1,
        "created_at": NOW,
        "updated_at": NOW,
        "route": ROUTE,
        "segments": None,
        "layer_releases": None,
        "project_id": PROJECT_ID,
        "line_selection": None,
    }
    row.update(overrides)
    return row


def _project_row(**overrides) -> dict:
    row = {
        "id": PROJECT_ID,
        "user_id": UUID(USER_ID),
        "base_scenario_id": SCENARIO_ID,
        "sending_lon": SEND[0],
        "sending_lat": SEND[1],
        "receiving_lon": RECV[0],
        "receiving_lat": RECV[1],
        "sending_substation_gid": 1,
        "receiving_substation_gid": 2,
    }
    row.update(overrides)
    return row


class _Conn:
    def __init__(self, fetchrow, fetch=None):
        self.calls: list[tuple[str, tuple]] = []
        self._fetchrow = fetchrow
        self._fetch = fetch

    async def fetchrow(self, sql, *args):
        self.calls.append((sql, args))
        return self._fetchrow(sql, args)

    async def fetch(self, sql, *args):
        self.calls.append((sql, args))
        assert self._fetch is not None, sql
        return self._fetch(sql, args)

    async def execute(self, sql, *args):
        self.calls.append((sql, args))
        return "OK"


def _patch_db(monkeypatch, conn: _Conn) -> None:
    @asynccontextmanager
    async def _tx(user_id):
        yield conn

    monkeypatch.setattr(scenarios_module.db_module, "forge_api_transaction", _tx)


def _patch_analysis(monkeypatch) -> None:
    async def fake_analysis(_route, _row_width_ft):
        return JSONResponse(content={"changes": {}, "layer_releases": {}})

    monkeypatch.setattr(scenarios_module, "run_route_analysis", fake_analysis)


def _patch_calc(monkeypatch) -> None:
    def _calculate(_name, _changes):
        return {
            "results": STORED_RESULTS,
            "calculator": {"package": "forge-calc"},
            "inputs_id": "test",
            "computed_at": NOW,
            "calc_error": None,
        }, None

    monkeypatch.setattr(scenarios_module, "_calculate", _calculate)


def _patch_footprint(monkeypatch) -> None:
    async def _footprint(_route, _terminals):
        return (False, False)

    monkeypatch.setattr(scenarios_module, "_inside_footprint", _footprint)


def _patch_assembly(monkeypatch, calls: list) -> None:
    async def _fake_assemble(user_id, terminals, selection):
        calls.append((user_id, terminals, selection))
        return {
            "route": ASSEMBLED_ROUTE,
            "connectors": ASSEMBLY_CONNECTORS,
            "corridors_release": CORRIDORS_RELEASE,
        }, None

    monkeypatch.setattr(scenarios_module, "_assemble_line_selection", _fake_assemble)


def _is_project_select(sql: str) -> bool:
    low = " ".join(sql.lower().split())
    return "from public.project" in low and low.startswith("select")


def _is_paper(sql: str) -> bool:
    low = " ".join(sql.lower().split())
    return "source = 'paper'" in low or 'source = "paper"' in low


def _is_scenario_select(sql: str) -> bool:
    low = " ".join(sql.lower().split())
    return (
        low.startswith("select")
        and "from public.scenario" in low
        and "insert" not in low
        and "source = 'paper'" not in low
        and "is_paper" not in low
    )


def _inserts(conn: _Conn) -> list[tuple[str, tuple]]:
    return [
        (sql, args)
        for sql, args in conn.calls
        if "insert into public.scenario" in " ".join(sql.lower().split())
    ]


def _updates(conn: _Conn) -> list[tuple[str, tuple]]:
    return [
        (sql, args)
        for sql, args in conn.calls
        if "update public.scenario" in " ".join(sql.lower().split())
    ]


def _error(response) -> dict:
    return json.loads(response.body)["error"]


def _owned_conn(monkeypatch):
    assembly_calls: list = []

    def _fetchrow(sql, args):
        low = " ".join(sql.lower().split())
        if _is_project_select(sql):
            return _project_row()
        if _is_paper(sql):
            return {"is_paper": False}
        if "insert into public.scenario" in low:
            line_sel = json.loads(args[14]) if len(args) > 14 and args[14] is not None else None
            route = json.loads(args[10]) if args[10] is not None else None
            return _scenario_row(route=route, line_selection=line_sel)
        if low.startswith("update public.scenario"):
            return _scenario_row(name="Renamed", revision=2)
        if _is_scenario_select(sql):
            return _scenario_row(
                changes=json.dumps(_changes("reconductoring")),
                line_selection=json.dumps(STORED_LINE_SELECTION),
            )
        raise AssertionError(sql)

    conn = _Conn(_fetchrow)
    _patch_db(monkeypatch, conn)
    _patch_analysis(monkeypatch)
    _patch_calc(monkeypatch)
    _patch_footprint(monkeypatch)
    _patch_assembly(monkeypatch, assembly_calls)
    return conn, assembly_calls


def test_create_reconductoring_without_selection_is_422(monkeypatch):
    conn, assembly_calls = _owned_conn(monkeypatch)

    response = asyncio.run(
        scenarios_module.create_scenario(
            USER_ID,
            ScenarioCreate.model_validate(
                _scenario_body(changes=_changes("reconductoring"), route=None)
            ),
        )
    )

    assert response.status_code == 422
    assert _error(response)["code"] == "line_selection_required"
    assert _inserts(conn) == []
    assert assembly_calls == []


def test_create_with_selection_uses_assembly(monkeypatch):
    conn, assembly_calls = _owned_conn(monkeypatch)

    response = asyncio.run(
        scenarios_module.create_scenario(
            USER_ID,
            ScenarioCreate.model_validate(
                _scenario_body(
                    changes=_changes("reconductoring"),
                    line_selection=LINE_SELECTION_IN,
                    route=ROUTE,
                )
            ),
        )
    )

    assert response.status_code == 201, response.body
    assert len(assembly_calls) == 1
    inserted = _inserts(conn)
    assert len(inserted) == 1
    args = inserted[0][1]
    stored_selection = json.loads(args[14])
    assert stored_selection["gids"] == [101, 102]
    assert stored_selection["connectors"] == ASSEMBLY_CONNECTORS
    assert stored_selection["corridors_release"] == CORRIDORS_RELEASE
    stored_route = json.loads(args[10])
    assert stored_route == ASSEMBLED_ROUTE
    layer_releases = json.loads(args[12])
    assert layer_releases.get("corridors") == CORRIDORS_RELEASE
    assert args[13] == PROJECT_ID


def test_update_rename_only_skips_assembly(monkeypatch):
    conn, assembly_calls = _owned_conn(monkeypatch)

    response = asyncio.run(
        scenarios_module.update_scenario(
            USER_ID,
            str(SCENARIO_ID),
            ScenarioUpdate(revision=1, name="Renamed"),
        )
    )

    assert response.status_code == 200
    assert assembly_calls == []
    assert len(_updates(conn)) == 1


def test_switch_to_greenfield_without_route_is_422(monkeypatch):
    conn, assembly_calls = _owned_conn(monkeypatch)

    response = asyncio.run(
        scenarios_module.update_scenario(
            USER_ID,
            str(SCENARIO_ID),
            ScenarioUpdate(
                revision=1,
                changes=_changes("greenfield"),
            ),
        )
    )

    assert response.status_code == 422
    assert _error(response)["code"] == "invalid_changes"
    assert assembly_calls == []
    assert _updates(conn) == []


def test_switch_to_greenfield_with_route_clears_selection(monkeypatch):
    conn, assembly_calls = _owned_conn(monkeypatch)

    response = asyncio.run(
        scenarios_module.update_scenario(
            USER_ID,
            str(SCENARIO_ID),
            ScenarioUpdate(
                revision=1,
                changes=_changes("greenfield"),
                route=ROUTE,
                row_width_ft=100.0,
            ),
        )
    )

    assert response.status_code == 200, response.body
    assert assembly_calls == []
    update_sql, args = _updates(conn)[0]
    assert "line_selection" in update_sql.lower()
    # explicit null stored for line_selection in update params
    assert None in args or "null" in update_sql.lower()


def test_greenfield_with_selection_is_not_allowed(monkeypatch):
    assembly_calls: list = []

    def _fetchrow(sql, args):
        low = " ".join(sql.lower().split())
        if _is_scenario_select(sql):
            return _scenario_row(changes=json.dumps(_changes("greenfield")))
        if _is_project_select(sql):
            return _project_row()
        if _is_paper(sql):
            return {"is_paper": False}
        raise AssertionError(sql)

    conn = _Conn(_fetchrow)
    _patch_db(monkeypatch, conn)
    _patch_analysis(monkeypatch)
    _patch_calc(monkeypatch)
    _patch_footprint(monkeypatch)
    _patch_assembly(monkeypatch, assembly_calls)

    response = asyncio.run(
        scenarios_module.update_scenario(
            USER_ID,
            str(SCENARIO_ID),
            ScenarioUpdate(
                revision=1,
                line_selection=LINE_SELECTION_IN,
            ),
        )
    )

    assert response.status_code == 422
    assert _error(response)["code"] == "line_selection_not_allowed"
    assert assembly_calls == []


def test_duplicate_copies_line_selection(monkeypatch):
    assembly_calls: list = []

    def _fetchrow(sql, args):
        low = " ".join(sql.lower().split())
        if _is_scenario_select(sql):
            return _scenario_row(
                line_selection=json.dumps(STORED_LINE_SELECTION),
                results=STORED_RESULTS,
            )
        if _is_project_select(sql):
            return _project_row()
        if _is_paper(sql):
            return {"is_paper": False}
        if low.startswith("insert into public.scenario") and "select" in low:
            assert "line_selection" in low
            return _scenario_row(
                line_selection=STORED_LINE_SELECTION,
                results=STORED_RESULTS,
            )
        raise AssertionError(sql)

    def _fetch(sql, args):
        assert "project_id" in " ".join(sql.lower().split())
        return [{"name": "Line"}]

    conn = _Conn(_fetchrow, fetch=_fetch)
    _patch_db(monkeypatch, conn)
    _patch_assembly(monkeypatch, assembly_calls)

    response = asyncio.run(
        scenarios_module.duplicate_scenario(USER_ID, str(SCENARIO_ID))
    )

    assert response.status_code == 201
    body = json.loads(response.body)
    assert body.get("line_selection") == STORED_LINE_SELECTION
    dup_sql = next(
        sql for sql, _ in conn.calls if "insert into public.scenario" in " ".join(sql.lower().split())
    )
    assert "line_selection" in dup_sql.lower()