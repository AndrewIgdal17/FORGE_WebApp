#!/usr/bin/env python3
"""Attach each stored scenario to a project.

--report (the default) prints the grouping and writes nothing.
--apply inserts one project per owner and terminal pair, sets project_id,
snaps each route's ends, and sets the base, in one transaction. A scenario
with no route stops --apply before any write.
--recalculate reruns the save path for every scenario as its owner and
prints the three ratios before and after.

Reads FORGE_DATABASE_URL (the forge_api role). A scenario that already has
a project_id is left as it is.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import os
import sys
import urllib.parse
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import UUID

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app.footprints import footprint_flags

RATIO_KEYS = ("bcr_societal", "bcr_ratepayer", "bcr_utility")

_SELECT_ROWS = """
select id::text as scenario_id,
       name,
       user_id::text as user_id,
       source,
       created_at,
       project_id::text as project_id,
       revision,
       changes,
       results,
       defaults_id,
       ST_AsGeoJSON(route) as route
from public.scenario
order by created_at, id
"""

_NEAREST_SUBSTATION = """
select gid,
       name,
       ST_X(ST_Transform(ST_Centroid(geom), 4326)) as lon,
       ST_Y(ST_Transform(ST_Centroid(geom), 4326)) as lat
from ref.substations
where name is not null
  and name <> ''
  and ST_Distance(
        geom,
        ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 5070)
      ) <= 100
order by geom <-> ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 5070)
limit 1
"""

_CT_NORM = {
    "Underground Direct-Buried": "Underground direct-buried",
    "Underground Tunnel": "Underground tunnel",
}


class MigrationError(Exception):
    """The migration cannot write. The database is unchanged."""


@dataclass(frozen=True)
class RowEnds:
    scenario_id: str
    name: str
    user_id: str
    source: str
    created_at: datetime
    sending: tuple[float, float]
    receiving: tuple[float, float]
    sending_sub: tuple[int, str, tuple[float, float]] | None
    receiving_sub: tuple[int, str, tuple[float, float]] | None


@dataclass(frozen=True)
class Terminal:
    gid: int | None
    name: str
    point: tuple[float, float]


@dataclass(frozen=True)
class ProjectPlan:
    user_id: str
    name: str
    sending: Terminal
    receiving: Terminal
    scenario_ids: tuple[str, ...]
    base_scenario_id: str


@dataclass(frozen=True)
class ScenarioEndReport:
    """Route-end distance to each terminal and footprint flags for one scenario."""

    send_m: float
    send_in: bool
    recv_m: float
    recv_in: bool


@dataclass(frozen=True)
class Loaded:
    rows: tuple[RowEnds, ...]
    routes: dict[str, dict]
    routeless: tuple[tuple[str, str], ...]
    assigned: tuple[tuple[str, str], ...]
    stored: dict[str, dict]


def ratios_from_results(results: object) -> tuple[str, str, str]:
    """The three benefit-cost ratios. A missing value is blank, never zero."""
    if not isinstance(results, dict):
        return ("", "", "")
    bcr = results.get("bcr")
    if not isinstance(bcr, dict):
        return ("", "", "")
    cells: list[str] = []
    for key in RATIO_KEYS:
        if key not in bcr or bcr[key] is None:
            cells.append("")
        else:
            cells.append(str(bcr[key]))
    return (cells[0], cells[1], cells[2])


def point_terminal_name(point: tuple[float, float]) -> str:
    lon, lat = point
    return f"Point at {lat:.4f}, {lon:.4f}"


def _terminal_key(sub, vertex: tuple[float, float]):
    if sub is not None:
        return ("gid", sub[0])
    lon, lat = vertex
    return ("point", round(float(lon), 6), round(float(lat), 6))


def _terminal(sub, vertex: tuple[float, float]) -> Terminal:
    if sub is not None:
        gid, name, point = sub
        return Terminal(gid=int(gid), name=str(name), point=(float(point[0]), float(point[1])))
    return Terminal(gid=None, name=point_terminal_name(vertex), point=(float(vertex[0]), float(vertex[1])))


def group_rows(rows: list[RowEnds]) -> list[ProjectPlan]:
    """Group by owner and terminal pair. The base is the oldest scenario."""
    groups: dict[tuple, list[RowEnds]] = {}
    for row in rows:
        key = (
            row.user_id,
            _terminal_key(row.sending_sub, row.sending),
            _terminal_key(row.receiving_sub, row.receiving),
        )
        groups.setdefault(key, []).append(row)

    plans: list[ProjectPlan] = []
    for members in groups.values():
        ordered = sorted(members, key=lambda row: (row.created_at, row.scenario_id))
        base = ordered[0]
        sending = _terminal(base.sending_sub, base.sending)
        receiving = _terminal(base.receiving_sub, base.receiving)
        plans.append(
            ProjectPlan(
                user_id=base.user_id,
                name=f"{sending.name} → {receiving.name}",
                sending=sending,
                receiving=receiving,
                scenario_ids=tuple(row.scenario_id for row in ordered),
                base_scenario_id=base.scenario_id,
            )
        )
    plans.sort(key=lambda plan: (plan.user_id, plan.name, plan.base_scenario_id))
    return plans


def _terminal_label(terminal: Terminal) -> str:
    if terminal.gid is None:
        return terminal.name
    return f"{terminal.name} (gid {terminal.gid})"


def _format_bool(value: bool) -> str:
    return "true" if value else "false"


def scenario_end_report(
    route: dict,
    plan: ProjectPlan,
    inside_footprint: tuple[bool, bool],
) -> ScenarioEndReport:
    from app.terminals import haversine_m

    sending, receiving = route_vertices(route, "")
    return ScenarioEndReport(
        send_m=haversine_m(sending, plan.sending.point),
        send_in=inside_footprint[0],
        recv_m=haversine_m(receiving, plan.receiving.point),
        recv_in=inside_footprint[1],
    )


async def gather_end_reports(
    conn,
    plans: list[ProjectPlan],
    routes: dict[str, dict],
) -> dict[str, ScenarioEndReport]:
    reports: dict[str, ScenarioEndReport] = {}
    for plan in plans:
        for scenario_id in plan.scenario_ids:
            route = routes[scenario_id]
            flags = await footprint_flags(
                conn, route, plan.sending.gid, plan.receiving.gid
            )
            reports[scenario_id] = scenario_end_report(route, plan, flags)
    return reports


def format_report(
    plans: list[ProjectPlan],
    names: dict[str, str],
    end_reports: dict[str, ScenarioEndReport],
) -> str:
    lines = [
        f"{len(plans)} projects",
        (
            "owner\tproject\tscenario\tbase\tsending\treceiving"
            "\tsend_m\tsend_in\trecv_m\trecv_in"
        ),
    ]
    for plan in plans:
        base_name = names.get(plan.base_scenario_id, plan.base_scenario_id)
        for scenario_id in plan.scenario_ids:
            report = end_reports[scenario_id]
            lines.append(
                "\t".join(
                    (
                        plan.user_id,
                        plan.name,
                        names.get(scenario_id, scenario_id),
                        base_name,
                        _terminal_label(plan.sending),
                        _terminal_label(plan.receiving),
                        f"{report.send_m:.0f}",
                        _format_bool(report.send_in),
                        f"{report.recv_m:.0f}",
                        _format_bool(report.recv_in),
                    )
                )
            )
    return "\n".join(lines) + "\n"


def format_notes(
    routeless: tuple[tuple[str, str], ...],
    assigned: tuple[tuple[str, str], ...],
) -> str:
    lines: list[str] = []
    if routeless:
        lines.append("routeless:")
        lines.extend(f"{name}\t{scenario_id}" for scenario_id, name in routeless)
    if assigned:
        lines.append("already in a project:")
        lines.extend(f"{name}\t{scenario_id}" for scenario_id, name in assigned)
    if not lines:
        return ""
    return "\n".join(lines) + "\n"


def route_vertices(route: dict, name: str) -> tuple[tuple[float, float], tuple[float, float]]:
    try:
        coordinates = route["coordinates"]
        first = coordinates[0][0]
        last = coordinates[-1][-1]
        return (float(first[0]), float(first[1])), (float(last[0]), float(last[1]))
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise MigrationError(f"{name} has a route with no ends.") from exc


def _decode_json(value: object) -> object:
    if isinstance(value, str):
        return json.loads(value)
    return value


def _decode_route(value: object, name: str) -> dict | None:
    if value is None:
        return None
    loaded = _decode_json(value)
    if not isinstance(loaded, dict):
        raise MigrationError(f"{name} has a route that is not a GeoJSON object.")
    return loaded


def _as_dict(value: object, label: str) -> dict:
    if value is None:
        return {}
    loaded = _decode_json(value)
    if not isinstance(loaded, dict):
        raise MigrationError(f"{label} is not a JSON object.")
    return loaded


async def _nearest(conn, point: tuple[float, float]):
    import asyncpg

    lon, lat = point
    try:
        row = await conn.fetchrow(_NEAREST_SUBSTATION, lon, lat)
    except asyncpg.UndefinedTableError as exc:
        raise MigrationError(
            "ref.substations is not available, so route ends cannot be matched."
        ) from exc
    if row is None or row["lon"] is None or row["lat"] is None:
        return None
    return (int(row["gid"]), str(row["name"]), (float(row["lon"]), float(row["lat"])))


async def load_rows(conn) -> Loaded:
    records = await conn.fetch(_SELECT_ROWS)
    rows: list[RowEnds] = []
    routes: dict[str, dict] = {}
    routeless: list[tuple[str, str]] = []
    assigned: list[tuple[str, str]] = []
    stored: dict[str, dict] = {}
    for record in records:
        scenario_id = str(record["scenario_id"])
        name = record["name"] if isinstance(record["name"], str) else ""
        if record["project_id"] is not None:
            assigned.append((scenario_id, name))
            continue
        route = _decode_route(record["route"], name)
        if route is None:
            routeless.append((scenario_id, name))
            continue
        sending, receiving = route_vertices(route, name)
        sending_sub = await _nearest(conn, sending)
        receiving_sub = await _nearest(conn, receiving)
        rows.append(
            RowEnds(
                scenario_id=scenario_id,
                name=name,
                user_id=str(record["user_id"]),
                source=str(record["source"]),
                created_at=record["created_at"],
                sending=sending,
                receiving=receiving,
                sending_sub=sending_sub,
                receiving_sub=receiving_sub,
            )
        )
        routes[scenario_id] = route
        stored[scenario_id] = {
            "revision": record["revision"],
            "changes": _as_dict(record["changes"], f"{name} changes"),
            "results": _decode_json(record["results"]),
            "defaults_id": record["defaults_id"],
        }
    return Loaded(
        rows=tuple(rows),
        routes=routes,
        routeless=tuple(routeless),
        assigned=tuple(assigned),
        stored=stored,
    )


def _names(rows: tuple[RowEnds, ...]) -> dict[str, str]:
    return {row.scenario_id: row.name for row in rows}


async def _connect(url: str):
    import asyncpg

    return await asyncpg.connect(url, statement_cache_size=0)


def _host(url: str) -> str:
    return urllib.parse.urlparse(url).hostname or ""


async def report(url: str) -> None:
    conn = await _connect(url)
    try:
        await conn.execute("SET default_transaction_read_only = on")
        async with conn.transaction(readonly=True):
            loaded = await load_rows(conn)
            plans = group_rows(list(loaded.rows))
            end_reports = await gather_end_reports(conn, plans, loaded.routes)
    finally:
        await conn.close()
    sys.stdout.write(format_report(plans, _names(loaded.rows), end_reports))
    sys.stdout.write(format_notes(loaded.routeless, loaded.assigned))
    sys.stdout.flush()


async def _write_plans(conn, plans: list[ProjectPlan], routes: dict[str, dict]) -> None:
    from app.terminals import (
        TerminalMismatch,
        mismatch_message,
        snap_route_to_terminals,
    )

    for plan in plans:
        if plan.sending.point == plan.receiving.point:
            raise MigrationError(
                f"{plan.name} has the same point for both terminals."
            )
        if not 1 <= len(plan.name) <= 200:
            raise MigrationError(f"Project name length is out of range: {plan.name!r}")
        await conn.execute(
            "select set_config('request.jwt.claim.sub', $1, true)",
            plan.user_id,
        )
        project_id = await conn.fetchval(
            """
            insert into public.project (
                user_id, name,
                sending_substation_gid, receiving_substation_gid,
                sending_name, receiving_name,
                sending_point, receiving_point
            )
            values (
                $1, $2,
                $3, $4,
                $5, $6,
                ST_SetSRID(ST_MakePoint($7, $8), 4326),
                ST_SetSRID(ST_MakePoint($9, $10), 4326)
            )
            returning id
            """,
            UUID(plan.user_id),
            plan.name,
            plan.sending.gid,
            plan.receiving.gid,
            plan.sending.name,
            plan.receiving.name,
            plan.sending.point[0],
            plan.sending.point[1],
            plan.receiving.point[0],
            plan.receiving.point[1],
        )
        for scenario_id in plan.scenario_ids:
            route = routes[scenario_id]
            inside = await footprint_flags(
                conn, route, plan.sending.gid, plan.receiving.gid
            )
            snapped = snap_route_to_terminals(
                route,
                plan.sending.point,
                plan.receiving.point,
                inside_footprint=inside,
            )
            if isinstance(snapped, TerminalMismatch):
                raise MigrationError(mismatch_message(snapped))
            result = await conn.execute(
                """
                update public.scenario
                set project_id = $1,
                    route = ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326)
                where id = $3 and project_id is null
                """,
                project_id,
                json.dumps(snapped),
                UUID(scenario_id),
            )
            if result != "UPDATE 1":
                raise MigrationError(f"Did not update scenario {scenario_id}.")
        await conn.execute(
            """
            update public.project
            set base_scenario_id = $1
            where id = $2
            """,
            UUID(plan.base_scenario_id),
            project_id,
        )


async def apply(url: str) -> int:
    conn = await _connect(url)
    try:
        async with conn.transaction():
            loaded = await load_rows(conn)
            plans = group_rows(list(loaded.rows))
            end_reports = await gather_end_reports(conn, plans, loaded.routes)
            sys.stdout.write(
                format_report(plans, _names(loaded.rows), end_reports)
            )
            sys.stdout.write(format_notes(loaded.routeless, loaded.assigned))
            sys.stdout.flush()
            if loaded.routeless:
                names = ", ".join(name for _sid, name in loaded.routeless)
                raise MigrationError(
                    f"Refusing to apply: no route for {names}."
                )
            if not plans:
                print("nothing to apply", file=sys.stderr)
                return 0
            await _write_plans(conn, plans, loaded.routes)
    finally:
        await conn.close()
    print(f"applied {len(plans)} projects", file=sys.stderr)
    return 0


def _set_path(node: dict, path: str, value: object) -> None:
    parts = path.split(".")
    cursor = node
    for part in parts[:-1]:
        nxt = cursor.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            cursor[part] = nxt
        cursor = nxt
    cursor[parts[-1]] = value


def _overlay(template: dict, changes: dict) -> dict:
    data = copy.deepcopy(template)
    for key, value in changes.items():
        if not isinstance(key, str):
            continue
        if "." in key:
            _set_path(data, key, copy.deepcopy(value))
        elif isinstance(value, dict) and isinstance(data.get(key), dict):
            data[key] = _overlay(data[key], value)
        else:
            data[key] = copy.deepcopy(value)
    return data


def _capacity_token(capacity: object) -> str | None:
    if isinstance(capacity, bool) or capacity is None:
        return None
    if isinstance(capacity, str):
        text = capacity.replace("MW", "").replace("mw", "").strip()
    elif isinstance(capacity, int):
        text = str(capacity)
    elif isinstance(capacity, float):
        text = str(int(capacity)) if capacity.is_integer() else str(capacity)
    else:
        return None
    if not text or text == "0":
        return None
    return text


def stored_row_width_ft(changes: dict) -> float | None:
    """Row width from the scenario's category. Missing stays missing."""
    import forge

    template = forge.get_defaults_template()
    project = _overlay(template, changes)["01_project_technical_details"]["project"]
    construction = project.get("construction_type") or ""
    current = project.get("ac_dc") or ""
    conductor = project.get("conductor_type") or ""
    capacity = _capacity_token(project.get("capacity_mw"))
    if not construction or not current or not conductor or capacity is None:
        return None
    construction = _CT_NORM.get(construction, construction)
    if current == "DC":
        converter = project.get("converter_type") or ""
    else:
        converter = "NA"
    key = f"{construction}/{current}/{capacity}MW/{conductor}/{converter}"
    table = template["20_project_category_row_widths"]["project_categories_row_widths"]
    entry = table.get(key)
    if not isinstance(entry, dict):
        return None
    width = entry.get("row_width_feet")
    if isinstance(width, bool) or not isinstance(width, (int, float)) or width <= 0:
        return None
    return float(width)


def _response_text(response) -> str:
    raw = response.body
    text = raw.decode() if isinstance(raw, (bytes, bytearray)) else str(raw)
    return f"{response.status_code} {text}"


async def _recalculate_one(row: RowEnds, route: dict, stored: dict) -> tuple[str, str, str]:
    from fastapi.responses import JSONResponse

    from app import db as db_module
    from app.route import RouteGeometry
    from app.scenarios import _calculate, _jsonb_param, _measure_changes

    width = stored_row_width_ft(stored["changes"])
    if width is None:
        raise MigrationError(
            f"{row.name}: row width is not available; not measuring as zero."
        )
    try:
        geometry = RouteGeometry.model_validate(route)
    except Exception as exc:
        raise MigrationError(f"{row.name}: stored route is not usable.") from exc

    measured = await _measure_changes(geometry, width, stored["changes"])
    if isinstance(measured, JSONResponse):
        raise MigrationError(f"{row.name}: {_response_text(measured)}")
    new_changes, releases = measured
    calc_fields, error_response = _calculate(row.name, new_changes)
    if error_response is not None:
        raise MigrationError(f"{row.name}: {_response_text(error_response)}")

    async with db_module.forge_api_transaction(row.user_id) as conn:
        updated = await conn.fetchrow(
            """
            update public.scenario
            set defaults_id = $1,
                changes = $2::jsonb,
                results = $3::jsonb,
                calculator = $4::jsonb,
                inputs_id = $5,
                computed_at = $6,
                calc_error = $7,
                layer_releases = $8::jsonb,
                revision = revision + 1
            where id = $9 and revision = $10
            returning results
            """,
            stored["defaults_id"],
            json.dumps(new_changes),
            _jsonb_param(calc_fields["results"]),
            _jsonb_param(calc_fields["calculator"]),
            calc_fields["inputs_id"],
            calc_fields["computed_at"],
            calc_fields["calc_error"],
            _jsonb_param(releases),
            UUID(row.scenario_id),
            stored["revision"],
        )
    if updated is None:
        raise MigrationError(f"{row.name}: revision changed; nothing saved.")
    return ratios_from_results(_decode_json(updated["results"]))


async def recalculate(url: str) -> None:
    from app import db as db_module

    await db_module.init_db_pool(url)
    conn = await _connect(url)
    try:
        await conn.execute("SET default_transaction_read_only = on")
        async with conn.transaction(readonly=True):
            loaded = await load_rows(conn)
            # Recalculate every stored scenario, including ones already in a project.
            all_records = await conn.fetch(_SELECT_ROWS)
    finally:
        await conn.close()

    header = (
        "name\tbcr_societal_before\tbcr_ratepayer_before\tbcr_utility_before"
        "\tbcr_societal_after\tbcr_ratepayer_after\tbcr_utility_after"
    )
    print(header)
    by_id = {row.scenario_id: row for row in loaded.rows}
    try:
        for record in all_records:
            scenario_id = str(record["scenario_id"])
            name = record["name"] if isinstance(record["name"], str) else ""
            route = _decode_route(record["route"], name)
            if route is None:
                raise MigrationError(f"{name}: no route; the save path cannot run.")
            before = ratios_from_results(_decode_json(record["results"]))
            if scenario_id in by_id:
                row = by_id[scenario_id]
                stored = loaded.stored[scenario_id]
            else:
                sending, receiving = route_vertices(route, name)
                row = RowEnds(
                    scenario_id=scenario_id,
                    name=name,
                    user_id=str(record["user_id"]),
                    source=str(record["source"]),
                    created_at=record["created_at"],
                    sending=sending,
                    receiving=receiving,
                    sending_sub=None,
                    receiving_sub=None,
                )
                stored = {
                    "revision": record["revision"],
                    "changes": _as_dict(record["changes"], f"{name} changes"),
                    "results": _decode_json(record["results"]),
                    "defaults_id": record["defaults_id"],
                }
            after = await _recalculate_one(row, route, stored)
            print("\t".join((name, *before, *after)))
    finally:
        await db_module.close_db_pool()


def _parse_mode(argv: list[str] | None) -> str:
    parser = argparse.ArgumentParser(description="Migrate stored scenarios into projects.")
    parser.add_argument("--report", action="store_true", help="Print the plan. Default.")
    parser.add_argument("--apply", action="store_true", help="Write the plan in one transaction.")
    parser.add_argument(
        "--recalculate",
        action="store_true",
        help="Rerun the save path and print ratios before and after.",
    )
    args = parser.parse_args(argv)
    chosen = [
        name
        for name, flag in (
            ("report", args.report),
            ("apply", args.apply),
            ("recalculate", args.recalculate),
        )
        if flag
    ]
    if len(chosen) > 1:
        parser.error("choose only one of --report, --apply, --recalculate")
    return chosen[0] if chosen else "report"


def main(argv: list[str] | None = None) -> None:
    mode = _parse_mode(argv)
    database_url = os.environ.get("FORGE_DATABASE_URL", "").strip()
    if not database_url:
        print("FORGE_DATABASE_URL is not set.", file=sys.stderr)
        raise SystemExit(1)
    print(f"database host: {_host(database_url)}", file=sys.stderr)

    async def _run() -> int:
        if mode == "apply":
            return await apply(database_url)
        if mode == "recalculate":
            await recalculate(database_url)
            return 0
        await report(database_url)
        return 0

    try:
        code = asyncio.run(_run())
    except MigrationError as exc:
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
