"""Integration tests for the scenario CRUD routes against the local Supabase stack.

Skipped automatically if the local stack isn't reachable (e.g. CI without
`supabase start`), mirroring tests/integration/test_db.py. Test users are created
through the local GoTrue admin API (`/auth/v1/admin/users`, confirmed
immediately so no email round-trip is needed) and signed in through the
password grant (`/auth/v1/token?grant_type=password`) to get a real,
ES256-signed access token — the same kind `app/auth.py` verifies in
production.

`app.main` is reloaded with real SUPABASE_URL/FORGE_DATABASE_URL env vars
so its module-level auth/db configuration (computed at import time) picks
up the local stack, instead of the auth-disabled config most other test
modules import it with.
"""

from __future__ import annotations

import asyncio
import importlib
import json
import os
import socket
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import anyio
import asyncpg
import forge
import httpx
import pytest
from fastapi.responses import JSONResponse

from app import scenarios as scenarios_module
from app.models import ScenarioUpdate

SUPABASE_URL = os.environ.get("SUPABASE_URL_TEST", "http://127.0.0.1:54321")
# Fixed local-dev demo keys printed by `supabase status`; not secrets.
SUPABASE_ANON_KEY = os.environ.get(
    "SUPABASE_ANON_KEY_TEST",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
)
SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY_TEST",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
)
FORGE_DATABASE_URL = os.environ.get(
    "FORGE_DATABASE_URL_TEST",
    "postgresql://forge_api:forge_api_local_dev_password@127.0.0.1:54322/postgres",
)
SUPERUSER_DATABASE_URL = os.environ.get(
    "SUPERUSER_DATABASE_URL_TEST",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
)


def _stack_is_reachable() -> bool:
    parsed = urlparse(SUPABASE_URL)
    try:
        with socket.create_connection((parsed.hostname, parsed.port), timeout=2):
            pass
    except OSError:
        return False
    try:
        asyncpg_dsn = urlparse(SUPERUSER_DATABASE_URL)
        with socket.create_connection((asyncpg_dsn.hostname, asyncpg_dsn.port), timeout=2):
            pass
    except OSError:
        return False
    return True


pytestmark = pytest.mark.skipif(
    not _stack_is_reachable(),
    reason="Local Supabase/Postgres stack is not reachable.",
)

# Safe to import unconditionally: app.main works fine with auth disabled
# (whatever conftest.py or an earlier test module left it as).
from fastapi.testclient import TestClient

import app.main as app_main_module

# --- Reload app.main against the real local stack --------------------------
#
# Other test modules import app.main with FORGE_AUTH_DISABLED=true (see
# conftest.py), binding its module-level config (read at import time, e.g.
# `require_auth`'s closure over `_SUPABASE_URL`/`_AUTH_DISABLED`) to the
# disabled state. `importlib.reload` re-executes app.main's top-level code
# in place — in the *same* module object other test files already hold a
# reference to — so this must happen only while this module's own tests run
# (a fixture, entered lazily at test-run time) and must be undone on
# teardown, never at import/collection time, or it would corrupt the
# `require_auth` any other already-collected test file's `TestClient` relies
# on for the rest of the session.
#
# TestClient is used as a context manager (see the `client` fixture below)
# so the FastAPI lifespan actually runs and creates the real asyncpg pool.


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


# --- Test user helpers -------------------------------------------------------


def _create_confirmed_user(email: str, password: str) -> str:
    """Create a user via the GoTrue admin API, pre-confirmed. Returns the user id."""
    response = httpx.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        json={"email": email, "password": password, "email_confirm": True},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["id"]


def _login(email: str, password: str) -> str:
    """Sign in via the password grant. Returns a real, ES256-signed access token."""
    response = httpx.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON_KEY},
        json={"email": email, "password": password},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def _delete_user(user_id: str) -> None:
    """Remove a test user (and, via cascade, its profile and scenario rows)."""
    import anyio

    async def _run() -> None:
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        try:
            await conn.execute("delete from auth.users where id = $1", uuid.UUID(user_id))
        finally:
            await conn.close()

    anyio.run(_run)


# --- Fixtures ----------------------------------------------------------------


# scenarios.py binds `from .route import run_route_analysis` and awaits that
# name. Patch the scenarios module, not app.route, or the real GIS call runs.
@pytest.fixture(autouse=True)
def _stub_route_analysis(monkeypatch):
    async def fake_analysis(_route, _row_width_ft):
        return JSONResponse(
            status_code=200,
            content={
                "changes": {},
                "layer_releases": {
                    "land_cover": "NLCD 2021",
                    "wetlands": "file dates 2026-10-09",
                },
            },
        )

    monkeypatch.setattr(scenarios_module, "run_route_analysis", fake_analysis)


@pytest.fixture
def client(_real_auth_app):
    with TestClient(app_main_module.app) as test_client:
        yield test_client


@pytest.fixture
def make_user(client):
    """Factory fixture: create a confirmed test user + bearer token, tracked for cleanup."""
    created: list[str] = []

    def _make(label: str) -> tuple[str, dict]:
        email = f"forge-task5-{label}-{uuid.uuid4().hex}@example.com"
        password = "testpassword123"
        user_id = _create_confirmed_user(email, password)
        token = _login(email, password)
        created.append(user_id)
        return user_id, token

    yield _make

    for user_id in created:
        _delete_user(user_id)


LAREDO_FILE = "AEP_LRGV_Laredo_NewBuild.forge"

# Austin–Dallas. Empty measured changes must not overwrite the request changes,
# and the stub must not invent protected-area acres.
ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[[-97.74, 30.27], [-96.80, 32.78]]],
}
ROW_WIDTH_FT = 100

ACRE_PATHS = (
    "02_project_physical_details.terrain.protected_area_acres.forested",
    "02_project_physical_details.terrain.protected_area_acres.scrubbed_flat",
    "02_project_physical_details.terrain.protected_area_acres.desert_barren",
    "02_project_physical_details.terrain.protected_area_acres.rolling_hills",
    "02_project_physical_details.terrain.protected_area_acres.mountain",
)


def _laredo_changes() -> dict:
    document = json.loads(Path(forge.get_scenarios_path(), LAREDO_FILE).read_text())
    changes = forge.diff_changes(document["inputs"])
    changes.update({path: 0.0 for path in ACRE_PATHS})
    return changes


def _create_payload(name: str = "Test scenario", changes: dict | None = None) -> dict:
    return {
        "name": name,
        "source": "manual",
        "defaults_id": forge.get_defaults_id(),
        "changes": changes if changes is not None else _laredo_changes(),
        "route": ROUTE,
        "row_width_ft": ROW_WIDTH_FT,
    }


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_project(client, token: str, scenario: dict | None = None) -> dict:
    """Create a project whose terminals are the two ends of ``ROUTE``.

    ``token`` is the caller's access token. The first scenario is the base.
    """
    body = dict(scenario if scenario is not None else _create_payload())
    body.pop("project_id", None)
    body["route"] = ROUTE
    body["row_width_ft"] = ROW_WIDTH_FT
    response = client.post(
        "/api/projects",
        json={
            "nerc_regions": ["TRE"],
            "sending": {"point": [-97.74, 30.27]},
            "receiving": {"point": [-96.80, 32.78]},
            "scenario": body,
        },
        headers=_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _scenario_payload(project_id: str, **kwargs) -> dict:
    payload = _create_payload(**kwargs)
    payload["project_id"] = project_id
    return payload


def _set_created_at(scenario_id: str, when: datetime) -> None:
    import anyio

    async def _run() -> None:
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        try:
            await conn.execute(
                "update public.scenario set created_at = $2 where id = $1",
                uuid.UUID(scenario_id),
                when,
            )
        finally:
            await conn.close()

    anyio.run(_run)


def _project_base(project_id: str) -> str | None:
    import anyio

    async def _run():
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        try:
            return await conn.fetchval(
                "select base_scenario_id from public.project where id = $1",
                uuid.UUID(project_id),
            )
        finally:
            await conn.close()

    value = anyio.run(_run)
    return None if value is None else str(value)


# --- Tests ---------------------------------------------------------------------


def test_post_creates_scenario_with_results_and_provenance(client, make_user):
    _, token = make_user("post")
    made = _make_project(client, token)

    response = client.post(
        "/api/scenarios",
        json=_scenario_payload(made["project"]["id"]),
        headers=_headers(token),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Test scenario"
    assert body["source"] == "manual"
    assert body["revision"] == 1
    assert body["calc_error"] is None
    assert body["results"] is not None
    assert body["results"]["provenance"]["inputs_id"] == body["inputs_id"]
    assert body["calculator"]["package"] == "forge-calc"
    assert body["computed_at"] is not None


def test_patch_with_changes_recalculates_and_bumps_revision(client, make_user):
    _, token = make_user("patch-recalc")
    created = _make_project(client, token)["scenario"]
    original_inputs_id = created["inputs_id"]

    new_changes = dict(created["changes"])
    new_changes["03_financing.financial.social_discount_rate"] = 0.05

    response = client.patch(
        f"/api/scenarios/{created['id']}",
        json={
            "revision": created["revision"],
            "changes": new_changes,
            "route": ROUTE,
            "row_width_ft": ROW_WIDTH_FT,
        },
        headers=_headers(token),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["revision"] == created["revision"] + 1
    assert body["calc_error"] is None
    assert body["inputs_id"] != original_inputs_id
    assert body["changes"]["03_financing.financial.social_discount_rate"] == 0.05


def test_patch_name_only_keeps_results(client, make_user):
    _, token = make_user("patch-name-only")
    created = _make_project(client, token)["scenario"]

    response = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "Renamed scenario"},
        headers=_headers(token),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Renamed scenario"
    assert body["revision"] == created["revision"] + 1
    assert body["results"] == created["results"]
    assert body["inputs_id"] == created["inputs_id"]
    assert body["computed_at"] == created["computed_at"]


def test_delete_removes_the_row(client, make_user):
    _, token = make_user("delete")
    made = _make_project(client, token)
    created = client.post(
        "/api/scenarios",
        json=_scenario_payload(made["project"]["id"], name="Second sheet"),
        headers=_headers(token),
    ).json()

    delete_response = client.delete(
        f"/api/scenarios/{created['id']}", headers=_headers(token)
    )
    assert delete_response.status_code == 204, delete_response.text

    second_delete = client.delete(
        f"/api/scenarios/{created['id']}", headers=_headers(token)
    )
    assert second_delete.status_code == 404
    assert second_delete.json()["error"]["code"] == "not_found"


def test_stale_revision_returns_409(client, make_user):
    """Two sequential PATCHes: the second reuses the first's old revision.

    This also exercises the compare-and-swap directly: the second PATCH's
    `UPDATE ... WHERE id = $9 AND revision = $10` matches zero rows (the
    first PATCH already advanced `revision`), which is how 409
    `stale_revision` is now detected (no separate SELECT-then-compare).
    """
    _, token = make_user("stale-revision")
    created = _make_project(client, token)["scenario"]

    first = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "First rename"},
        headers=_headers(token),
    )
    assert first.status_code == 200, first.text
    assert first.json()["revision"] == created["revision"] + 1

    stale = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "Second rename"},
        headers=_headers(token),
    )

    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_revision"


def test_concurrent_patches_with_same_revision_only_one_succeeds(client, make_user):
    """The actual race the compare-and-swap fixes: two PATCHes that both read
    `revision = 1` and race to update must not both succeed (the old
    application-level `payload.revision != existing["revision"]` check read
    the same row in both requests and let both proceed, silently clobbering
    one).

    Calls `update_scenario` directly (bypassing HTTP) via the TestClient's
    own `anyio` portal (`client.portal.call`), so both coroutines run on the
    *same* event loop that owns the real asyncpg pool created at lifespan
    startup — `asyncio.gather`-ing them from a separately-driven loop (e.g.
    a plain `async def` test under pytest-anyio) raises "attached to a
    different loop", since asyncpg's pool is bound to the loop it was
    created on.
    """
    user_id, token = make_user("concurrent-patch")
    created = _make_project(client, token)["scenario"]

    payload_a = ScenarioUpdate(revision=created["revision"], name="Winner A")
    payload_b = ScenarioUpdate(revision=created["revision"], name="Winner B")

    async def _race():
        return await asyncio.gather(
            scenarios_module.update_scenario(user_id, created["id"], payload_a),
            scenarios_module.update_scenario(user_id, created["id"], payload_b),
        )

    response_a, response_b = client.portal.call(_race)

    statuses = sorted((response_a.status_code, response_b.status_code))
    assert statuses == [200, 409], (response_a.body, response_b.body)

    winner = response_a if response_a.status_code == 200 else response_b
    loser = response_b if response_a.status_code == 200 else response_a
    assert json.loads(winner.body)["revision"] == created["revision"] + 1
    assert json.loads(loser.body)["error"]["code"] == "stale_revision"


def test_another_users_row_returns_403(client, make_user):
    _, token_a = make_user("owner")
    _, token_b = make_user("other")
    created = _make_project(client, token_a)["scenario"]

    patch_response = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "Hijacked"},
        headers=_headers(token_b),
    )
    assert patch_response.status_code == 403
    assert patch_response.json()["error"]["code"] == "not_owner"

    delete_response = client.delete(
        f"/api/scenarios/{created['id']}", headers=_headers(token_b)
    )
    assert delete_response.status_code == 403
    assert delete_response.json()["error"]["code"] == "not_owner"


def test_post_with_wrong_defaults_id_returns_409(client, make_user):
    _, token = make_user("stale-defaults")
    made = _make_project(client, token)
    payload = _scenario_payload(made["project"]["id"])
    payload["defaults_id"] = "sha256:" + "0" * 64

    response = client.post("/api/scenarios", json=payload, headers=_headers(token))

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "stale_defaults"


def test_invalid_changes_return_422_with_path(client, make_user):
    _, token = make_user("invalid-changes")
    made = _make_project(client, token)
    bad_payload = _scenario_payload(
        made["project"]["id"],
        changes={"01_project_technical_details.project.capacity_mw": "not-a-number"},
    )

    response = client.post("/api/scenarios", json=bad_payload, headers=_headers(token))

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "invalid_changes"
    assert "01_project_technical_details.project.capacity_mw" in body["error"]["paths"]


def test_calculator_failure_stores_calc_error(client, make_user, monkeypatch):
    """Valid inputs whose calculation raises are saved with calc_error set.

    Required-input checks now refuse incomplete changes before the calculator
    runs (422), so the failure is forced inside run_calculation itself.
    """
    from forge.errors import CalculationError

    def failing_run(*_args, **_kwargs):
        raise CalculationError("forced failure for the calc_error path")

    monkeypatch.setattr(scenarios_module.forge, "run_calculation", failing_run)
    _, token = make_user("calc-failure")
    made = _make_project(client, token)

    response = client.post(
        "/api/scenarios",
        json=_scenario_payload(made["project"]["id"]),
        headers=_headers(token),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["results"] is None
    assert body["calculator"] is None
    assert body["inputs_id"] is None
    assert body["computed_at"] is None
    assert "forced failure for the calc_error path" in body["calc_error"]


def test_missing_protected_area_acres_are_rejected(client, make_user):
    _, token = make_user("missing-acres")
    made = _make_project(client, token)
    response = client.post(
        "/api/scenarios",
        json=_scenario_payload(made["project"]["id"], changes={}),
        headers=_headers(token),
    )
    assert response.status_code == 422
    message = response.json()["error"]["message"]
    assert message.startswith("protected_area_acres are required. Missing: ")
    for path in ACRE_PATHS:
        assert path in message


def test_results_in_request_body_are_ignored(client, make_user):
    _, token = make_user("results-ignored")
    made = _make_project(client, token)
    payload = _scenario_payload(made["project"]["id"])
    payload["results"] = {"bogus": "injected"}

    created = client.post("/api/scenarios", json=payload, headers=_headers(token)).json()
    assert created["results"] != {"bogus": "injected"}
    assert created["results"]["provenance"]["inputs_id"] == created["inputs_id"]

    patch_response = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "Still real results", "results": {"bogus": "injected"}},
        headers=_headers(token),
    )
    body = patch_response.json()
    assert body["results"] != {"bogus": "injected"}
    assert body["results"] == created["results"]


def test_post_without_project_is_422(client, make_user):
    _, token = make_user("no-project")
    response = client.post(
        "/api/scenarios", json=_create_payload(), headers=_headers(token)
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_changes"
    assert response.json()["error"]["message"] == "project_id is required"


def test_post_into_another_users_project_is_403(client, make_user):
    _, owner = make_user("sheet-owner")
    _, other = make_user("sheet-other")
    made = _make_project(client, owner)
    response = client.post(
        "/api/scenarios",
        json=_scenario_payload(made["project"]["id"]),
        headers=_headers(other),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_owner"


def test_patch_route_off_terminal_is_422(client, make_user):
    _, token = make_user("off-terminal")
    created = _make_project(client, token)["scenario"]
    response = client.patch(
        f"/api/scenarios/{created['id']}",
        json={
            "revision": created["revision"],
            "route": {
                "type": "MultiLineString",
                "coordinates": [[[-80.0, 25.0], [-81.0, 26.0]]],
            },
        },
        headers=_headers(token),
    )
    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "route_terminals_mismatch"
    assert body["message"].startswith("The route's sending end is")


def test_delete_last_scenario_is_409(client, make_user):
    _, token = make_user("last-scenario")
    made = _make_project(client, token)
    scenario = made["scenario"]
    response = client.delete(
        f"/api/scenarios/{scenario['id']}", headers=_headers(token)
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "last_scenario"
    renamed = client.patch(
        f"/api/scenarios/{scenario['id']}",
        json={"revision": scenario["revision"], "name": "Still here"},
        headers=_headers(token),
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Still here"


def test_delete_base_promotes_oldest(client, make_user):
    """Oldest remaining scenario, by created_at then id, becomes the base."""
    _, token = make_user("promote-base")
    made = _make_project(client, token, scenario=_create_payload(name="Base"))
    project_id = made["project"]["id"]
    base_id = made["scenario"]["id"]
    headers = _headers(token)

    def _add(name: str) -> str:
        response = client.post(
            "/api/scenarios",
            json=_scenario_payload(project_id, name=name),
            headers=headers,
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    middle_id = _add("Middle")
    newest_id = _add("Newest")
    start = datetime(2020, 1, 1, tzinfo=UTC)
    _set_created_at(base_id, start)
    _set_created_at(middle_id, start + timedelta(days=1))
    _set_created_at(newest_id, start + timedelta(days=2))

    kept = client.delete(f"/api/scenarios/{newest_id}", headers=headers)
    assert kept.status_code == 204, kept.text
    assert _project_base(project_id) == base_id

    promoted = client.delete(f"/api/scenarios/{base_id}", headers=headers)
    assert promoted.status_code == 204, promoted.text
    assert _project_base(project_id) == middle_id

    tied = _make_project(client, token, scenario=_create_payload(name="Tied base"))
    tied_project = tied["project"]["id"]
    tied_base = tied["scenario"]["id"]
    left_id = _add_to(client, token, tied_project, "Left")
    right_id = _add_to(client, token, tied_project, "Right")
    same = datetime(2021, 6, 1, tzinfo=UTC)
    _set_created_at(left_id, same)
    _set_created_at(right_id, same)
    _set_created_at(tied_base, same + timedelta(days=1))
    removed = client.delete(f"/api/scenarios/{tied_base}", headers=headers)
    assert removed.status_code == 204, removed.text
    assert _project_base(tied_project) == str(min(uuid.UUID(left_id), uuid.UUID(right_id)))


def _add_to(client, token: str, project_id: str, name: str) -> str:
    response = client.post(
        "/api/scenarios",
        json=_scenario_payload(project_id, name=name),
        headers=_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_duplicate_names_with_counter_within_project(client, make_user):
    _, token = make_user("dup-sheet")
    _, other = make_user("dup-sheet-other")
    made = _make_project(client, token, scenario=_create_payload(name="Line"))
    source = made["scenario"]
    headers = _headers(token)

    first = client.post(f"/api/scenarios/{source['id']}/duplicate", headers=headers)
    assert first.status_code == 201, first.text
    copied = first.json()
    assert copied["name"] == "Line (2)"
    assert copied["source"] == "manual"
    assert copied["results"] == source["results"]
    assert copied["project_id"] == made["project"]["id"]
    assert copied["id"] != source["id"]

    second = client.post(f"/api/scenarios/{source['id']}/duplicate", headers=headers)
    assert second.status_code == 201, second.text
    assert second.json()["name"] == "Line (3)"

    refused = client.post(
        f"/api/scenarios/{source['id']}/duplicate", headers=_headers(other)
    )
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "not_owner"


# Terminal regions. The project POST checks each terminal against ref.nerc_regions,
# so the local table needs a region over the test terminals (Austin and Dallas).
_TERMINAL_REGION_SQL = """
insert into ref.nerc_regions (code, name, geom)
values (
  'TRE', 'Texas RE',
  ST_Multi(ST_Transform(ST_MakeEnvelope(-100, 25, -94, 35, 4326), 5070))
)
"""


def _install_terminal_region() -> bool:
    """Cover the test terminals with one region, unless ref.nerc_regions is loaded.

    A loaded table is left alone; this run then depends on its shapes.
    """

    async def _run() -> bool:
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        try:
            if await conn.fetchval("select count(*) from ref.nerc_regions"):
                return False
            await conn.execute(_TERMINAL_REGION_SQL)
            return True
        finally:
            await conn.close()

    return anyio.run(_run)


def _remove_terminal_region() -> None:
    async def _run() -> None:
        conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
        try:
            await conn.execute("delete from ref.nerc_regions")
        finally:
            await conn.close()

    anyio.run(_run)


@pytest.fixture(scope="module", autouse=True)
def _terminal_region():
    installed = _install_terminal_region()
    try:
        yield
    finally:
        if installed:
            _remove_terminal_region()
