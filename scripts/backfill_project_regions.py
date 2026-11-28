#!/usr/bin/env python3
"""Set each project's NERC regions from its two terminals.

A project gets every region within 25 km of either terminal. Projects that
already have regions are left as they are.

--report (the default) prints the plan and writes nothing.
--apply writes every project's regions in one transaction, acting as each
owner (forge_api updates only the rows of the user in its JWT claim).

Both modes stop with exit code 1 when any project has no region within 25 km
of either terminal. Nothing is written in that case. Report the project to
Andy and fix its terminals or the region data first.

Reads FORGE_DATABASE_URL (the forge_api role). Run it against the local
database only until Andy says otherwise.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import asyncpg

from app.regions import REGION_TOLERANCE_M, normalize_regions

# Each project's owner and the codes of every region within the tolerance of
# either terminal. ref.nerc_regions is read through its gist index.
SELECT_SQL = """
select p.id as project_id,
       p.user_id,
       p.name,
       array(
         select r.code
         from ref.nerc_regions r
         where ST_DWithin(r.geom, ST_Transform(p.sending_point, 5070), $1::float8)
            or ST_DWithin(r.geom, ST_Transform(p.receiving_point, 5070), $1::float8)
         order by r.code
       ) as regions
from public.project p
where p.nerc_regions is null
order by p.created_at, p.id
"""

# Run after set_config as the owner. The guard keeps a re-run from overwriting.
UPDATE_SQL = """
update public.project
set nerc_regions = $2::text[]
where id = $1::uuid and nerc_regions is null
"""


class BackfillError(Exception):
    """The backfill cannot write. The database is unchanged."""


@dataclass(frozen=True)
class Plan:
    project_id: UUID
    user_id: str
    name: str
    regions: tuple[str, ...]


def plan_backfill(rows) -> tuple[list[Plan], list[Plan]]:
    """Split the selected rows into projects with regions and projects without.

    Region codes go through normalize_regions, so the stored order is the same
    as the API's (REGION_CODES order, not alphabetical).
    """
    plans: list[Plan] = []
    missing: list[Plan] = []
    for row in rows:
        codes = list(row["regions"])
        plan = Plan(
            project_id=row["project_id"],
            user_id=str(row["user_id"]),
            name=row["name"],
            regions=tuple(normalize_regions(codes)) if codes else (),
        )
        (plans if plan.regions else missing).append(plan)
    return plans, missing


def _parse_mode(argv: list[str] | None) -> str:
    parser = argparse.ArgumentParser(description="Set project NERC regions from terminals.")
    parser.add_argument("--report", action="store_true", help="Print the plan. Default.")
    parser.add_argument("--apply", action="store_true", help="Write the plan in one transaction.")
    args = parser.parse_args(argv)
    if args.report and args.apply:
        parser.error("choose only one of --report, --apply")
    return "apply" if args.apply else "report"


async def _connect(url: str):
    return await asyncpg.connect(url, statement_cache_size=0)


async def _select(conn) -> tuple[list[Plan], list[Plan]]:
    rows = await conn.fetch(SELECT_SQL, float(REGION_TOLERANCE_M))
    return plan_backfill(rows)


def _describe(plans: list[Plan], missing: list[Plan]) -> None:
    for plan in plans:
        sys.stdout.write(f"{plan.name}: {', '.join(plan.regions)}\n")
    for plan in missing:
        sys.stdout.write(
            f"NO REGION within {REGION_TOLERANCE_M // 1000} km of either terminal: "
            f"{plan.name} ({plan.project_id})\n"
        )
    sys.stdout.write(f"{len(plans)} project(s) to set; {len(missing)} without a region.\n")


def _stop_message(missing: list[Plan]) -> str:
    names = ", ".join(f"{plan.name} ({plan.project_id})" for plan in missing)
    return f"stopped: no region within {REGION_TOLERANCE_M // 1000} km for: {names}"


async def report(url: str) -> int:
    conn = await _connect(url)
    try:
        plans, missing = await _select(conn)
    finally:
        await conn.close()
    _describe(plans, missing)
    if missing:
        raise BackfillError(_stop_message(missing))
    return 0


async def apply(url: str) -> int:
    conn = await _connect(url)
    try:
        plans, missing = await _select(conn)
        if missing:
            raise BackfillError(_stop_message(missing))
        async with conn.transaction():
            for plan in plans:
                await conn.execute(
                    "select set_config('request.jwt.claim.sub', $1, true)",
                    plan.user_id,
                )
                status = await conn.execute(UPDATE_SQL, plan.project_id, list(plan.regions))
                if status != "UPDATE 1":
                    raise BackfillError(f"{plan.name}: expected one row, got {status!r}")
    finally:
        await conn.close()
    _describe(plans, [])
    sys.stdout.write(f"wrote regions for {len(plans)} project(s)\n")
    return 0


def main(argv: list[str] | None = None) -> None:
    mode = _parse_mode(argv)
    database_url = os.environ.get("FORGE_DATABASE_URL", "").strip()
    if not database_url:
        print("FORGE_DATABASE_URL is not set.", file=sys.stderr)
        raise SystemExit(1)

    async def _run() -> int:
        if mode == "apply":
            return await apply(database_url)
        return await report(database_url)

    try:
        code = asyncio.run(_run())
    except BackfillError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        if mode == "apply":
            print("nothing written", file=sys.stderr)
        raise SystemExit(1) from exc
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    raise SystemExit(code)


if __name__ == "__main__":
    main()
