"""asyncpg connection pool for the `forge_api` role, plus per-user RLS impersonation.

The server never connects to Postgres as a superuser. All reads and writes
from the API go through `forge_api`, a role scoped by row-level security
policies (see `supabase/migrations/`). Those policies key off `auth.uid()`,
which Supabase's local/hosted Postgres resolves from the `request.jwt.claim.sub`
session setting. `forge_api_transaction()` sets that claim for the duration of
one transaction so `forge_api` can act "as" a specific user without ever
holding that user's actual JWT.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def init_db_pool(dsn: str | None = None) -> asyncpg.Pool:
    """Create the module-level asyncpg pool against `FORGE_DATABASE_URL`.

    Safe to call more than once (e.g. across test setup/teardown); returns
    the existing pool if one is already open.
    """
    global _pool
    if _pool is not None:
        return _pool

    dsn = dsn if dsn is not None else os.environ.get("FORGE_DATABASE_URL", "")
    if not dsn:
        raise RuntimeError(
            "FORGE_DATABASE_URL is not set; cannot create the forge_api connection pool."
        )

    _pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=10)
    logger.info("forge_api database pool created.")
    return _pool


def get_db_pool() -> asyncpg.Pool:
    """Return the already-initialized pool. Raises if `init_db_pool()` has not run."""
    if _pool is None:
        raise RuntimeError(
            "Database pool is not initialized; call init_db_pool() at startup first."
        )
    return _pool


async def close_db_pool() -> None:
    """Close the pool, if open. Safe to call even if it was never created."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("forge_api database pool closed.")


@asynccontextmanager
async def forge_api_transaction(user_id: str) -> AsyncIterator[asyncpg.Connection]:
    """Yield a connection acting as `user_id` for the duration of one transaction.

    Equivalent to `SET LOCAL request.jwt.claim.sub = '<user_id>'`, but issued
    through `set_config(..., true)` (the parameterized, transaction-scoped
    form) rather than string-formatted SQL, so a malformed or malicious
    `user_id` cannot break out of the setting. `auth.uid()` inside RLS
    policies then resolves to `user_id` for every statement run on the
    yielded connection, and the transaction commits on a clean exit or rolls
    back on any exception (via asyncpg's `Connection.transaction()`).

    Callers (Task 5's scenario routes) use this so `forge_api` writes land
    only in rows the RLS policies allow for that specific user.
    """
    pool = get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('request.jwt.claim.sub', $1, true)",
                str(user_id),
            )
            yield conn
