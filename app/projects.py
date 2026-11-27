"""Project routes: two terminals and the scenarios that connect them.

Writes run inside ``forge_api_transaction``. Creating a project calculates
its first scenario before that transaction opens, then inserts the project,
the scenario, and the base pointer together. A failure in the scenario
checks saves nothing.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse, Response

from . import auth as auth_module
from . import db as db_module
from .models import ProjectCreate, ProjectUpdate, TerminalIn, sanitize_for_json
from .scenarios import (
    _error,
    _rate_limited,
    _row_to_dict,
    insert_scenario,
    prepare_scenario_insert,
    require_user,
)
from .terminals import ProjectTerminals

router = APIRouter()

_PROJECT_COLUMNS = (
    "id, user_id, name, "
    "sending_substation_gid, receiving_substation_gid, "
    "sending_name, receiving_name, "
    "ST_AsGeoJSON(sending_point)::jsonb AS sending_point, "
    "ST_AsGeoJSON(receiving_point)::jsonb AS receiving_point, "
    "base_scenario_id, revision, created_at, updated_at"
)

_NAME_LIMIT = "Project name must be 1–200 characters."
_READ_ONLY = "This project is read-only because it holds a paper scenario."
_NOT_OWNER = "This project belongs to another user."
_NOT_FOUND = "No such project."
_BASE_INVALID = "The base scenario must belong to this project."


def _decode_jsonb(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


def _project_to_dict(record) -> dict:
    row = dict(record)
    for key in ("sending_point", "receiving_point"):
        row[key] = _decode_jsonb(row.get(key))
    for key, value in list(row.items()):
        if isinstance(value, UUID):
            row[key] = str(value)
        elif isinstance(value, datetime):
            row[key] = value.isoformat()
    return sanitize_for_json(row)


def _point_terminal(point: tuple[float, float]) -> dict:
    lon, lat = point
    return {
        "gid": None,
        "name": f"Point at {lat:.4f}, {lon:.4f}",
        "lon": float(lon),
        "lat": float(lat),
    }


def _checked_name(name: str) -> JSONResponse | None:
    if not 1 <= len(name) <= 200:
        return _error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "invalid_changes",
            _NAME_LIMIT,
        )
    return None


async def _fetch_project(conn, project_id: str):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        return None
    return await conn.fetchrow(
        f"select {_PROJECT_COLUMNS} from public.project where id = $1",
        project_uuid,
    )


async def _is_read_only(conn, project_id: UUID) -> bool:
    row = await conn.fetchrow(
        """
        select exists (
            select 1 from public.scenario
            where project_id = $1 and source = 'paper'
        ) as is_paper
        """,
        project_id,
    )
    return bool(row["is_paper"])


async def _resolve_gid(conn, gid: int) -> dict | JSONResponse:
    row = await conn.fetchrow(
        """
        select name,
               ST_X(ST_Transform(ST_Centroid(geom), 4326)) as lon,
               ST_Y(ST_Transform(ST_Centroid(geom), 4326)) as lat
        from ref.substations
        where gid = $1
        """,
        gid,
    )
    if row is None or row["name"] is None or row["name"] == "" or row["lon"] is None:
        return _error(
            status.HTTP_404_NOT_FOUND,
            "not_found",
            "No such substation.",
        )
    return {
        "gid": gid,
        "name": row["name"],
        "lon": float(row["lon"]),
        "lat": float(row["lat"]),
    }


async def _resolve_terminal(conn, terminal: TerminalIn) -> dict | JSONResponse:
    if terminal.point is not None:
        return _point_terminal(terminal.point)
    return await _resolve_gid(conn, terminal.substation_gid)


async def _resolve_pair(user_id: str, payload: ProjectCreate) -> tuple[dict, dict] | JSONResponse:
    """Look up gid terminals. Point terminals need no database round trip."""
    needs_db = (
        payload.sending.substation_gid is not None
        or payload.receiving.substation_gid is not None
    )
    if not needs_db:
        return _point_terminal(payload.sending.point), _point_terminal(payload.receiving.point)

    async with db_module.forge_api_transaction(user_id) as conn:
        sending = await _resolve_terminal(conn, payload.sending)
        if isinstance(sending, JSONResponse):
            return sending
        receiving = await _resolve_terminal(conn, payload.receiving)
        if isinstance(receiving, JSONResponse):
            return receiving
    return sending, receiving


def _with_base(project: dict, scenario_id: UUID | str) -> dict:
    project["base_scenario_id"] = str(scenario_id)
    return project


async def create_project(user_id: str, payload: ProjectCreate) -> JSONResponse:
    resolved = await _resolve_pair(user_id, payload)
    if isinstance(resolved, JSONResponse):
        return resolved
    sending, receiving = resolved

    if sending["lon"] == receiving["lon"] and sending["lat"] == receiving["lat"]:
        return _error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "invalid_changes",
            "The sending and receiving terminals are the same point.",
        )

    name = payload.name if payload.name is not None else f"{sending['name']} → {receiving['name']}"
    name_error = _checked_name(name)
    if name_error is not None:
        return name_error

    prepared = await prepare_scenario_insert(
        user_id,
        payload.scenario,
        ProjectTerminals(
            sending=(sending["lon"], sending["lat"]),
            receiving=(receiving["lon"], receiving["lat"]),
            sending_gid=sending["gid"],
            receiving_gid=receiving["gid"],
        ),
    )
    if isinstance(prepared, JSONResponse):
        return prepared

    async with db_module.forge_api_transaction(user_id) as conn:
        project_record = await conn.fetchrow(
            f"""
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
            returning {_PROJECT_COLUMNS}
            """,
            UUID(user_id),
            name,
            sending["gid"],
            receiving["gid"],
            sending["name"],
            receiving["name"],
            sending["lon"],
            sending["lat"],
            receiving["lon"],
            receiving["lat"],
        )
        scenario_record = await insert_scenario(
            conn, user_id, project_record["id"], prepared
        )
        await conn.fetchrow(
            f"""
            update public.project
            set base_scenario_id = $1
            where id = $2
            returning {_PROJECT_COLUMNS}
            """,
            scenario_record["id"],
            project_record["id"],
        )

    project = _with_base(_project_to_dict(project_record), scenario_record["id"])
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"project": project, "scenario": _row_to_dict(scenario_record)},
    )


async def update_project(user_id: str, project_id: str, payload: ProjectUpdate) -> JSONResponse:
    async with db_module.forge_api_transaction(user_id) as conn:
        existing = await _fetch_project(conn, project_id)
        if existing is None:
            return _error(status.HTTP_404_NOT_FOUND, "not_found", _NOT_FOUND)
        if str(existing["user_id"]) != user_id:
            return _error(status.HTTP_403_FORBIDDEN, "not_owner", _NOT_OWNER)
        if await _is_read_only(conn, existing["id"]):
            return _error(status.HTTP_403_FORBIDDEN, "read_only", _READ_ONLY)

        new_name = existing["name"]
        if "name" in payload.model_fields_set:
            if payload.name is None:
                return _error(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "invalid_changes",
                    _NAME_LIMIT,
                )
            name_error = _checked_name(payload.name)
            if name_error is not None:
                return name_error
            new_name = payload.name

        new_base = existing["base_scenario_id"]
        if "base_scenario_id" in payload.model_fields_set:
            if payload.base_scenario_id is None:
                return _error(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "invalid_changes",
                    _BASE_INVALID,
                )
            try:
                base_uuid = UUID(payload.base_scenario_id)
            except ValueError:
                return _error(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "invalid_changes",
                    _BASE_INVALID,
                )
            owned = await conn.fetchrow(
                """
                select id from public.scenario
                where id = $1 and project_id = $2
                """,
                base_uuid,
                existing["id"],
            )
            if owned is None:
                return _error(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "invalid_changes",
                    _BASE_INVALID,
                )
            new_base = base_uuid

        if not auth_module.rate_limiter.allow_write(user_id):
            return _rate_limited()

        record = await conn.fetchrow(
            f"""
            update public.project
            set name = $1, base_scenario_id = $2, revision = revision + 1
            where id = $3 and revision = $4
            returning {_PROJECT_COLUMNS}
            """,
            new_name,
            new_base,
            existing["id"],
            payload.revision,
        )
        if record is None:
            return _error(
                status.HTTP_409_CONFLICT,
                "stale_revision",
                "Another session changed this project; reload it.",
            )

    return JSONResponse(status_code=status.HTTP_200_OK, content=_project_to_dict(record))


async def delete_project(user_id: str, project_id: str) -> Response:
    async with db_module.forge_api_transaction(user_id) as conn:
        existing = await _fetch_project(conn, project_id)
        if existing is None:
            return _error(status.HTTP_404_NOT_FOUND, "not_found", _NOT_FOUND)
        if str(existing["user_id"]) != user_id:
            return _error(status.HTTP_403_FORBIDDEN, "not_owner", _NOT_OWNER)
        if await _is_read_only(conn, existing["id"]):
            return _error(status.HTTP_403_FORBIDDEN, "read_only", _READ_ONLY)
        if not auth_module.rate_limiter.allow_write(user_id):
            return _rate_limited()
        await conn.execute(
            "delete from public.project where id = $1",
            existing["id"],
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def duplicate_project(user_id: str, project_id: str) -> JSONResponse:
    """Copy the project and its scenarios to ``user_id`` without recalculating."""
    async with db_module.forge_api_transaction(user_id) as conn:
        existing = await _fetch_project(conn, project_id)
        if existing is None:
            return _error(status.HTTP_404_NOT_FOUND, "not_found", _NOT_FOUND)

        copy_name = f"{existing['name']} (copy)"
        name_error = _checked_name(copy_name)
        if name_error is not None:
            return name_error
        if not auth_module.rate_limiter.allow_write(user_id):
            return _rate_limited()

        project_record = await conn.fetchrow(
            f"""
            insert into public.project (
                user_id, name,
                sending_substation_gid, receiving_substation_gid,
                sending_name, receiving_name,
                sending_point, receiving_point
            )
            select
                $1, $2,
                sending_substation_gid, receiving_substation_gid,
                sending_name, receiving_name,
                sending_point, receiving_point
            from public.project
            where id = $3
            returning {_PROJECT_COLUMNS}
            """,
            UUID(user_id),
            copy_name,
            existing["id"],
        )
        sources = await conn.fetch(
            """
            select id
            from public.scenario
            where project_id = $1
            order by created_at, id
            """,
            existing["id"],
        )
        copied = []
        id_map: dict[UUID, UUID] = {}
        for source in sources:
            record = await conn.fetchrow(
                """
                insert into public.scenario (
                    user_id, name, source, defaults_id, changes,
                    results, calculator, inputs_id, computed_at, calc_error,
                    route, segments, layer_releases, project_id, line_selection
                )
                select
                    $1, name, 'manual', defaults_id, changes,
                    results, calculator, inputs_id, computed_at, calc_error,
                    route, segments, layer_releases, $2, line_selection
                from public.scenario
                where id = $3
                returning
                    id, user_id, name, source, defaults_id, changes, results,
                    calculator, inputs_id, computed_at, calc_error, revision,
                    created_at, updated_at,
                    ST_AsGeoJSON(route)::jsonb AS route, segments, layer_releases,
                    line_selection
                """,
                UUID(user_id),
                project_record["id"],
                source["id"],
            )
            id_map[source["id"]] = record["id"]
            copied.append(_row_to_dict(record))

        base_id = existing["base_scenario_id"]
        new_base = id_map.get(base_id) if base_id is not None else None
        if new_base is not None:
            await conn.fetchrow(
                f"""
                update public.project
                set base_scenario_id = $1
                where id = $2
                returning {_PROJECT_COLUMNS}
                """,
                new_base,
                project_record["id"],
            )

    project = _project_to_dict(project_record)
    if new_base is not None:
        project = _with_base(project, new_base)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"project": project, "scenarios": copied},
    )


@router.post("/api/projects", status_code=status.HTTP_201_CREATED)
async def post_project(
    payload: ProjectCreate, user: dict = Depends(require_user)
) -> JSONResponse:
    return await create_project(user["sub"], payload)


@router.patch("/api/projects/{project_id}")
async def patch_project(
    project_id: str, payload: ProjectUpdate, user: dict = Depends(require_user)
) -> JSONResponse:
    return await update_project(user["sub"], project_id, payload)


@router.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_route(project_id: str, user: dict = Depends(require_user)) -> Response:
    return await delete_project(user["sub"], project_id)


@router.post("/api/projects/{project_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def post_duplicate_project(
    project_id: str, user: dict = Depends(require_user)
) -> JSONResponse:
    return await duplicate_project(user["sub"], project_id)
