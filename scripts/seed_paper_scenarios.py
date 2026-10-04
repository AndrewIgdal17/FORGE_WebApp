#!/usr/bin/env python3
"""Seed the eight FORGE paper case studies as the seed user's `paper` scenarios.

Reads two environment variables:

- `FORGE_DATABASE_URL`: the `forge_api` role's connection string (same DSN
  `app/db.py` uses).
- `FORGE_SEED_USER_EMAIL`: the email of an existing `auth.users` row to own
  the seeded rows. The script refuses to run if no such user exists.

For each `.forge` file bundled in the installed `forge-calc` package's
`forge/scenarios/` directory, this diffs the file's full input document
against the calculator's defaults, resolves and runs the calculation, and
inserts the row with `source = 'paper'`.

Idempotent: a second run deletes the seed user's existing `paper` rows and
re-inserts all eight, so re-running after a code or data change doesn't
accumulate duplicates. Every other row — other sources, other users — is
left untouched, because the delete is scoped to
`user_id = <seed user> and source = 'paper'`.

Usage:
    export FORGE_DATABASE_URL='postgresql://forge_api:<password>@127.0.0.1:54322/postgres'
    export FORGE_SEED_USER_EMAIL='seed@forge.dev'
    .venv/bin/python scripts/seed_paper_scenarios.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import asyncpg
import forge

from app import db as db_module
from app.models import sanitize_for_json

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("seed_paper_scenarios")

# Computed once, same as app/scenarios.py: the calculator's identity and
# defaults don't change within a single run of this script.
_CALCULATOR_INFO = forge.calculator_info()
_DEFAULTS_ID = forge.get_defaults_id()


class SeedUserNotFound(RuntimeError):
    pass


async def _lookup_seed_user_id(pool: asyncpg.Pool, email: str) -> str:
    """Resolve `email` to an `auth.users` id via the `lookup_user_id_by_email`
    security-definer function (see the migration that defines it: `forge_api`
    has no direct grant on the `auth` schema)."""
    async with pool.acquire() as conn:
        user_id = await conn.fetchval("select public.lookup_user_id_by_email($1)", email)
    if user_id is None:
        raise SeedUserNotFound(
            f"No auth.users row for {email!r}. Create the seed user first, e.g.:\n"
            "  curl -X POST '<SUPABASE_URL>/auth/v1/admin/users' \\\n"
            "    -H 'Authorization: Bearer <service_role_key>' \\\n"
            "    -H 'Content-Type: application/json' \\\n"
            f"    -d '{{\"email\": \"{email}\", \"password\": \"...\", \"email_confirm\": true}}'"
        )
    return str(user_id)


def _load_forge_file(path) -> dict[str, Any]:
    with path.open() as handle:
        return json.load(handle)


def _jsonb_param(value: Any) -> Optional[str]:
    return json.dumps(value) if value is not None else None


def _calculate(name: str, full_inputs: dict) -> tuple[dict[str, Any], dict[str, Any]]:
    """Diff a .forge file's full inputs against the defaults, then resolve and run.

    Returns `(changes, calc_fields)`. On a calculator failure, `calc_fields`
    holds `calc_error` and null results (matching the `scenario` table's
    all-or-nothing / results-xor-calc_error constraints); the row is still
    stored, same as `app/scenarios.py`.
    """
    changes = forge.diff_changes(full_inputs)
    resolved = forge.resolve_inputs(changes)
    try:
        raw_results = forge.run_calculation(resolved, scenario_id=name)
    except Exception as exc:  # noqa: BLE001 - the calculator's failure mode is unconstrained
        logger.warning("Scenario %r failed to calculate: %s", name, exc)
        return changes, {
            "results": None,
            "calculator": None,
            "inputs_id": None,
            "computed_at": None,
            "calc_error": str(exc),
        }

    inputs_id = (raw_results.get("provenance") or {}).get("inputs_id")
    return changes, {
        "results": sanitize_for_json(raw_results),
        "calculator": _CALCULATOR_INFO,
        "inputs_id": inputs_id,
        "computed_at": datetime.now(timezone.utc),
        "calc_error": None,
    }


async def _delete_existing_paper_rows(conn: asyncpg.Connection, user_id: str) -> int:
    rows = await conn.fetch(
        "delete from public.scenario where user_id = $1 and source = 'paper' returning id",
        UUID(user_id),
    )
    return len(rows)


async def _insert_scenario(
    conn: asyncpg.Connection,
    user_id: str,
    name: str,
    changes: dict,
    calc_fields: dict,
) -> None:
    await conn.execute(
        """
        insert into public.scenario
            (user_id, name, source, defaults_id, changes,
             results, calculator, inputs_id, computed_at, calc_error)
        values
            ($1, $2, 'paper', $3, $4::jsonb,
             $5::jsonb, $6::jsonb, $7, $8, $9)
        """,
        UUID(user_id),
        name,
        _DEFAULTS_ID,
        json.dumps(changes),
        _jsonb_param(calc_fields["results"]),
        _jsonb_param(calc_fields["calculator"]),
        calc_fields["inputs_id"],
        calc_fields["computed_at"],
        calc_fields["calc_error"],
    )


async def main() -> None:
    dsn = os.environ.get("FORGE_DATABASE_URL", "")
    if not dsn:
        raise SystemExit("FORGE_DATABASE_URL is not set.")
    email = os.environ.get("FORGE_SEED_USER_EMAIL", "")
    if not email:
        raise SystemExit("FORGE_SEED_USER_EMAIL is not set.")

    scenario_paths = sorted(forge.get_scenarios_path().glob("*.forge"))
    if not scenario_paths:
        raise SystemExit(
            f"No .forge files found under {forge.get_scenarios_path()} "
            "(the installed forge-calc package's bundled scenarios)."
        )

    pool = await db_module.init_db_pool(dsn)
    try:
        try:
            user_id = await _lookup_seed_user_id(pool, email)
        except SeedUserNotFound as exc:
            raise SystemExit(str(exc)) from exc

        inserted: list[str] = []
        errored: list[str] = []
        async with db_module.forge_api_transaction(user_id) as conn:
            deleted_count = await _delete_existing_paper_rows(conn, user_id)
            for path in scenario_paths:
                forge_file = _load_forge_file(path)
                name = forge_file.get("customName") or path.stem
                full_inputs = forge_file["inputs"]
                changes, calc_fields = _calculate(name, full_inputs)
                if calc_fields["calc_error"] is not None:
                    errored.append(name)
                await _insert_scenario(conn, user_id, name, changes, calc_fields)
                inserted.append(name)

        logger.info("Seed user: %s (%s)", email, user_id)
        logger.info("Deleted %d existing paper row(s).", deleted_count)
        logger.info("Inserted %d paper scenario(s):", len(inserted))
        for name in inserted:
            flag = " [CALC ERROR]" if name in errored else ""
            logger.info("  - %s%s", name, flag)
        if errored:
            logger.warning(
                "%d scenario(s) stored with calc_error instead of results: %s",
                len(errored),
                ", ".join(errored),
            )
    finally:
        await db_module.close_db_pool()


if __name__ == "__main__":
    asyncio.run(main())
