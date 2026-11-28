"""Project create, patch, and duplicate. The database is mocked.

These tests lock the write order: look up a substation gid, insert the
project, insert its first scenario, then set the base. A route that misses
a terminal inserts nothing.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

from fastapi.responses import JSONResponse

from app import projects as projects_module
from app import scenarios as scenarios_module
from app.models import ProjectCreate, ProjectUpdate, ScenarioCreate

USER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_USER = "44444444-4444-4444-4444-444444444444"
PROJECT_ID = UUID("22222222-2222-2222-2222-222222222222")
SCENARIO_ID = UUID("33333333-3333-3333-3333-333333333333")
OTHER_SCENARIO_ID = UUID("55555555-5555-5555-5555-555555555555")
OLD_PROJECT_ID = UUID("66666666-6666-6666-6666-666666666666")
OLD_FIRST_ID = UUID("77777777-7777-7777-7777-777777777777")
OLD_BASE_ID = UUID("88888888-8888-8888-8888-888888888888")
NEW_PROJECT_ID = UUID("99999999-9999-9999-9999-999999999999")
NEW_FIRST_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
NEW_BASE_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

SEND_GID = 101
RECV_GID = 202
SEND = (-97.74, 30.27)
RECV = (-96.80, 32.78)
SEND_NAME = "Sending Yard"
RECV_NAME = "Receiving Yard"
NOW = datetime(2026, 11, 26, tzinfo=UTC)

# Ends sit ~11 m off the terminals. A successful create snaps them back.
ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[
        [SEND[0], SEND[1] + 0.0001],
        [-97.10, 31.50],
        [RECV[0], RECV[1] + 0.0001],
    ]],
}
FAR_ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[[-80.0, 25.0], [-81.0, 26.0]]],
}
STORED_RESULTS = {"bcr": {"bcr_societal": 1.42}}


def _scenario_body(**overrides) -> dict:
    fields = {
        "name": "First sheet",
        "source": "wizard",
        "defaults_id": scenarios_module._DEFAULTS_ID,
        "changes": {"kept": True},
        "route": ROUTE,
        "row_width_ft": 100,
    }
    fields.update(overrides)
    return fields


def _project_row(**overrides) -> dict:
    row = {
        "id": PROJECT_ID,
        "user_id": UUID(USER_ID),
        "name": f"{SEND_NAME} → {RECV_NAME}",
        "sending_substation_gid": SEND_GID,
        "receiving_substation_gid": RECV_GID,
        "sending_name": SEND_NAME,
        "receiving_name": RECV_NAME,
        "sending_point": {"type": "Point", "coordinates": list(SEND)},
        "receiving_point": {"type": "Point", "coordinates": list(RECV)},
        "base_scenario_id": None,
        "nerc_regions": ["TRE"],
        "revision": 1,
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def _scenario_row(**overrides) -> dict:
    row = {
        "id": SCENARIO_ID,
        "user_id": UUID(USER_ID),
        "name": "First sheet",
        "source": "wizard",
        "defaults_id": scenarios_module._DEFAULTS_ID,
        "changes": "{}",
        "results": None,
        "calculator": None,
        "inputs_id": None,
        "computed_at": None,
        "calc_error": None,
        "revision": 1,
        "created_at": NOW,
        "updated_at": NOW,
        "route": None,
        "segments": None,
        "layer_releases": None,
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
        assert self._fetch is not None
        return self._fetch(sql, args)

    async def execute(self, sql, *args):
        self.calls.append((sql, args))
        return "DELETE 1"


def _patch_db(monkeypatch, conn: _Conn) -> list[str]:
    entered: list[str] = []

    @asynccontextmanager
    async def _tx(user_id):
        entered.append(user_id)
        yield conn

    monkeypatch.setattr(projects_module.db_module, "forge_api_transaction", _tx)
    return entered


def _patch_analysis(monkeypatch) -> list:
    calls: list[tuple] = []

    async def fake_analysis(route, row_width_ft):
        calls.append((route, row_width_ft))
        return JSONResponse(content={"changes": {}, "layer_releases": {}})

    monkeypatch.setattr(scenarios_module, "run_route_analysis", fake_analysis)
    return calls


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


def _kinds(conn: _Conn) -> list[str]:
    kinds: list[str] = []
    for sql, _args in conn.calls:
        low = " ".join(sql.lower().split())
        if "ref.substations" in low:
            kinds.append("lookup")
        elif "ref.nerc_regions" in low:
            kinds.append("region_check")
        elif low.startswith("insert into public.project"):
            kinds.append("insert_project")
        elif low.startswith("insert into public.scenario"):
            kinds.append("insert_scenario")
        elif low.startswith("update public.project") and "base_scenario_id" in low:
            kinds.append("set_base")
        elif low.startswith("select") and "from public.project" in low:
            kinds.append("select_project")
        elif "source = 'paper'" in low or 'source = "paper"' in low:
            kinds.append("paper")
        else:
            kinds.append(low[:40])
    return kinds


def _substation_fetchrow(sql, args):
    low = " ".join(sql.lower().split())
    if "ref.substations" in low:
        gid = args[0]
        if isinstance(gid, (list, tuple)):
            gid = gid[0]
        table = {
            SEND_GID: {"name": SEND_NAME, "lon": SEND[0], "lat": SEND[1]},
            RECV_GID: {"name": RECV_NAME, "lon": RECV[0], "lat": RECV[1]},
        }
        return table.get(gid)
    if low.startswith("insert into public.project"):
        return _project_row(
            user_id=args[0],
            name=args[1],
            sending_substation_gid=args[2],
            receiving_substation_gid=args[3],
            sending_name=args[4],
            receiving_name=args[5],
            sending_point={"type": "Point", "coordinates": [args[6], args[7]]},
            receiving_point={"type": "Point", "coordinates": [args[8], args[9]]},
        )
    if low.startswith("insert into public.scenario"):
        return _scenario_row(route=json.loads(args[10]) if args[10] else None)
    if low.startswith("update public.project"):
        return _project_row(base_scenario_id=args[0])
    raise AssertionError(f"unexpected SQL: {sql}")


def _patch_footprint_pool(monkeypatch) -> None:
    """Project create looks up footprints on the pool, which unit tests do not open.

    No row means both flags are false. The route in the gid test sits about
    11 m off the terminals, so the 100 m rule still snaps it.
    """

    class _Read:
        async def fetchrow(self, _sql, *_args):
            return None

        def acquire(self):
            return self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

    monkeypatch.setattr(scenarios_module.db_module, "get_db_pool", lambda: _Read())


def _regions_fetch(sending_m=0.0, sending_suggest=None, receiving_m=0.0, receiving_suggest=None):
    """Rows the terminal check returns: distance to the ticked regions, and a suggestion."""

    def fetch(sql, _args):
        assert "ref.nerc_regions" in sql
        return [
            {"end_name": "sending", "ticked_m": sending_m, "suggested_code": sending_suggest},
            {"end_name": "receiving", "ticked_m": receiving_m, "suggested_code": receiving_suggest},
        ]

    return fetch


def test_create_project_inserts_project_then_scenario_and_sets_base(monkeypatch):
    conn = _Conn(_substation_fetchrow, _regions_fetch())
    entered = _patch_db(monkeypatch, conn)
    analysis = _patch_analysis(monkeypatch)
    _patch_calc(monkeypatch)
    _patch_footprint_pool(monkeypatch)

    payload = ProjectCreate(
        sending={"substation_gid": SEND_GID},
        nerc_regions=["TRE"],
        receiving={"substation_gid": RECV_GID},
        scenario=ScenarioCreate(**_scenario_body()),
    )
    response = asyncio.run(projects_module.create_project(USER_ID, payload))

    assert response.status_code == 201, response.body
    assert _kinds(conn) == ["lookup", "lookup", "region_check", "insert_project", "insert_scenario", "set_base"]
    assert entered == [USER_ID, USER_ID, USER_ID]

    lookup_sql = conn.calls[0][0].lower()
    assert "ref.substations" in lookup_sql
    assert "st_transform" in lookup_sql
    assert "name" in lookup_sql

    _project_sql, project_args = conn.calls[3]
    assert project_args[2] == SEND_GID
    assert project_args[3] == RECV_GID
    assert project_args[4] == SEND_NAME
    assert project_args[5] == RECV_NAME
    assert project_args[1] == f"{SEND_NAME} → {RECV_NAME}"
    assert project_args[10] == ["TRE"]

    _scenario_sql, scenario_args = conn.calls[4]
    assert PROJECT_ID in scenario_args
    stored_route = json.loads(scenario_args[10])
    assert stored_route["coordinates"][0][0] == [SEND[0], SEND[1]]
    assert stored_route["coordinates"][-1][-1] == [RECV[0], RECV[1]]
    assert analysis[0][0].model_dump()["coordinates"][0][0] == [SEND[0], SEND[1]]

    _base_sql, base_args = conn.calls[5]
    assert base_args[0] == SCENARIO_ID
    assert base_args[1] == PROJECT_ID

    body = json.loads(response.body)
    assert body["project"]["base_scenario_id"] == str(SCENARIO_ID)
    assert body["scenario"]["id"] == str(SCENARIO_ID)
    assert set(body) == {"project", "scenario"}


def test_create_project_route_mismatch_returns_422_and_inserts_nothing(monkeypatch):
    conn = _Conn(_substation_fetchrow, _regions_fetch())
    entered = _patch_db(monkeypatch, conn)
    analysis = _patch_analysis(monkeypatch)
    _patch_calc(monkeypatch)

    payload = ProjectCreate(
        sending={"point": list(SEND)},
        nerc_regions=["TRE"],
        receiving={"point": list(RECV)},
        scenario=ScenarioCreate(**_scenario_body(route=FAR_ROUTE)),
    )
    response = asyncio.run(projects_module.create_project(USER_ID, payload))

    assert response.status_code == 422
    body = json.loads(response.body)
    assert body["error"]["code"] == "route_terminals_mismatch"
    assert "sending" in body["error"]["message"]
    assert not any(k.startswith("insert") for k in _kinds(conn))
    assert entered == [USER_ID]
    assert analysis == []


def test_create_project_two_point_terminals_names_points(monkeypatch):
    conn = _Conn(_substation_fetchrow, _regions_fetch())
    _patch_db(monkeypatch, conn)
    _patch_analysis(monkeypatch)
    _patch_calc(monkeypatch)

    payload = ProjectCreate(
        sending={"point": [-97.74, 30.27]},
        nerc_regions=["TRE"],
        receiving={"point": [-96.80, 32.78]},
        scenario=ScenarioCreate(**_scenario_body(route={
            "type": "MultiLineString",
            "coordinates": [[[-97.74, 30.27], [-96.80, 32.78]]],
        })),
    )
    response = asyncio.run(projects_module.create_project(USER_ID, payload))

    assert response.status_code == 201, response.body
    assert _kinds(conn) == ["region_check", "insert_project", "insert_scenario", "set_base"]
    _sql, args = conn.calls[1]
    assert args[2] is None
    assert args[3] is None
    assert args[4] == "Point at 30.2700, -97.7400"
    assert args[5] == "Point at 32.7800, -96.8000"
    assert args[1] == "Point at 30.2700, -97.7400 → Point at 32.7800, -96.8000"
    body = json.loads(response.body)
    assert body["project"]["sending_name"] == "Point at 30.2700, -97.7400"
    assert body["project"]["receiving_name"] == "Point at 32.7800, -96.8000"


def _owned_project_fetchrow(is_paper: bool, base_found: bool):
    def fetchrow(sql, args):
        low = " ".join(sql.lower().split())
        if "from public.project" in low and not low.startswith("update"):
            return _project_row()
        if "paper" in low:
            return {"is_paper": is_paper}
        if "from public.scenario" in low:
            if base_found:
                return {"id": args[0]}
            return None
        if low.startswith("update"):
            return _project_row(name=args[0], revision=2)
        raise AssertionError(f"unexpected SQL: {sql}")

    return fetchrow


def test_patch_base_from_other_project_is_422(monkeypatch):
    conn = _Conn(_owned_project_fetchrow(is_paper=False, base_found=False))
    _patch_db(monkeypatch, conn)

    response = asyncio.run(
        projects_module.update_project(
            USER_ID,
            str(PROJECT_ID),
            ProjectUpdate(revision=1, base_scenario_id=str(OTHER_SCENARIO_ID)),
        )
    )

    assert response.status_code == 422
    assert json.loads(response.body)["error"]["code"] == "invalid_changes"
    assert not any(sql.lower().lstrip().startswith("update") for sql, _args in conn.calls)


def test_paper_project_patch_is_403_read_only(monkeypatch):
    conn = _Conn(_owned_project_fetchrow(is_paper=True, base_found=True))
    _patch_db(monkeypatch, conn)

    response = asyncio.run(
        projects_module.update_project(
            USER_ID,
            str(PROJECT_ID),
            ProjectUpdate(revision=1, name="Renamed"),
        )
    )

    assert response.status_code == 403
    body = json.loads(response.body)
    assert body["error"]["code"] == "read_only"
    assert "message" in body["error"]
    assert not any(sql.lower().lstrip().startswith("update") for sql, _args in conn.calls)


def test_duplicate_remaps_base_and_sets_manual_source(monkeypatch):
    new_scenario_ids = [NEW_FIRST_ID, NEW_BASE_ID]
    inserted: list[UUID] = []

    def fetchrow(sql, args):
        low = " ".join(sql.lower().split())
        if low.startswith("insert into public.project"):
            return _project_row(
                id=NEW_PROJECT_ID,
                user_id=args[0],
                name=args[1],
                base_scenario_id=None,
            )
        if low.startswith("insert into public.scenario"):
            new_id = new_scenario_ids[len(inserted)]
            inserted.append(new_id)
            source = "manual" if "'manual'" in sql else "paper"
            return _scenario_row(
                id=new_id,
                user_id=args[0],
                source=source,
                results=json.dumps(STORED_RESULTS),
                project_id=args[1],
            )
        if low.startswith("update public.project"):
            return _project_row(
                id=NEW_PROJECT_ID,
                user_id=UUID(USER_ID),
                name="Line (copy)",
                base_scenario_id=args[0],
            )
        raise AssertionError(f"unexpected SQL: {sql}")

    def fetch(sql, args):
        low = " ".join(sql.lower().split())
        if "from public.project" in low:
            return [_project_row(
                id=OLD_PROJECT_ID,
                user_id=UUID(OTHER_USER),
                name="Line",
                base_scenario_id=OLD_BASE_ID,
            )]
        if "from public.scenario" in low:
            return [
                {"id": OLD_FIRST_ID, "source": "paper"},
                {"id": OLD_BASE_ID, "source": "paper"},
            ]
        raise AssertionError(f"unexpected SQL: {sql}")

    # The project row is one record, not a list. fetchrow serves it.
    def fetchrow_with_select(sql, args):
        low = " ".join(sql.lower().split())
        if "from public.project" in low and low.startswith("select"):
            return _project_row(
                id=OLD_PROJECT_ID,
                user_id=UUID(OTHER_USER),
                name="Line",
                base_scenario_id=OLD_BASE_ID,
            )
        return fetchrow(sql, args)

    conn = _Conn(fetchrow_with_select, fetch)
    _patch_db(monkeypatch, conn)

    def _forbid_calc(*_args, **_kwargs):
        raise AssertionError("duplicate must not calculate")

    monkeypatch.setattr(scenarios_module, "_calculate", _forbid_calc)

    response = asyncio.run(
        projects_module.duplicate_project(USER_ID, str(OLD_PROJECT_ID))
    )

    assert response.status_code == 201, response.body
    scenario_inserts = [
        (sql, args)
        for sql, args in conn.calls
        if sql.lower().lstrip().startswith("insert into public.scenario")
    ]
    assert len(scenario_inserts) == 2
    for sql, args in scenario_inserts:
        assert "'manual'" in sql
        assert "results" in sql.lower()
        assert "defaults_id" in sql.lower()
        assert "calculator" in sql.lower()
        assert args[0] == UUID(USER_ID)
    project_inserts = [
        sql for sql, _args in conn.calls
        if sql.lower().lstrip().startswith("insert into public.project")
    ]
    assert "nerc_regions" in project_inserts[0].lower()
    base_updates = [
        args
        for sql, args in conn.calls
        if sql.lower().lstrip().startswith("update public.project")
    ]
    assert base_updates[0][0] == NEW_BASE_ID
    assert OLD_BASE_ID not in base_updates[0]

    body = json.loads(response.body)
    assert body["project"]["name"] == "Line (copy)"
    assert body["project"]["user_id"] == USER_ID
    assert body["project"]["base_scenario_id"] == str(NEW_BASE_ID)
    assert [row["source"] for row in body["scenarios"]] == ["manual", "manual"]
    assert body["scenarios"][1]["id"] == str(NEW_BASE_ID)


def test_create_project_terminal_outside_regions_is_422_and_inserts_nothing(monkeypatch):
    conn = _Conn(_substation_fetchrow, _regions_fetch(sending_m=40_000.0, sending_suggest="MRO"))
    _patch_db(monkeypatch, conn)
    analysis = _patch_analysis(monkeypatch)
    _patch_calc(monkeypatch)

    payload = ProjectCreate(
        nerc_regions=["TRE"],
        sending={"substation_gid": SEND_GID},
        receiving={"substation_gid": RECV_GID},
        scenario=ScenarioCreate(**_scenario_body()),
    )
    response = asyncio.run(projects_module.create_project(USER_ID, payload))

    assert response.status_code == 422
    error = json.loads(response.body)["error"]
    assert error["code"] == "terminal_outside_regions"
    assert error["detail"] == {"end": "sending", "suggested_region": "MRO"}
    assert SEND_NAME in error["message"]
    assert not any(k.startswith("insert") for k in _kinds(conn))
    assert analysis == []


def test_create_project_rejects_an_unknown_region_before_any_query(monkeypatch):
    conn = _Conn(_substation_fetchrow, _regions_fetch())
    entered = _patch_db(monkeypatch, conn)

    payload = ProjectCreate(
        nerc_regions=["WECC", "FRCC"],
        sending={"point": list(SEND)},
        receiving={"point": list(RECV)},
        scenario=ScenarioCreate(**_scenario_body()),
    )
    response = asyncio.run(projects_module.create_project(USER_ID, payload))

    assert response.status_code == 422
    error = json.loads(response.body)["error"]
    assert error["code"] == "invalid_changes"
    assert "FRCC" in error["message"]
    assert conn.calls == []
    assert entered == []


def test_create_project_stores_regions_sorted_and_deduplicated(monkeypatch):
    conn = _Conn(_substation_fetchrow, _regions_fetch())
    _patch_db(monkeypatch, conn)
    _patch_analysis(monkeypatch)
    _patch_calc(monkeypatch)

    payload = ProjectCreate(
        nerc_regions=["SERC", "TRE", "SERC"],
        sending={"point": list(SEND)},
        receiving={"point": list(RECV)},
        scenario=ScenarioCreate(**_scenario_body()),
    )
    response = asyncio.run(projects_module.create_project(USER_ID, payload))

    assert response.status_code == 201, response.body
    _sql, args = conn.calls[1]
    assert args[10] == ["TRE", "SERC"]


def _patch_payload(**fields) -> ProjectUpdate:
    return ProjectUpdate(revision=1, **fields)


def test_patch_regions_recheck_the_stored_terminals_and_refuse_a_miss(monkeypatch):
    conn = _Conn(
        _owned_project_fetchrow(is_paper=False, base_found=True),
        _regions_fetch(receiving_m=40_000.0, receiving_suggest="MRO"),
    )
    _patch_db(monkeypatch, conn)

    response = asyncio.run(
        projects_module.update_project(
            USER_ID, str(PROJECT_ID), _patch_payload(nerc_regions=["WECC"])
        )
    )

    assert response.status_code == 422
    error = json.loads(response.body)["error"]
    assert error["code"] == "terminal_outside_regions"
    assert error["detail"] == {"end": "receiving", "suggested_region": "MRO"}
    assert not any(sql.lower().lstrip().startswith("update") for sql, _args in conn.calls)


def test_patch_regions_stores_sorted_codes_after_the_check(monkeypatch):
    conn = _Conn(_owned_project_fetchrow(is_paper=False, base_found=True), _regions_fetch())
    _patch_db(monkeypatch, conn)

    response = asyncio.run(
        projects_module.update_project(
            USER_ID, str(PROJECT_ID), _patch_payload(nerc_regions=["SERC", "TRE"])
        )
    )

    assert response.status_code == 200, response.body
    update_args = [
        args for sql, args in conn.calls if sql.lower().lstrip().startswith("update public.project")
    ][0]
    assert update_args[2] == ["TRE", "SERC"]


def test_patch_with_an_unknown_region_is_422(monkeypatch):
    conn = _Conn(_owned_project_fetchrow(is_paper=False, base_found=True), _regions_fetch())
    _patch_db(monkeypatch, conn)

    response = asyncio.run(
        projects_module.update_project(
            USER_ID, str(PROJECT_ID), _patch_payload(nerc_regions=["NOPE"])
        )
    )

    assert response.status_code == 422
    assert json.loads(response.body)["error"]["code"] == "invalid_changes"
    assert not any(sql.lower().lstrip().startswith("update") for sql, _args in conn.calls)
