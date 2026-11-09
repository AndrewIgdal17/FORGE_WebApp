#!/usr/bin/env python3
"""Report stored scenario changes that v3.0.0 no longer accepts as written.

Queries ``public.scenario.changes`` through ``FORGE_DATABASE_URL`` and prints,
for each row id and name, every path the v3 pin has to review. The connection
is read-only. This script never writes.

``classify_changes`` is the pure classifier. Reasons:

- ``rename`` — ``construction_cost_escalation_rate``
- ``removed`` — cost-timing inputs, ``delay_period_active_work``, the old
  ``ignition_rate_multiplier.underground`` key, and ``greenfield_comparison_*``
- ``non-whole`` — ``timeline.delay_years``, ``construction_years``, or
  ``project_lifetime`` is not a whole number
- ``constrained_hours with price`` / ``constrained_hours without price``
- ``flow_factor 0 on greenfield margin`` — confirmed, not rewritten here
- ``rejected`` — a ``fee_simple`` agreement
- ``ignored`` — ``uses_existing_row``
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import sys
from collections.abc import Mapping

_ESCALATION = "construction_cost_escalation_rate"
_TIMING_PREFIX = "19_cost_timing_patterns.cost_timing_patterns"
_AFUDC = "delay_period_active_work"
_TIMELINE = (
    "timeline.delay_years",
    "timeline.construction_years",
    "timeline.project_lifetime",
)
_PROJECT_TYPE = "01_project_technical_details.project.project_type"
_SENDING_SOURCE = "01_project_technical_details.project.sending_source"
_HOURS_MARKER = ".constraints.constrained_hours"

_SELECT_CHANGES = """
SELECT id::text AS id, name, changes
FROM public.scenario
ORDER BY name, id
"""


def classify_changes(changes: dict) -> list[tuple[str, str]]:
    """Return sorted ``(path, reason)`` hits. A clean dict returns ``[]``."""
    if not isinstance(changes, dict):
        return []
    leaves = _leaves(changes)
    leaf_map = {path: value for path, value in leaves}
    hits: list[tuple[str, str]] = []
    for path, value in leaves:
        reason = _reason(path, value, leaf_map)
        if reason is not None:
            hits.append((path, reason))
    hits.sort()
    return hits


def _leaves(node: Mapping, prefix: str = "") -> list[tuple[str, object]]:
    found: list[tuple[str, object]] = []
    for key, value in node.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict) and value:
            found.extend(_leaves(value, path))
        else:
            found.append((path, value))
    return found


def _reason(path: str, value: object, leaf_map: dict[str, object]) -> str | None:
    parts = path.split(".")
    last = parts[-1]
    if last == _ESCALATION:
        return "rename"
    if path == _TIMING_PREFIX or path.startswith(_TIMING_PREFIX + "."):
        return "removed"
    if last == _AFUDC:
        return "removed"
    if _is_timeline(path) and not _is_whole(value):
        return "non-whole"
    if (
        len(parts) >= 2
        and parts[-2] == "ignition_rate_multiplier"
        and last == "underground"
    ):
        return "removed"
    if path == "constrained_hours" or path.endswith(".constrained_hours"):
        if _has_section_price(path, leaf_map):
            return "constrained_hours with price"
        return "constrained_hours without price"
    if (
        _is_greenfield_flow(path)
        and _is_zero(value)
        and _is_greenfield_margin(leaf_map)
    ):
        return "flow_factor 0 on greenfield margin"
    if value == "fee_simple" or last == "fee_simple":
        return "rejected"
    if last == "uses_existing_row":
        return "ignored"
    if last.startswith("greenfield_comparison_"):
        return "removed"
    return None


def _is_timeline(path: str) -> bool:
    return any(path == field or path.endswith("." + field) for field in _TIMELINE)


def _is_whole(value: object) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    if isinstance(value, float) and not math.isfinite(value):
        return False
    return float(value).is_integer()


def _is_zero(value: object) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return value == 0
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return False
        try:
            return float(text) == 0.0
        except ValueError:
            return False
    return False


def _is_greenfield_flow(path: str) -> bool:
    if path != "flow_factor" and not path.endswith(".flow_factor"):
        return False
    return any(part.startswith("greenfield") for part in path.split("."))


def _is_greenfield_margin(leaf_map: Mapping[str, object]) -> bool:
    project_type = leaf_map.get(_PROJECT_TYPE, "greenfield")
    sending_source = leaf_map.get(_SENDING_SOURCE, "margin")
    return project_type == "greenfield" and sending_source == "margin"


def _has_section_price(path: str, leaf_map: Mapping[str, object]) -> bool:
    if path.endswith(_HOURS_MARKER):
        section = path[: -len(_HOURS_MARKER)]
        price = f"{section}.prices.average_congestion_price"
        return price in leaf_map
    if path.endswith(".constrained_hours"):
        parent = path[: -len(".constrained_hours")]
        return any(
            key.startswith(parent) and key.endswith("average_congestion_price")
            for key in leaf_map
        )
    return any(
        key == "average_congestion_price" or key.endswith(".average_congestion_price")
        for key in leaf_map
    )


def _coerce_changes(value: object) -> dict:
    if isinstance(value, str):
        loaded = json.loads(value)
    else:
        loaded = value
    if not isinstance(loaded, dict):
        raise TypeError("changes is not an object")
    return loaded


def _print_row(row_id: str, name: str, changes: dict, hits: list[tuple[str, str]]) -> None:
    leaves = {path: value for path, value in _leaves(changes)}
    print(f"{row_id}\t{name}")
    for path, reason in hits:
        rendered = json.dumps(leaves.get(path), default=str)
        print(f"\t{path}\t{reason}\t{rendered}")


async def _report(database_url: str) -> int:
    import asyncpg

    conn = await asyncpg.connect(database_url, statement_cache_size=0)
    try:
        await conn.execute("SET default_transaction_read_only = on")
        async with conn.transaction(readonly=True):
            rows = await conn.fetch(_SELECT_CHANGES)
    finally:
        await conn.close()

    hit_rows = 0
    for row in rows:
        row_id = str(row["id"])
        name = row["name"] if isinstance(row["name"], str) else ""
        try:
            changes = _coerce_changes(row["changes"])
            hits = classify_changes(changes)
        except (TypeError, json.JSONDecodeError, ValueError):
            changes = {}
            hits = [("(changes)", "changes is not an object")]
        if not hits:
            continue
        hit_rows += 1
        _print_row(row_id, name, changes, hits)
    print(f"scanned={len(rows)} rows_with_hits={hit_rows}")
    return 0


def main() -> None:
    database_url = os.environ.get("FORGE_DATABASE_URL")
    if not database_url:
        print("FORGE_DATABASE_URL is not set.", file=sys.stderr)
        raise SystemExit(1)
    try:
        code = asyncio.run(_report(database_url))
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    raise SystemExit(code)


if __name__ == "__main__":
    main()
