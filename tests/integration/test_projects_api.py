"""Integration tests for the project API against the local Supabase stack.

Fixtures match tests/integration/test_scenarios_api.py. This machine's
database has no ``ref.substations`` load, so the gid test installs two
point rows when that table is absent and removes them afterwards. Those
stand-in geometries are EPSG:5070, the same CRS as ``ref.substations.geom``,
so a footprint polygon can be inserted beside them.
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
                        geom public.geometry(Geometry, 5070) not null
                    )
                    """
                )
                await conn.execute("grant select on ref.substations to forge_api")
            await conn.execute(
                """
                insert into ref.substations (gid, name, geom)
                values
                    (
                        $1, 'Sending Test Sub',
                        ST_Transform(ST_SetSRID(ST_MakePoint($2, $3), 4326), 5070)
                    ),
                    (
                        $4, 'Receiving Test Sub',
                        ST_Transform(ST_SetSRID(ST_MakePoint($5, $6), 4326), 5070)
                    )
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


POLY_SEND_GID = 910011
POLY_RECV_GID = 910012
MISSING_GID = 910099


def _substations_present() -> bool:
    async def _run() -> bool:
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        try:
            return await conn.fetchval("select to_regclass('ref.substations')") is not None
        finally:
            await conn.close()

    return anyio.run(_run)


def _offset_north(point: tuple[float, float], delta_m: float) -> tuple[float, float]:
    return (point[0], point[1] + delta_m / 111_194.926)


def _install_footprint_polygons() -> None:
    """Two 800 m squares in EPSG:5070, centered on the test terminals."""

    async def _run() -> None:
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        try:
            await conn.execute(
                """
                insert into ref.substations (gid, name, geom)
                select gid, name, ST_MakeEnvelope(
                    ST_X(center) - 400,
                    ST_Y(center) - 400,
                    ST_X(center) + 400,
                    ST_Y(center) + 400,
                    5070
                )
                from (
                    values
                        ($1::int, 'Sending Footprint', $2::float8, $3::float8),
                        ($4::int, 'Receiving Footprint', $5::float8, $6::float8)
                ) as terminal(gid, name, lon, lat)
                cross join lateral (
                    select ST_Transform(
                        ST_SetSRID(ST_MakePoint(lon, lat), 4326), 5070
                    ) as center
                ) as projected
                on conflict (gid) do update
                    set name = excluded.name, geom = excluded.geom
                """,
                POLY_SEND_GID, SEND[0], SEND[1],
                POLY_RECV_GID, RECV[0], RECV[1],
            )
            await conn.execute("grant select on ref.substations to forge_api")
        finally:
            await conn.close()

    anyio.run(_run)


def _remove_footprint_polygons() -> None:
    async def _run() -> None:
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        try:
            await conn.execute(
                "delete from ref.substations where gid = any($1::int[])",
                [POLY_SEND_GID, POLY_RECV_GID],
            )
        finally:
            await conn.close()

    anyio.run(_run)


@pytest.fixture
def footprint_polygons(substation_pair):
    if not _substations_present():
        pytest.skip("ref.substations is absent")
    _install_footprint_polygons()
    try:
        yield
    finally:
        _remove_footprint_polygons()


def test_route_ending_inside_footprint_is_accepted_and_snapped(
    client, make_user, footprint_polygons
):
    send_end = _offset_north(SEND, 183)
    recv_end = _offset_north(RECV, 183)
    scenario = _create_payload()
    scenario["route"] = {
        "type": "MultiLineString",
        "coordinates": [[list(send_end), [-97.10, 31.50], list(recv_end)]],
    }
    _, headers = make_user("footprint-snap")

    response = client.post(
        "/api/projects",
        json={
            "sending": {"substation_gid": POLY_SEND_GID},
            "receiving": {"substation_gid": POLY_RECV_GID},
            "scenario": scenario,
        },
        headers=headers,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    route = body["scenario"]["route"]["coordinates"]
    sending = body["project"]["sending_point"]["coordinates"]
    receiving = body["project"]["receiving_point"]["coordinates"]
    assert route[0][0][0] == pytest.approx(sending[0], abs=1e-5)
    assert route[0][0][1] == pytest.approx(sending[1], abs=1e-5)
    assert route[-1][-1][0] == pytest.approx(receiving[0], abs=1e-5)
    assert route[-1][-1][1] == pytest.approx(receiving[1], abs=1e-5)
    assert abs(route[0][0][1] - send_end[1]) > 1e-4
    assert abs(route[-1][-1][1] - recv_end[1]) > 1e-4


def _first_lon(geojson: dict) -> float:
    coordinates = geojson["coordinates"]
    while isinstance(coordinates[0], list):
        coordinates = coordinates[0]
    return float(coordinates[0])


def test_footprint_endpoint_returns_polygon_and_null(
    client, make_user, footprint_polygons
):
    _, headers = make_user("footprint-get")

    polygon = client.get(f"/api/substations/{POLY_SEND_GID}/footprint", headers=headers)
    assert polygon.status_code == 200, polygon.text
    body = polygon.json()
    assert body["gid"] == POLY_SEND_GID
    assert body["footprint"]["type"] == "Polygon"
    assert abs(_first_lon(body["footprint"])) < 180

    missing = client.get(f"/api/substations/{MISSING_GID}/footprint", headers=headers)
    assert missing.status_code == 200, missing.text
    assert missing.json() == {"gid": MISSING_GID, "footprint": None}

    point = client.get(f"/api/substations/{SEND_GID}/footprint", headers=headers)
    assert point.status_code == 200, point.text
    assert point.json()["gid"] == SEND_GID
    assert point.json()["footprint"] is None

    malformed = client.get("/api/substations/not-a-gid/footprint", headers=headers)
    assert malformed.status_code == 404
    assert malformed.json()["error"]["code"] == "not_found"
