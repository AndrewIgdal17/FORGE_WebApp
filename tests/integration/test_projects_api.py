"""Integration tests for the project API against the local Supabase stack.

Fixtures match tests/integration/test_scenarios_api.py. This machine's
database has no ``ref.substations`` load, so the gid test installs two
point rows when that table is absent and removes them afterwards.
"""

from __future__ import annotations

import importlib
import os
import uuid

import anyio
import asyncpg
import pytest
from fastapi.responses import JSONResponse

from tests.integration.test_scenarios_api import (
    FORGE_DATABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_URL,
    SUPERUSER_DATABASE_URL,
    _create_confirmed_user,
    _create_payload,
    _delete_user,
    _login,
    _stack_is_reachable,
)

pytestmark = pytest.mark.skipif(
    not _stack_is_reachable(),
    reason="Local Supabase/Postgres stack is not reachable.",
)

from fastapi.testclient import TestClient

import app.main as app_main_module
from app import scenarios as scenarios_module

SEND_GID = 910001
RECV_GID = 910002
SEND = (-97.74, 30.27)
RECV = (-96.80, 32.78)


@pytest.fixture(scope="module", autouse=True)
def _real_auth_app():
    if not _stack_is_reachable():
        yield
        return

    original = {
        key: os.environ.get(key)
        for key in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "FORGE_DATABASE_URL", "FORGE_AUTH_DISABLED")
    }
    os.environ["SUPABASE_URL"] = SUPABASE_URL
    os.environ["SUPABASE_ANON_KEY"] = SUPABASE_ANON_KEY
    os.environ["FORGE_DATABASE_URL"] = FORGE_DATABASE_URL
    os.environ.pop("FORGE_AUTH_DISABLED", None)
    importlib.reload(app_main_module)
    try:
        yield
    finally:
        for key, value in original.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        importlib.reload(app_main_module)


@pytest.fixture(autouse=True)
def _stub_route_analysis(monkeypatch):
    async def fake_analysis(_route, _row_width_ft):
        return JSONResponse(
            status_code=200,
            content={"changes": {}, "layer_releases": {"land_cover": "NLCD 2021"}},
        )

    monkeypatch.setattr(scenarios_module, "run_route_analysis", fake_analysis)


@pytest.fixture
def client(_real_auth_app):
    with TestClient(app_main_module.app) as test_client:
        yield test_client


@pytest.fixture
def make_user(client):
    created: list[str] = []

    def _make(label: str) -> tuple[str, dict]:
        email = f"forge-project-{label}-{uuid.uuid4().hex}@example.com"
        password = "testpassword123"
        user_id = _create_confirmed_user(email, password)
        token = _login(email, password)
        created.append(user_id)
        return user_id, {"Authorization": f"Bearer {token}"}

    yield _make

    for user_id in created:
        _delete_user(user_id)


def _install_substations() -> dict:
    """Return two substation terminals, creating the table when this DB has none."""

    async def _run() -> dict:
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        created_table = False
        try:
            exists = await conn.fetchval("select to_regclass('ref.substations')")
            if exists is None:
                created_table = True
                await conn.execute(
                    """
                    create table ref.substations (
                        gid integer primary key,
                        name text not null,
                        geom public.geometry(Geometry, 4326) not null
                    )
                    """
                )
                await conn.execute("grant select on ref.substations to forge_api")
            await conn.execute(
                """
                insert into ref.substations (gid, name, geom)
                values
                    ($1, 'Sending Test Sub', ST_SetSRID(ST_MakePoint($2, $3), 4326)),
                    ($4, 'Receiving Test Sub', ST_SetSRID(ST_MakePoint($5, $6), 4326))
                on conflict (gid) do update
                    set name = excluded.name, geom = excluded.geom
                """,
                SEND_GID, SEND[0], SEND[1], RECV_GID, RECV[0], RECV[1],
            )
            await conn.execute("grant select on ref.substations to forge_api")
        finally:
            await conn.close()
        return {"created_table": created_table}

    return anyio.run(_run)


def _remove_substations(created_table: bool) -> None:
    async def _run() -> None:
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        try:
            if created_table:
                await conn.execute("drop table if exists ref.substations")
            else:
                await conn.execute(
                    "delete from ref.substations where gid = any($1::int[])",
                    [SEND_GID, RECV_GID],
                )
        finally:
            await conn.close()

    anyio.run(_run)


@pytest.fixture(scope="module")
def substation_pair():
    state = _install_substations()
    try:
        yield (
            {"gid": SEND_GID, "name": "Sending Test Sub", "lon": SEND[0], "lat": SEND[1]},
            {"gid": RECV_GID, "name": "Receiving Test Sub", "lon": RECV[0], "lat": RECV[1]},
        )
    finally:
        _remove_substations(state["created_table"])


def _project_body() -> dict:
    scenario = _create_payload()
    scenario["route"] = {
        "type": "MultiLineString",
        "coordinates": [[list(SEND), list(RECV)]],
    }
    return {
        "sending": {"substation_gid": SEND_GID},
        "receiving": {"substation_gid": RECV_GID},
        "scenario": scenario,
    }


def test_create_project_with_substation_gids(client, make_user, substation_pair):
    sending, receiving = substation_pair
    _, headers = make_user("gids")

    response = client.post("/api/projects", json=_project_body(), headers=headers)

    assert response.status_code == 201, response.text
    body = response.json()
    project = body["project"]
    scenario = body["scenario"]
    assert project["sending_substation_gid"] == sending["gid"]
    assert project["receiving_substation_gid"] == receiving["gid"]
    assert project["sending_name"] == sending["name"]
    assert project["receiving_name"] == receiving["name"]
    assert project["name"] == f"{sending['name']} → {receiving['name']}"
    assert project["base_scenario_id"] == scenario["id"]
    assert project["revision"] == 1
    assert scenario["calc_error"] is None
    assert scenario["results"] is not None
    assert project["sending_point"]["type"] == "Point"
    assert project["sending_point"]["coordinates"][0] == pytest.approx(sending["lon"])
    assert project["sending_point"]["coordinates"][1] == pytest.approx(sending["lat"])
    assert project["receiving_point"]["coordinates"][0] == pytest.approx(receiving["lon"])
    assert project["receiving_point"]["coordinates"][1] == pytest.approx(receiving["lat"])


def test_non_owner_patch_is_403(client, make_user, substation_pair):
    _, headers_owner = make_user("owner")
    _, headers_other = make_user("other")
    created = client.post("/api/projects", json=_project_body(), headers=headers_owner)
    assert created.status_code == 201, created.text
    project = created.json()["project"]

    response = client.patch(
        f"/api/projects/{project['id']}",
        json={"revision": project["revision"], "name": "Hijacked"},
        headers=headers_other,
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_owner"


def test_duplicate_by_another_user_owns_the_copies(client, make_user, substation_pair):
    owner_id, headers_owner = make_user("dup-owner")
    other_id, headers_other = make_user("dup-other")
    created = client.post("/api/projects", json=_project_body(), headers=headers_owner)
    assert created.status_code == 201, created.text
    original = created.json()

    response = client.post(
        f"/api/projects/{original['project']['id']}/duplicate",
        headers=headers_other,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["project"]["user_id"] == other_id
    assert body["project"]["user_id"] != owner_id
    assert body["project"]["name"] == f"{original['project']['name']} (copy)"
    assert body["project"]["id"] != original["project"]["id"]
    assert len(body["scenarios"]) == 1
    copied = body["scenarios"][0]
    assert copied["user_id"] == other_id
    assert copied["source"] == "manual"
    assert copied["id"] != original["scenario"]["id"]
    assert body["project"]["base_scenario_id"] == copied["id"]
    assert copied["results"] == original["scenario"]["results"]
    assert copied["defaults_id"] == original["scenario"]["defaults_id"]
    assert copied["calculator"] == original["scenario"]["calculator"]
