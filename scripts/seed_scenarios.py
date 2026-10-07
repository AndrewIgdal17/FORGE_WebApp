#!/usr/bin/env python3
"""Seed the 8 case study scenarios as system-owned examples.

Usage (from the calculator repo, with forge importable):
    cd /path/to/Projects/FORGE/code
    FORGE_DATABASE_URL=<supabase-pooler-url> uv run python /path/to/repos/FORGE_WebApp/scripts/seed_scenarios.py

Idempotent: uses INSERT ... ON CONFLICT (name) WHERE source='system'
DO UPDATE so re-running updates existing seeds.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

OWNER_ID = UUID("846d719f-7a14-4022-8979-ad4c92317030")


async def main() -> None:
    database_url = os.environ.get("FORGE_DATABASE_URL")
    if not database_url:
        print("ERROR: Set FORGE_DATABASE_URL to the Supabase pooler URL.", file=sys.stderr)
        sys.exit(1)

    import asyncpg
    import forge

    scenarios_dir = forge.get_scenarios_path()
    defaults_id = forge.get_defaults_id()
    calculator_info = forge.calculator_info()

    pool = await asyncpg.create_pool(
        dsn=database_url, min_size=1, max_size=2, statement_cache_size=0
    )

    forge_files = sorted(scenarios_dir.glob("*.forge"))
    print(f"Found {len(forge_files)} .forge files in {scenarios_dir}")

    for forge_file in forge_files:
        name = forge_file.stem
        with open(forge_file) as f:
            document = json.load(f)

        full_inputs = document["inputs"]
        changes = forge.diff_changes(full_inputs)
        resolved = forge.resolve_inputs(changes)
        results = forge.run_calculation(resolved, scenario_id=name)

        inputs_id = (results.get("provenance") or {}).get("inputs_id")

        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO public.scenario
                    (user_id, name, source, defaults_id, changes,
                     results, calculator, inputs_id, computed_at)
                VALUES
                    ($1, $2, 'system', $3, $4::jsonb,
                     $5::jsonb, $6::jsonb, $7, $8)
                ON CONFLICT (name) WHERE source = 'system'
                DO UPDATE SET
                    changes = EXCLUDED.changes,
                    results = EXCLUDED.results,
                    calculator = EXCLUDED.calculator,
                    inputs_id = EXCLUDED.inputs_id,
                    computed_at = EXCLUDED.computed_at,
                    defaults_id = EXCLUDED.defaults_id,
                    revision = scenario.revision + 1
                """,
                OWNER_ID,
                name,
                defaults_id,
                json.dumps(changes),
                json.dumps(results, default=str),
                json.dumps(calculator_info),
                inputs_id,
                datetime.now(UTC),
            )
        print(f"  Seeded: {name}")

    await pool.close()
    print(f"\nDone. {len(forge_files)} system scenarios seeded.")


if __name__ == "__main__":
    asyncio.run(main())
