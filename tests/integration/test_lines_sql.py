"""Run the line-assembly SQL against the local Postgres, not a mock.

The unit tests in tests/unit/test_lines_api.py mock the database, so they
cannot catch Postgres refusing a query (for example an untyped NULL
parameter). Skipped when the local stack is not reachable.
"""

from __future__ import annotations

import os

import asyncpg
import pytest

from app import lines

SUPERUSER_DATABASE_URL = os.environ.get(
    "SUPERUSER_DATABASE_URL_TEST",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def conn():
    try:
        connection = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL, timeout=2)
    except Exception:  # noqa: BLE001 — any connect failure means the local stack is down
        pytest.skip("Local Postgres is not reachable.")
    yield connection
    await connection.close()


@pytest.mark.anyio
async def test_transform_terminals_without_a_stretch_end(conn):
    row = await conn.fetchrow(
        lines._TRANSFORM_TERMINALS_SQL, -79.2, 37.4, -79.0, 37.5, None, None
    )
    assert row["send_x"] is not None and row["recv_y"] is not None
    assert row["stretch_x"] is None and row["stretch_y"] is None


@pytest.mark.anyio
async def test_transform_terminals_with_a_stretch_end(conn):
    row = await conn.fetchrow(
        lines._TRANSFORM_TERMINALS_SQL, -79.2, 37.4, -79.0, 37.5, -79.1, 37.45
    )
    assert row["stretch_x"] is not None and row["stretch_y"] is not None
