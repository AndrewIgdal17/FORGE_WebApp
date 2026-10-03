"""Smoke test for app.db against the local Supabase/Postgres stack.

Skipped automatically if the local stack isn't reachable (e.g. CI without
`supabase start`), so it never blocks the required app.auth test suite.
"""

from __future__ import annotations

import os

import asyncpg
import pytest

from app import db

FORGE_DATABASE_URL = os.environ.get(
    "FORGE_DATABASE_URL_TEST",
    "postgresql://forge_api:forge_api_local_dev_password@127.0.0.1:54322/postgres",
)
SUPERUSER_DATABASE_URL = os.environ.get(
    "SUPERUSER_DATABASE_URL_TEST",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
)


async def _stack_is_reachable() -> bool:
    try:
        conn = await asyncpg.connect(dsn=FORGE_DATABASE_URL, timeout=2)
    except Exception:
        return False
    await conn.close()
    return True


@pytest.fixture(autouse=True)
async def _require_local_stack():
    if not await _stack_is_reachable():
        pytest.skip("Local Supabase/Postgres stack is not reachable at FORGE_DATABASE_URL_TEST.")


@pytest.fixture
async def pool():
    await db.close_db_pool()  # in case another test left one open
    created = await db.init_db_pool(FORGE_DATABASE_URL)
    yield created
    await db.close_db_pool()


@pytest.mark.anyio
async def test_init_db_pool_connects(pool):
    async with pool.acquire() as conn:
        value = await conn.fetchval("select 1")
    assert value == 1


@pytest.fixture
async def real_user_id():
    """A real `auth.users` row, created/removed directly via the superuser
    connection (bypassing RLS), so forge_api's RLS-scoped INSERT policy
    (which requires `user_id` to reference an existing user) is satisfiable."""
    conn = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL)
    try:
        user_id = await conn.fetchval(
            "insert into auth.users (id, email) values (gen_random_uuid(), "
            "'forge-api-test-' || gen_random_uuid()::text || '@example.com') returning id"
        )
        yield str(user_id)
    finally:
        await conn.execute("delete from auth.users where id = $1", user_id)
        await conn.close()


@pytest.mark.anyio
async def test_forge_api_transaction_sets_rls_claim(pool, real_user_id):
    async with db.forge_api_transaction(real_user_id) as conn:
        claim = await conn.fetchval("select current_setting('request.jwt.claim.sub', true)")
        assert claim == real_user_id


@pytest.mark.anyio
async def test_forge_api_transaction_rolls_back_on_error(pool, real_user_id):
    with pytest.raises(RuntimeError):
        async with db.forge_api_transaction(real_user_id) as conn:
            await conn.execute(
                "insert into public.scenario (user_id, name, source, defaults_id, changes) "
                "values ($1, 'temp', 'manual', 'sha256:test', '{}'::jsonb)",
                real_user_id,
            )
            raise RuntimeError("force rollback")

    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "select count(*) from public.scenario where user_id = $1", real_user_id
        )
    assert count == 0


@pytest.fixture
def anyio_backend():
    return "asyncio"
