#!/usr/bin/env python3
"""Report stored scenario rows without writing.

Prints one tab-separated line per scenario. Removed-path cells record whether
the stored changes still contain a path v4 dropped. Old benefit-cost ratios
are the numbers already stored on the row. Route measurements and the ratios
an analyzer would recompute stay blank unless the caller passes an analyzer
to ``measure_saved_routes``. ``main`` never calls that function.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections.abc import Mapping

GREENFIELD = (
    "17_congestion_reductions.greenfield_congestion_reductions"
    ".prices.average_congestion_price"
)
INCREMENTAL = (
    "17_congestion_reductions.incremental_congestion_reductions"
    ".prices.average_congestion_price"
)
LOAD = "01_project_technical_details.project.value_of_load_per_mwh"
REMOVED = (GREENFIELD, INCREMENTAL, LOAD)
RATIOS = ("bcr_societal", "bcr_ratepayer", "bcr_utility")
MEASUREMENTS = (
    "congestion_spread_per_mwh",
    "hours_receiving_more_congested",
    "hours_sending_more_congested",
    "receiving_energy_value_per_mwh",
)
COLUMNS = (
    "id",
    "name",
    "route_present",
    "subsea_leave",
    *REMOVED,
    *RATIOS,
    *MEASUREMENTS,
    *RATIOS,
)

_SELECT_ROWS = """
SELECT id::text AS id,
       name,
       changes,
       results,
       (route IS NOT NULL) AS route_present
FROM public.scenario
ORDER BY name, id
"""


def classify_row(changes, results, route_present, name) -> dict:
    """Classify one stored scenario. Measurements stay blank."""
    leaves = _leaves(changes) if isinstance(changes, Mapping) else []
    present = {path for path, _value in leaves}
    subsea_leave = (isinstance(name, str) and name.startswith("TBC_")) or any(
        value == "Subsea" for _path, value in leaves
    )
    stored_ratios = {key: "" for key in RATIOS}
    bcr = results.get("bcr") if isinstance(results, Mapping) else None
    if isinstance(bcr, Mapping):
        for key in RATIOS:
            if key in bcr and bcr[key] is not None:
                stored_ratios[key] = bcr[key]
    return {
        "name": name if isinstance(name, str) else "",
        "route_present": bool(route_present),
        "subsea_leave": subsea_leave,
        "removed": {path: path in present for path in REMOVED},
        "bcr": stored_ratios,
        "measured": {key: "" for key in (*MEASUREMENTS, *RATIOS)},
    }


def format_report(rows) -> str:
    """Return a header plus one tab-separated line per classified row."""
    lines = ["\t".join(COLUMNS)]
    for row in rows:
        removed = row["removed"]
        stored_ratios = row["bcr"]
        measured = row["measured"]
        cells = [
            "" if row.get("id") is None else str(row.get("id")),
            row["name"],
            "true" if row["route_present"] else "false",
            "subsea_leave" if row["subsea_leave"] else "",
            *(path if removed[path] else "" for path in REMOVED),
            *(_render(stored_ratios[key]) for key in RATIOS),
            *(_render(measured[key]) for key in MEASUREMENTS),
            *(_render(measured[key]) for key in RATIOS),
        ]
        lines.append("\t".join(cells))
    return "\n".join(lines) + "\n"


def measure_saved_routes(rows, analyzer) -> list[dict]:
    """Fill measurement cells from an injected analyzer.

    Rows without a saved route are copied unchanged. The analyzer is not used
    unless this function runs.
    """
    measured_rows: list[dict] = []
    for row in rows:
        updated = {
            **row,
            "removed": dict(row["removed"]),
            "bcr": dict(row["bcr"]),
            "measured": dict(row["measured"]),
        }
        if row["route_present"]:
            values = analyzer(row)
            for key in (*MEASUREMENTS, *RATIOS):
                updated["measured"][key] = values[key]
        measured_rows.append(updated)
    return measured_rows


def _leaves(node: Mapping, prefix: str = "") -> list[tuple[str, object]]:
    found: list[tuple[str, object]] = []
    for key, value in node.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict) and value:
            found.extend(_leaves(value, path))
        else:
            found.append((path, value))
    return found


def _render(value: object) -> str:
    if value is None or value == "":
        return ""
    return str(value)


def _coerce_mapping(value: object) -> dict | None:
    if value is None:
        return None
    loaded = json.loads(value) if isinstance(value, str) else value
    if not isinstance(loaded, dict):
        raise TypeError("expected an object")
    return loaded


def main() -> None:
    database_url = os.environ.get("FORGE_DATABASE_URL")
    if not database_url:
        print("FORGE_DATABASE_URL is not set.", file=sys.stderr)
        raise SystemExit(1)

    async def _report(url: str) -> int:
        import asyncpg

        conn = await asyncpg.connect(url, statement_cache_size=0)
        try:
            await conn.execute("SET default_transaction_read_only = on")
            async with conn.transaction(readonly=True):
                fetched = await conn.fetch(_SELECT_ROWS)
        finally:
            await conn.close()

        classified = []
        for record in fetched:
            row_name = record["name"] if isinstance(record["name"], str) else ""
            try:
                changes = _coerce_mapping(record["changes"]) or {}
            except (TypeError, json.JSONDecodeError, ValueError):
                changes = {}
            try:
                results = _coerce_mapping(record["results"])
            except (TypeError, json.JSONDecodeError, ValueError):
                results = None
            row = classify_row(
                changes,
                results,
                bool(record["route_present"]),
                row_name,
            )
            row["id"] = str(record["id"])
            classified.append(row)
        sys.stdout.write(format_report(classified))
        return 0

    try:
        code = asyncio.run(_report(database_url))
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    raise SystemExit(code)


if __name__ == "__main__":
    main()
