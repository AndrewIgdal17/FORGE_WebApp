"""Scenario writes inside a project. The database is mocked.

POST requires an owned project. A route that misses a terminal is refused.
Deleting the base promotes the oldest remaining scenario in that same
transaction. Deleting the last scenario is refused. A duplicate stays in
the project and is named by ``generateScenarioName``.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

from fastapi.responses import JSONResponse

from app import scenarios as scenarios_module
from app.models import ScenarioCreate, ScenarioUpdate

USER_ID = "12121212-1212-1212-1212-121212121212"
OTHER_USER = "34343434-3434-3434-3434-343434343434"
PROJECT_ID = UUID("45454545-4545-4545-4545-454545454545")
SCENARIO_ID = UUID("56565656-5656-5656-5656-565656565656")
OLDER_ID = UUID("11111111-1111-1111-1111-111111111111")
NEWER_ID = UUID("99999999-9999-9999-9999-999999999999")
SEND = (-97.74, 30.27)
RECV = (-96.80, 32.78)
NOW = datetime(2026, 11, 26, tzinfo=UTC)
STORED_RESULTS = {"bcr": {"bcr_societal": 1.42}}
ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[list(SEND), [-97.10, 31.50], list(RECV)]],
}
FAR_ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[[-80.0, 25.0], [-81.0, 26.0]]],
}
REVERSED_ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[list(RECV), [-97.10, 31.50], list(SEND)]],
}


def _scenario_body(**overrides) -> dict:
    fields = {
        "name": "Line",
        "source": "manual",
        "defaults_id": scenarios_module._DEFAULTS_ID,
        "changes": {"kept": True},
        "route": ROUTE,
        "row_width_ft": 100,
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
        "changes": "{}",
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


def _patch_db(monkeypatch, conn: _Conn) -> list[str]:
    entered: list[str] = []

    @asynccontextmanager
    async def _tx(user_id):
        entered.append(user_id)
        yield conn

    monkeypatch.setattr(scenarios_module.db_module, "forge_api_transaction", _tx)
    return entered


def _patch_analysis(monkeypatch) -> None:
    async def fake_analysis(_route, _row_width_ft):
        return JSONResponse(content={"changes": {}, "layer_releases": {}})

    monkeypatch.setattr(scenarios_module, "run_route_analysis", fake_analysis)


def _patch_calc(monkeypatch) -> None:
    def _calculate(_name, _changes):
        return {
            "results": {"provenance": {"inputs_id": "test"}},
            "calculator": {"package": "forge-calc"},
            "inputs_id": "test",
            "computed_at": NOW,
            "calc_error": None,
        }, None

    monkeypatch.setattr(scenarios_module, "_calculate", _calculate)


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
        and not _is_paper(sql)
    )


def _inserts(conn: _Conn) -> list[tuple[str, tuple]]:
    return [
        (sql, args)
        for sql, args in conn.calls
        if "insert into public.scenario" in " ".join(sql.lower().split())
    ]


def _updates_project(conn: _Conn) -> list[tuple[str, tuple]]:
    return [
        (sql, args)
        for sql, args in conn.calls
        if "update public.project" in " ".join(sql.lower().split())
    ]


def _deletes(conn: _Conn) -> list[tuple[str, tuple]]:
    return [
        (sql, args)
        for sql, args in conn.calls
        if "delete from public.scenario" in " ".join(sql.lower().split())
    ]


def _error(response) -> dict:
    return json.loads(response.body)["error"]


def test_post_scenario_requires_owned_project(monkeypatch):
    _patch_analysis(monkeypatch)
    _patch_calc(monkeypatch)

    missing = _Conn(lambda _sql, _args: _scenario_row())
    _patch_db(monkeypatch, missing)
    response = asyncio.run(
        scenarios_module.create_scenario(
            USER_ID,
            ScenarioCreate.model_validate(_scenario_body(project_id=None)),
        )
    )
    assert response.status_code == 422
    assert _error(response) == {
        "code": "invalid_changes",
        "message": "project_id is required",
    }
    assert _inserts(missing) == []
    assert missing.calls == []

    def _other_owner(sql, _args):
        if _is_project_select(sql):
            return _project_row(user_id=UUID(OTHER_USER))
        if _is_paper(sql):
            return {"is_paper": False}
        raise AssertionError(sql)

    foreign = _Conn(_other_owner)
    _patch_db(monkeypatch, foreign)
    response = asyncio.run(
        scenarios_module.create_scenario(
            USER_ID,
            ScenarioCreate.model_validate(_scenario_body()),
        )
    )
    assert response.status_code == 403
    assert _error(response)["code"] == "not_owner"
    assert _inserts(foreign) == []

    def _paper(sql, _args):
        if _is_project_select(sql):
            return _project_row()
        if _is_paper(sql):
            return {"is_paper": True}
        raise AssertionError(sql)

    paper = _Conn(_paper)
    _patch_db(monkeypatch, paper)
    response = asyncio.run(
        scenarios_module.create_scenario(
            USER_ID,
            ScenarioCreate.model_validate(_scenario_body()),
        )
    )
    assert response.status_code == 403
    assert _error(response)["code"] == "read_only"
    assert _inserts(paper) == []

    def _owned(sql, args):
        if _is_project_select(sql):
            return _project_row()
        if _is_paper(sql):
            return {"is_paper": False}
        if "insert into public.scenario" in " ".join(sql.lower().split()):
            return _scenario_row(route=json.loads(args[10]))
        raise AssertionError(sql)

    owned = _Conn(_owned)
    _patch_db(monkeypatch, owned)
    response = asyncio.run(
        scenarios_module.create_scenario(
            USER_ID,
            ScenarioCreate.model_validate(_scenario_body(route=FAR_ROUTE)),
        )
    )
    assert response.status_code == 422
    assert _error(response)["code"] == "route_terminals_mismatch"
    assert "sending" in _error(response)["message"]
    assert _inserts(owned) == []

    response = asyncio.run(
        scenarios_module.create_scenario(
            USER_ID,
            ScenarioCreate.model_validate(_scenario_body()),
        )
    )
    assert response.status_code == 201, response.body
    inserted = _inserts(owned)
    assert len(inserted) == 1
    assert inserted[0][1][13] == PROJECT_ID
    stored_route = json.loads(inserted[0][1][10])
    assert stored_route["coordinates"][0][0] == [SEND[0], SEND[1]]
    assert stored_route["coordinates"][-1][-1] == [RECV[0], RECV[1]]


def test_patch_route_off_terminal_is_422(monkeypatch):
    def _fetchrow(sql, _args):
        low = " ".join(sql.lower().split())
        if low.startswith("update public.scenario"):
            return _scenario_row(name="Renamed", revision=2)
        if _is_scenario_select(sql):
            return _scenario_row()
        if _is_project_select(sql):
            return _project_row()
        if _is_paper(sql):
            return {"is_paper": False}
        raise AssertionError(sql)

    conn = _Conn(_fetchrow)
    _patch_db(monkeypatch, conn)
    _patch_analysis(monkeypatch)
    _patch_calc(monkeypatch)

    response = asyncio.run(
        scenarios_module.update_scenario(
            USER_ID,
            str(SCENARIO_ID),
            ScenarioUpdate(revision=1, route=FAR_ROUTE, segments=None),
        )
    )
    assert response.status_code == 422
    body = _error(response)
    assert body["code"] == "route_terminals_mismatch"
    assert body["message"].startswith("The route's sending end is")
    assert not any(
        "update public.scenario" in " ".join(sql.lower().split()) for sql, _args in conn.calls
    )

    reversed_response = asyncio.run(
        scenarios_module.update_scenario(
            USER_ID,
            str(SCENARIO_ID),
            ScenarioUpdate(revision=1, route=REVERSED_ROUTE),
        )
    )
    assert reversed_response.status_code == 422
    assert _error(reversed_response)["code"] == "route_terminals_mismatch"
    assert "sending" in _error(reversed_response)["message"]

    ignored = ScenarioUpdate.model_validate(
        {"revision": 1, "name": "Renamed", "project_id": str(OLDER_ID)}
    )
    assert "project_id" not in ignored.model_fields_set
    rename = asyncio.run(
        scenarios_module.update_scenario(USER_ID, str(SCENARIO_ID), ignored)
    )
    assert rename.status_code == 200
    update_sql = next(
        sql
        for sql, _args in conn.calls
        if "update public.scenario" in " ".join(sql.lower().split())
    )
    set_clause = update_sql.lower().split("returning", 1)[0]
    assert "project_id" not in set_clause


def test_delete_last_scenario_is_409(monkeypatch):
    def _fetchrow(sql, _args):
        if _is_scenario_select(sql):
            return _scenario_row()
        if _is_project_select(sql):
            return _project_row()
        if _is_paper(sql):
            return {"is_paper": False}
        raise AssertionError(sql)

    conn = _Conn(_fetchrow, fetch=lambda _sql, _args: [])
    entered = _patch_db(monkeypatch, conn)

    response = asyncio.run(scenarios_module.delete_scenario(USER_ID, str(SCENARIO_ID)))

    assert response.status_code == 409
    assert _error(response)["code"] == "last_scenario"
    assert _deletes(conn) == []
    assert _updates_project(conn) == []
    assert len(entered) == 1


def test_delete_base_promotes_oldest(monkeypatch):
    """Review focus: the oldest remaining scenario becomes the base before commit."""

    def _fetchrow(sql, _args):
        if _is_scenario_select(sql):
            return _scenario_row(id=SCENARIO_ID)
        if _is_project_select(sql):
            return _project_row(base_scenario_id=SCENARIO_ID)
        if _is_paper(sql):
            return {"is_paper": False}
        raise AssertionError(sql)

    def _fetch(sql, args):
        low = " ".join(sql.lower().split())
        assert "order by created_at, id" in low
        assert PROJECT_ID in args
        assert SCENARIO_ID in args
        return [{"id": OLDER_ID}, {"id": NEWER_ID}]

    conn = _Conn(_fetchrow, fetch=_fetch)
    entered = _patch_db(monkeypatch, conn)

    response = asyncio.run(scenarios_module.delete_scenario(USER_ID, str(SCENARIO_ID)))

    assert response.status_code == 204
    assert len(entered) == 1
    updates = _updates_project(conn)
    deletes = _deletes(conn)
    assert len(updates) == 1
    assert len(deletes) == 1
    assert updates[0][1][0] == OLDER_ID
    assert conn.calls.index(updates[0]) < conn.calls.index(deletes[0])

    def _fetchrow_other(sql, _args):
        if _is_scenario_select(sql):
            return _scenario_row(id=NEWER_ID)
        if _is_project_select(sql):
            return _project_row(base_scenario_id=OLDER_ID)
        if _is_paper(sql):
            return {"is_paper": False}
        raise AssertionError(sql)

    other = _Conn(
        _fetchrow_other,
        fetch=lambda sql, args: (
            [{"id": OLDER_ID}] if "order by created_at, id" in " ".join(sql.lower().split()) else []
        ),
    )
    entered_other = _patch_db(monkeypatch, other)
    response = asyncio.run(scenarios_module.delete_scenario(USER_ID, str(NEWER_ID)))
    assert response.status_code == 204
    assert _updates_project(other) == []
    assert len(_deletes(other)) == 1
    assert len(entered_other) == 1


def test_duplicate_names_with_counter_within_project(monkeypatch):
    def _forbid_calculate(_name, _changes):
        raise AssertionError("duplicate must copy stored results")

    monkeypatch.setattr(scenarios_module, "_calculate", _forbid_calculate)

    def _fetchrow(sql, args):
        low = " ".join(sql.lower().split())
        if _is_scenario_select(sql):
            return _scenario_row(name="Line", results=STORED_RESULTS)
        if _is_project_select(sql):
            return _project_row()
        if _is_paper(sql):
            return {"is_paper": False}
        if low.startswith("insert into public.scenario"):
            assert "'manual'" in sql
            assert args[1] == "Line (3)"
            return _scenario_row(name=args[1], source="manual", results=STORED_RESULTS)
        raise AssertionError(sql)

    def _fetch(sql, args):
        low = " ".join(sql.lower().split())
        assert "project_id" in low
        assert PROJECT_ID in args
        return [{"name": "Line"}, {"name": "Line (2)"}]

    conn = _Conn(_fetchrow, fetch=_fetch)
    _patch_db(monkeypatch, conn)

    response = asyncio.run(
        scenarios_module.duplicate_scenario(USER_ID, str(SCENARIO_ID))
    )

    assert response.status_code == 201
    body = json.loads(response.body)
    assert body["name"] == "Line (3)"
    assert body["source"] == "manual"
    assert body["results"] == STORED_RESULTS
    assert _inserts(conn)

    def _other(sql, _args):
        if _is_scenario_select(sql):
            return _scenario_row(user_id=UUID(OTHER_USER))
        raise AssertionError(sql)

    foreign = _Conn(_other)
    _patch_db(monkeypatch, foreign)
    refused = asyncio.run(
        scenarios_module.duplicate_scenario(USER_ID, str(SCENARIO_ID))
    )
    assert refused.status_code == 403
    assert _error(refused)["code"] == "not_owner"
    assert _inserts(foreign) == []
