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
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
import forge
import httpx
import pytest

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
        return user_id, {"Authorization": f"Bearer {token}"}

    yield _make

    for user_id in created:
        _delete_user(user_id)


LAREDO_FILE = "AEP_LRGV_Laredo_NewBuild.forge"


def _laredo_changes() -> dict:
    document = json.loads(Path(forge.get_scenarios_path(), LAREDO_FILE).read_text())
    return forge.diff_changes(document["inputs"])


def _create_payload(name: str = "Test scenario", changes: dict | None = None) -> dict:
    return {
        "name": name,
        "source": "manual",
        "defaults_id": forge.get_defaults_id(),
        "changes": changes if changes is not None else _laredo_changes(),
    }


# --- Tests ---------------------------------------------------------------------


def test_post_creates_scenario_with_results_and_provenance(client, make_user):
    _, headers = make_user("post")

    response = client.post("/api/scenarios", json=_create_payload(), headers=headers)

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
    _, headers = make_user("patch-recalc")
    created = client.post("/api/scenarios", json=_create_payload(), headers=headers).json()
    original_inputs_id = created["inputs_id"]

    new_changes = dict(created["changes"])
    new_changes["03_financing.financial.social_discount_rate"] = 0.05

    response = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "changes": new_changes},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["revision"] == created["revision"] + 1
    assert body["calc_error"] is None
    assert body["inputs_id"] != original_inputs_id
    assert body["changes"]["03_financing.financial.social_discount_rate"] == 0.05


def test_patch_name_only_keeps_results(client, make_user):
    _, headers = make_user("patch-name-only")
    created = client.post("/api/scenarios", json=_create_payload(), headers=headers).json()

    response = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "Renamed scenario"},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Renamed scenario"
    assert body["revision"] == created["revision"] + 1
    assert body["results"] == created["results"]
    assert body["inputs_id"] == created["inputs_id"]
    assert body["computed_at"] == created["computed_at"]


def test_delete_removes_the_row(client, make_user):
    _, headers = make_user("delete")
    created = client.post("/api/scenarios", json=_create_payload(), headers=headers).json()

    delete_response = client.delete(f"/api/scenarios/{created['id']}", headers=headers)
    assert delete_response.status_code == 204, delete_response.text

    second_delete = client.delete(f"/api/scenarios/{created['id']}", headers=headers)
    assert second_delete.status_code == 404
    assert second_delete.json()["error"]["code"] == "not_found"


def test_stale_revision_returns_409(client, make_user):
    """Two sequential PATCHes: the second reuses the first's old revision.

    This also exercises the compare-and-swap directly: the second PATCH's
    `UPDATE ... WHERE id = $9 AND revision = $10` matches zero rows (the
    first PATCH already advanced `revision`), which is how 409
    `stale_revision` is now detected (no separate SELECT-then-compare).
    """
    _, headers = make_user("stale-revision")
    created = client.post("/api/scenarios", json=_create_payload(), headers=headers).json()

    first = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "First rename"},
        headers=headers,
    )
    assert first.status_code == 200, first.text
    assert first.json()["revision"] == created["revision"] + 1

    stale = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "Second rename"},
        headers=headers,
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
    user_id, headers = make_user("concurrent-patch")
    created = client.post("/api/scenarios", json=_create_payload(), headers=headers).json()

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
    _, headers_a = make_user("owner")
    _, headers_b = make_user("other")
    created = client.post("/api/scenarios", json=_create_payload(), headers=headers_a).json()

    patch_response = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "Hijacked"},
        headers=headers_b,
    )
    assert patch_response.status_code == 403
    assert patch_response.json()["error"]["code"] == "not_owner"

    delete_response = client.delete(f"/api/scenarios/{created['id']}", headers=headers_b)
    assert delete_response.status_code == 403
    assert delete_response.json()["error"]["code"] == "not_owner"


def test_post_with_wrong_defaults_id_returns_409(client, make_user):
    _, headers = make_user("stale-defaults")
    payload = _create_payload()
    payload["defaults_id"] = "sha256:" + "0" * 64

    response = client.post("/api/scenarios", json=payload, headers=headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "stale_defaults"


def test_invalid_changes_return_422_with_path(client, make_user):
    _, headers = make_user("invalid-changes")
    bad_payload = _create_payload(
        changes={"01_project_technical_details.project.capacity_mw": "not-a-number"}
    )

    response = client.post("/api/scenarios", json=bad_payload, headers=headers)

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "invalid_changes"
    assert "01_project_technical_details.project.capacity_mw" in body["error"]["paths"]


def test_calculator_failure_stores_calc_error(client, make_user):
    """The deployed defaults alone (capacity_mw=0) make run_calculation raise;
    resolve_inputs still succeeds, so the row is saved with calc_error set."""
    _, headers = make_user("calc-failure")

    response = client.post("/api/scenarios", json=_create_payload(changes={}), headers=headers)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["results"] is None
    assert body["calculator"] is None
    assert body["inputs_id"] is None
    assert body["computed_at"] is None
    assert body["calc_error"]
    assert "capacity_mw" in body["calc_error"]


def test_results_in_request_body_are_ignored(client, make_user):
    _, headers = make_user("results-ignored")
    payload = _create_payload()
    payload["results"] = {"bogus": "injected"}

    created = client.post("/api/scenarios", json=payload, headers=headers).json()
    assert created["results"] != {"bogus": "injected"}
    assert created["results"]["provenance"]["inputs_id"] == created["inputs_id"]

    patch_response = client.patch(
        f"/api/scenarios/{created['id']}",
        json={"revision": created["revision"], "name": "Still real results", "results": {"bogus": "injected"}},
        headers=headers,
    )
    body = patch_response.json()
    assert body["results"] != {"bogus": "injected"}
    assert body["results"] == created["results"]
