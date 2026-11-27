"""Scenario CRUD routes: server-owned persistence, calculated on every save.

Only the `forge_api` role writes `scenario` rows (see `app/db.py` and
`supabase/migrations/`), and only for the row's own owner. Every write here
opens a `forge_api_transaction(user_id)` so Postgres's row-level security
policies enforce ownership even if a check below has a bug. The app-level
ownership check still runs first so the server can tell the caller *why* a
write was refused (`not_owner` vs `not_found`) instead of RLS silently
affecting zero rows.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import forge
import jwt
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from forge.errors import CalculationError, InvalidInputs, UnknownInputPath
from pydantic import ValidationError

from . import auth as auth_module
from . import db as db_module
from .models import ScenarioCreate, ScenarioUpdate, sanitize_for_json
from .route import ROUTE_REQUIRED, RouteGeometry, run_route_analysis
from .terminals import TerminalMismatch, mismatch_message, snap_route_to_terminals

logger = logging.getLogger(__name__)

router = APIRouter()

# Computed once at import time, same as app/main.py: the calculator's
# identity and defaults don't change at runtime.
_CALCULATOR_INFO = forge.calculator_info()
_DEFAULTS_ID = forge.get_defaults_id()

# `route` is a PostGIS geometry. Read it back as GeoJSON, never hex EWKB.
# Used in SELECT and RETURNING only — never as an INSERT column list.
_SCENARIO_COLUMNS = (
    "id, user_id, name, source, defaults_id, changes, results, calculator, "
    "inputs_id, computed_at, calc_error, revision, created_at, updated_at, "
    "ST_AsGeoJSON(route)::jsonb AS route, segments, layer_releases, project_id"
)

_security = HTTPBearer(auto_error=False)


# --- Auth dependency ---------------------------------------------------------
#
# Scenario routes always require a real Supabase token: "All new routes
# require a valid token" (server-owned-persistence-and-security-design.md).
# Unlike app/main.py's `require_auth`, there is no FORGE_AUTH_DISABLED bypass
# here, because a write needs a real user id to own the row under RLS.
#
# Raises `ScenarioAuthError` (not `HTTPException`) so the response follows
# this module's `{"error": {"code", "message"}}` envelope rather than
# FastAPI's default `{"detail": ...}` shape. `app/main.py` registers the
# exception handler that turns it into a 401.


class ScenarioAuthError(Exception):
    def __init__(self, message: str = "Missing, expired, or foreign token.") -> None:
        self.message = message
        super().__init__(message)


async def require_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_security),
) -> dict:
    """Verify a Supabase JWT via `app.auth.verify_token`. Raises on any failure."""
    supabase_url = os.environ.get("SUPABASE_URL", "")
    if not supabase_url or cred is None:
        raise ScenarioAuthError()
    try:
        return auth_module.verify_token(f"Bearer {cred.credentials}", supabase_url=supabase_url)
    except jwt.PyJWTError as exc:
        raise ScenarioAuthError(str(exc)) from exc


# --- Error envelope ----------------------------------------------------------


def _error(
    status_code: int,
    code: str,
    message: str,
    paths: list[str] | None = None,
    *,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if paths is not None:
        body["error"]["paths"] = paths
    return JSONResponse(status_code=status_code, content=body, headers=headers)


def _rate_limited() -> JSONResponse:
    return _error(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "rate_limited",
        "Too many requests; try again shortly.",
        headers={"Retry-After": "60"},
    )


# --- Row (de)serialization ----------------------------------------------------
#
# asyncpg returns jsonb columns as raw JSON text (no codec is registered on
# the pool), so jsonb columns are decoded on read and the caller passes
# json.dumps() strings (cast with ::jsonb) on write.


def _decode_jsonb(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


def _row_to_dict(record) -> dict:
    row = dict(record)
    # asyncpg has no jsonb codec, so route and segments may arrive as text.
    for key in ("changes", "results", "calculator", "route", "segments", "layer_releases"):
        row[key] = _decode_jsonb(row.get(key))
    for key, value in list(row.items()):
        if isinstance(value, UUID):
            row[key] = str(value)
    for key in ("computed_at", "created_at", "updated_at"):
        value = row.get(key)
        if isinstance(value, datetime):
            row[key] = value.isoformat()
    return sanitize_for_json(row)


async def _fetch_scenario(conn, scenario_id: str):
    """Select a scenario by id, as any owner (forge_api may select every row).

    Returns None for a missing row or a malformed id, so callers can treat
    both as 404 `not_found`.
    """
    try:
        scenario_uuid = UUID(scenario_id)
    except ValueError:
        return None
    return await conn.fetchrow(
        f"select {_SCENARIO_COLUMNS} from public.scenario where id = $1",
        scenario_uuid,
    )


_PROJECT_REQUIRED = "project_id is required"
_READ_ONLY = "This project is read-only because it holds a paper scenario."
_LAST_SCENARIO = "A project must keep at least one scenario."
_NOT_OWNER_PROJECT = "This project belongs to another user."
_NOT_FOUND_PROJECT = "No such project."
_NAME_LIMIT = "Scenario name must be 1–200 characters."


def generate_scenario_name(base_name: str, existing_names: list[str]) -> str:
    """Port of the frontend ``generateScenarioName`` rule.

    The duplicate name is ``"<name> (2)"``, then ``"(3)"``, among the names
    already in the project. The source name is one of those names, so the
    first copy is ``"<name> (2)"``.
    """
    if base_name not in existing_names:
        return base_name
    counter = 2
    while f"{base_name} ({counter})" in existing_names:
        counter += 1
    return f"{base_name} ({counter})"


def _terminal_pair(project) -> tuple[tuple[float, float], tuple[float, float]]:
    return (
        (float(project["sending_lon"]), float(project["sending_lat"])),
        (float(project["receiving_lon"]), float(project["receiving_lat"])),
    )


async def _fetch_project_points(conn, project_id: UUID):
    return await conn.fetchrow(
        """
        select id, user_id, base_scenario_id,
               ST_X(sending_point) as sending_lon,
               ST_Y(sending_point) as sending_lat,
               ST_X(receiving_point) as receiving_lon,
               ST_Y(receiving_point) as receiving_lat
        from public.project
        where id = $1
        """,
        project_id,
    )


async def _project_is_read_only(conn, project_id: UUID) -> bool:
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


async def _require_writable_project(conn, user_id: str, project_id: UUID | None):
    """The project the caller may write, or an error response.

    Owner is checked before the paper rule, matching ``app.projects``.
    """
    if project_id is None:
        return _error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "invalid_changes",
            _PROJECT_REQUIRED,
        )
    project = await _fetch_project_points(conn, project_id)
    if project is None:
        return _error(status.HTTP_404_NOT_FOUND, "not_found", _NOT_FOUND_PROJECT)
    if str(project["user_id"]) != user_id:
        return _error(status.HTTP_403_FORBIDDEN, "not_owner", _NOT_OWNER_PROJECT)
    if await _project_is_read_only(conn, project["id"]):
        return _error(status.HTTP_403_FORBIDDEN, "read_only", _READ_ONLY)
    return project


# --- Calculation ---------------------------------------------------------------


def _calculate(name: str, changes: dict) -> tuple[dict | None, JSONResponse | None]:
    """Resolve `changes` against the deployed defaults and run the calculator.

    Returns `(calc_fields, None)` on success or calculator failure (both save
    the row — see module docstring), or `(None, error_response)` when the
    changes themselves are invalid, in which case nothing is saved.

    `calc_fields` holds `results`, `calculator`, `inputs_id`, `computed_at`,
    and `calc_error`, ready to merge into an insert or update.
    """
    try:
        resolved = forge.resolve_inputs(changes)
    except UnknownInputPath as exc:
        return None, _error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "invalid_changes",
            "One or more changes failed validation.",
            paths=exc.paths,
        )
    except InvalidInputs as exc:
        return None, _error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "invalid_changes",
            str(exc),
        )

    try:
        raw_results = forge.run_calculation(resolved, scenario_id=name)
    except InvalidInputs as exc:
        return {
            "results": None,
            "calculator": None,
            "inputs_id": None,
            "computed_at": None,
            "calc_error": str(exc),
        }, None
    except CalculationError as exc:
        logger.warning("Calculator failed for scenario %r: %s", name, exc, exc_info=True)
        return {
            "results": None,
            "calculator": None,
            "inputs_id": None,
            "computed_at": None,
            "calc_error": str(exc),
        }, None

    inputs_id = (raw_results.get("provenance") or {}).get("inputs_id")
    return {
        "results": sanitize_for_json(raw_results),
        "calculator": _CALCULATOR_INFO,
        "inputs_id": inputs_id,
        "computed_at": datetime.now(UTC),
        "calc_error": None,
    }, None


def _jsonb_param(value: Any) -> str | None:
    return json.dumps(value) if value is not None else None


def _geojson_param(value: dict | None) -> str | None:
    """GeoJSON text for ``ST_GeomFromGeoJSON``. SQL NULL when the route is absent.

    ``json.dumps(None)`` is the string ``"null"``, which PostGIS rejects.
    A Python ``None`` parameter is SQL NULL, and ``ST_GeomFromGeoJSON(NULL)``
    stores a null geometry.
    """
    return json.dumps(value) if value is not None else None


# --- Route measurement ---------------------------------------------------------


def _route_required() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": ROUTE_REQUIRED},
    )


def _checked_route(route: dict | None) -> RouteGeometry | JSONResponse:
    """Same acceptance rule as ``calculate_forge``: a MultiLineString, or 422."""
    if route is None:
        return _route_required()
    try:
        return RouteGeometry.model_validate(route)
    except ValidationError:
        return _route_required()


def _checked_width(row_width_ft: float | None) -> float | JSONResponse:
    if row_width_ft is None or row_width_ft <= 0:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": "row_width_ft must be positive"},
        )
    return row_width_ft


def _prepare_route(
    route: dict | None, row_width_ft: float | None
) -> tuple[RouteGeometry, float] | JSONResponse:
    geometry = _checked_route(route)
    if isinstance(geometry, JSONResponse):
        return geometry
    width = _checked_width(row_width_ft)
    if isinstance(width, JSONResponse):
        return width
    return geometry, width


def _route_to_measure(
    payload_route: dict | None, route_was_sent: bool, stored: Any
) -> dict | None:
    """Sent route, including an explicit null; otherwise the stored GeoJSON.

    Used only while recalculating. An explicit null stays None so
    ``_checked_route`` rejects it instead of measuring the stored line.
    """
    if route_was_sent:
        return payload_route
    stored_route = _decode_jsonb(stored)
    if isinstance(stored_route, dict):
        return stored_route
    return None


async def _measure_changes(
    geometry: RouteGeometry, row_width_ft: float, changes: dict
) -> tuple[dict, Any] | JSONResponse:
    """Run analysis and overwrite typed changes with measured miles."""
    analyzed = await run_route_analysis(geometry, row_width_ft)
    if analyzed.status_code != 200:
        return analyzed
    body = json.loads(analyzed.body)
    measured = body.get("changes") or {}
    return {**changes, **measured}, body.get("layer_releases")


# --- Business logic ------------------------------------------------------------


async def prepare_scenario_insert(
    user_id: str,
    payload: ScenarioCreate,
    terminals: tuple[tuple[float, float], tuple[float, float]] | None,
) -> dict | JSONResponse:
    """Run every create check and return the values an insert needs.

    Check order matches the historical ``create_scenario`` path: stale
    defaults, route shape, row width, then (only when ``terminals`` is set)
    the terminal snap, then write and calculation rate limits, route
    analysis, and the calculator. A missing route, a non-positive width,
    stale defaults, or a terminal mismatch never burns a rate-limit slot.

    ``terminals`` is ``(sending, receiving)`` as ``(lon, lat)``. When it is
    set, the returned route is the snapped copy. ``None`` leaves the route
    unchanged, which is how a scenario create with no project still behaves.
    """
    if payload.defaults_id != _DEFAULTS_ID:
        return _error(
            status.HTTP_409_CONFLICT,
            "stale_defaults",
            "The deployed calculator's defaults have changed; refetch /api/defaults.",
        )

    prepared = _prepare_route(payload.route, payload.row_width_ft)
    if isinstance(prepared, JSONResponse):
        return prepared
    geometry, row_width_ft = prepared
    route_value = payload.route

    if terminals is not None:
        snapped = snap_route_to_terminals(payload.route, terminals[0], terminals[1])
        if isinstance(snapped, TerminalMismatch):
            return _error(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "route_terminals_mismatch",
                mismatch_message(snapped),
            )
        route_value = snapped
        geometry = RouteGeometry.model_validate(snapped)

    if not auth_module.rate_limiter.allow_write(user_id):
        return _rate_limited()
    if not auth_module.rate_limiter.allow_calculation(user_id):
        return _rate_limited()

    measured = await _measure_changes(geometry, row_width_ft, payload.changes)
    if isinstance(measured, JSONResponse):
        return measured
    changes, releases = measured

    calc_fields, error_response = _calculate(payload.name, changes)
    if error_response is not None:
        return error_response

    return {
        "name": payload.name,
        "source": payload.source,
        "defaults_id": payload.defaults_id,
        "changes": changes,
        "results": calc_fields["results"],
        "calculator": calc_fields["calculator"],
        "inputs_id": calc_fields["inputs_id"],
        "computed_at": calc_fields["computed_at"],
        "calc_error": calc_fields["calc_error"],
        "route": route_value,
        "segments": payload.segments,
        "layer_releases": releases,
    }


async def insert_scenario(
    conn,
    user_id: str,
    project_id: UUID | None,
    values: dict,
):
    """Insert one scenario on an open ``forge_api`` transaction.

    ``project_id`` may be null so a caller can still insert without one.
    ``POST /api/scenarios`` does not: it requires a project the caller owns.
    Creating a project passes the new project's id and ignores any
    ``project_id`` on the nested scenario body. Argument order through
    ``layer_releases`` matches the pre-project insert so existing route
    tests keep their positions.
    """
    return await conn.fetchrow(
        f"""
        insert into public.scenario
            (user_id, name, source, defaults_id, changes,
             results, calculator, inputs_id, computed_at, calc_error,
             route, segments, layer_releases, project_id)
        values
            ($1, $2, $3, $4, $5::jsonb,
             $6::jsonb, $7::jsonb, $8, $9, $10,
             ST_SetSRID(ST_GeomFromGeoJSON($11::text), 4326), $12::jsonb,
             $13::jsonb, $14)
        returning {_SCENARIO_COLUMNS}
        """,
        UUID(user_id),
        values["name"],
        values["source"],
        values["defaults_id"],
        json.dumps(values["changes"]),
        _jsonb_param(values["results"]),
        _jsonb_param(values["calculator"]),
        values["inputs_id"],
        values["computed_at"],
        values["calc_error"],
        _geojson_param(values["route"]),
        _jsonb_param(values["segments"]),
        _jsonb_param(values["layer_releases"]),
        project_id,
    )


async def create_scenario(user_id: str, payload: ScenarioCreate) -> JSONResponse:
    """Insert a scenario into a project the caller owns.

    ``project_id`` is required. The project's terminal rule runs inside
    ``prepare_scenario_insert``. A paper project is read-only. The nested
    scenario on ``POST /api/projects`` does not come through here; that
    path assigns the new project id itself.
    """
    if not payload.project_id:
        return _error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "invalid_changes",
            _PROJECT_REQUIRED,
        )
    try:
        project_uuid = UUID(payload.project_id)
    except ValueError:
        return _error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "invalid_changes",
            _PROJECT_REQUIRED,
        )

    async with db_module.forge_api_transaction(user_id) as conn:
        project = await _require_writable_project(conn, user_id, project_uuid)
        if isinstance(project, JSONResponse):
            return project
        terminals = _terminal_pair(project)

    prepared = await prepare_scenario_insert(user_id, payload, terminals)
    if isinstance(prepared, JSONResponse):
        return prepared

    async with db_module.forge_api_transaction(user_id) as conn:
        record = await insert_scenario(conn, user_id, project_uuid, prepared)

    return JSONResponse(status_code=status.HTTP_201_CREATED, content=_row_to_dict(record))


async def update_scenario(user_id: str, scenario_id: str, payload: ScenarioUpdate) -> JSONResponse:
    """Update the caller's scenario, racing safely against concurrent PATCHes.

    Check order: auth (the route's dependency) -> stale_defaults -> fetch row
    -> not_found -> not_owner -> project (missing, not owner, read-only) ->
    terminal rule when a route geometry is sent -> route and row width when
    the caller sent changes or defaults_id -> rate limit -> route analysis ->
    calculate -> save. A name-only PATCH does not analyze the route or assign
    layer_releases. A sent route is snapped to the project's terminals before
    it is measured or stored. ``project_id`` in the body is not a field on
    ``ScenarioUpdate``, so it cannot change the row. A recalculating save
    with the route key omitted measures the stored line and does not assign
    ``route``. A recalculating save that sends ``route: null`` returns 422
    and leaves the row unchanged. A request that was always going to be
    rejected (unknown defaults, missing row, wrong owner, read-only project,
    terminal mismatch, missing route, non-positive width) never burns a
    rate-limit slot.

    The SELECT is its own transaction. It ends once not_found and not_owner
    have been applied and the fields the rest of this function needs are
    copied off the row. Route and width checks, rate limits, route analysis,
    and calculation then run with no scenario connection held: analysis
    acquires a second connection from the same pool, and holding the first
    across that acquire deadlocks the pool once enough PATCHes overlap. A
    second transaction runs only the UPDATE.

    `revision` is enforced as a compare-and-swap in the UPDATE's WHERE
    clause (`revision = $old_revision`), not by a separate SELECT-then-compare
    check beforehand: two concurrent PATCHes that both read the same
    `revision` and both pass an earlier, non-atomic comparison would otherwise
    both proceed to UPDATE, and the second would silently clobber the first.
    The database serializes the two UPDATEs; whichever commits first advances
    `revision`, and the other's WHERE clause then matches zero rows, which is
    how its 409 `stale_revision` is detected.
    """
    if payload.defaults_id is not None and payload.defaults_id != _DEFAULTS_ID:
        return _error(
            status.HTTP_409_CONFLICT,
            "stale_defaults",
            "The deployed calculator's defaults have changed; refetch /api/defaults.",
        )

    async with db_module.forge_api_transaction(user_id) as conn:
        existing = await _fetch_scenario(conn, scenario_id)
        if existing is None:
            return _error(status.HTTP_404_NOT_FOUND, "not_found", "No such scenario.")
        if str(existing["user_id"]) != user_id:
            return _error(status.HTTP_403_FORBIDDEN, "not_owner", "This scenario belongs to another user.")
        project = await _require_writable_project(conn, user_id, existing["project_id"])
        if isinstance(project, JSONResponse):
            return project
        terminals = _terminal_pair(project)
        # Copied before this transaction ends. Later steps must not touch the
        # row or the connection: route analysis acquires its own.
        stored = {
            "id": existing["id"],
            "user_id": existing["user_id"],
            "name": existing["name"],
            "defaults_id": existing["defaults_id"],
            "changes": existing["changes"],
            "route": existing["route"],
            "results": existing["results"],
            "calculator": existing["calculator"],
            "inputs_id": existing["inputs_id"],
            "computed_at": existing["computed_at"],
            "calc_error": existing["calc_error"],
            "revision": existing["revision"],
        }

    recalculate = (
        "changes" in payload.model_fields_set or "defaults_id" in payload.model_fields_set
    )
    new_name = payload.name if payload.name is not None else stored["name"]
    new_defaults_id = (
        payload.defaults_id if payload.defaults_id is not None else stored["defaults_id"]
    )
    new_changes = (
        payload.changes if payload.changes is not None else _decode_jsonb(stored["changes"])
    )

    route_was_sent = "route" in payload.model_fields_set
    snapped_route: dict | None = None
    if route_was_sent and payload.route is not None:
        snapped = snap_route_to_terminals(payload.route, terminals[0], terminals[1])
        if isinstance(snapped, TerminalMismatch):
            return _error(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "route_terminals_mismatch",
                mismatch_message(snapped),
            )
        snapped_route = snapped

    prepared: tuple[RouteGeometry, float] | None = None
    if recalculate:
        if route_was_sent:
            measure_route = snapped_route if snapped_route is not None else payload.route
        else:
            measure_route = _route_to_measure(None, False, stored["route"])
        prepared_route = _prepare_route(measure_route, payload.row_width_ft)
        if isinstance(prepared_route, JSONResponse):
            return prepared_route
        prepared = prepared_route

    if not auth_module.rate_limiter.allow_write(user_id):
        return _rate_limited()

    releases = None
    if recalculate:
        assert prepared is not None
        geometry, row_width_ft = prepared
        if not auth_module.rate_limiter.allow_calculation(user_id):
            return _rate_limited()
        measured = await _measure_changes(geometry, row_width_ft, new_changes)
        if isinstance(measured, JSONResponse):
            return measured
        new_changes, releases = measured
        calc_fields, error_response = _calculate(new_name, new_changes)
        if error_response is not None:
            return error_response
    else:
        # Name-only update: keep whatever results/calc_error are already stored.
        calc_fields = {
            "results": _decode_jsonb(stored["results"]),
            "calculator": _decode_jsonb(stored["calculator"]),
            "inputs_id": stored["inputs_id"],
            "computed_at": stored["computed_at"],
            "calc_error": stored["calc_error"],
        }

    assignments = [
        "name = $1",
        "defaults_id = $2",
        "changes = $3::jsonb",
        "results = $4::jsonb",
        "calculator = $5::jsonb",
        "inputs_id = $6",
        "computed_at = $7",
        "calc_error = $8",
    ]
    params: list[Any] = [
        new_name,
        new_defaults_id,
        json.dumps(new_changes),
        _jsonb_param(calc_fields["results"]),
        _jsonb_param(calc_fields["calculator"]),
        calc_fields["inputs_id"],
        calc_fields["computed_at"],
        calc_fields["calc_error"],
    ]
    # Only fields the caller sent. A name-only PATCH must not null the route.
    # A sent geometry is the snapped copy, so every scenario shares the
    # project's exact ends. An explicit null still clears the column.
    if route_was_sent:
        to_store = snapped_route if snapped_route is not None else payload.route
        params.append(_geojson_param(to_store))
        assignments.append(
            f"route = ST_SetSRID(ST_GeomFromGeoJSON(${len(params)}::text), 4326)"
        )
    if "segments" in payload.model_fields_set:
        params.append(_jsonb_param(payload.segments))
        assignments.append(f"segments = ${len(params)}::jsonb")
    if recalculate:
        params.append(_jsonb_param(releases))
        assignments.append(f"layer_releases = ${len(params)}::jsonb")
    assignments.append("revision = revision + 1")
    params.append(stored["id"])
    id_param = len(params)
    params.append(payload.revision)
    revision_param = len(params)

    async with db_module.forge_api_transaction(user_id) as conn:
        record = await conn.fetchrow(
            f"""
            update public.scenario
            set {", ".join(assignments)}
            where id = ${id_param} and revision = ${revision_param}
            returning {_SCENARIO_COLUMNS}
            """,
            *params,
        )
        if record is None:
            return _error(
                status.HTTP_409_CONFLICT,
                "stale_revision",
                "Another session changed this scenario; reload it.",
            )

    return JSONResponse(status_code=status.HTTP_200_OK, content=_row_to_dict(record))


async def delete_scenario(user_id: str, scenario_id: str) -> Response:
    """Delete one scenario. The project's last scenario cannot be deleted.

    When the deleted row is the base, the oldest remaining scenario
    (``order by created_at, id``) becomes the base in this same transaction,
    before the delete, so ``on delete set null`` does not clear it.
    ``revision`` advances with that pointer so a concurrent project PATCH
    cannot write the deleted id back.
    """
    async with db_module.forge_api_transaction(user_id) as conn:
        existing = await _fetch_scenario(conn, scenario_id)
        if existing is None:
            return _error(status.HTTP_404_NOT_FOUND, "not_found", "No such scenario.")
        if str(existing["user_id"]) != user_id:
            return _error(status.HTTP_403_FORBIDDEN, "not_owner", "This scenario belongs to another user.")
        project = await _require_writable_project(conn, user_id, existing["project_id"])
        if isinstance(project, JSONResponse):
            return project

        remaining = await conn.fetch(
            """
            select id
            from public.scenario
            where project_id = $1 and id <> $2
            order by created_at, id
            """,
            project["id"],
            existing["id"],
        )
        if not remaining:
            return _error(
                status.HTTP_409_CONFLICT,
                "last_scenario",
                _LAST_SCENARIO,
            )
        if not auth_module.rate_limiter.allow_write(user_id):
            return _rate_limited()

        base_id = project["base_scenario_id"]
        if base_id is not None and str(base_id) == str(existing["id"]):
            await conn.execute(
                """
                update public.project
                set base_scenario_id = $1, revision = revision + 1
                where id = $2
                """,
                remaining[0]["id"],
                project["id"],
            )
        await conn.execute("delete from public.scenario where id = $1", existing["id"])

    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def duplicate_scenario(user_id: str, scenario_id: str) -> JSONResponse:
    """Copy one scenario inside its project. Results are copied, not recalculated.

    The name follows ``generate_scenario_name`` against names in that project
    only. A non-owner gets ``not_owner``. A paper project is read-only; the
    caller duplicates the project instead.
    """
    async with db_module.forge_api_transaction(user_id) as conn:
        existing = await _fetch_scenario(conn, scenario_id)
        if existing is None:
            return _error(status.HTTP_404_NOT_FOUND, "not_found", "No such scenario.")
        if str(existing["user_id"]) != user_id:
            return _error(status.HTTP_403_FORBIDDEN, "not_owner", "This scenario belongs to another user.")
        project = await _require_writable_project(conn, user_id, existing["project_id"])
        if isinstance(project, JSONResponse):
            return project

        name_rows = await conn.fetch(
            """
            select name
            from public.scenario
            where project_id = $1
            """,
            project["id"],
        )
        new_name = generate_scenario_name(
            existing["name"],
            [row["name"] for row in name_rows],
        )
        if not 1 <= len(new_name) <= 200:
            return _error(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "invalid_changes",
                _NAME_LIMIT,
            )
        if not auth_module.rate_limiter.allow_write(user_id):
            return _rate_limited()

        record = await conn.fetchrow(
            f"""
            insert into public.scenario (
                user_id, name, source, defaults_id, changes,
                results, calculator, inputs_id, computed_at, calc_error,
                route, segments, layer_releases, project_id
            )
            select
                user_id, $2, 'manual', defaults_id, changes,
                results, calculator, inputs_id, computed_at, calc_error,
                route, segments, layer_releases, project_id
            from public.scenario
            where id = $1
            returning {_SCENARIO_COLUMNS}
            """,
            existing["id"],
            new_name,
        )
        if record is None:
            return _error(status.HTTP_404_NOT_FOUND, "not_found", "No such scenario.")

    return JSONResponse(status_code=status.HTTP_201_CREATED, content=_row_to_dict(record))


# --- Routes --------------------------------------------------------------------


@router.post("/api/scenarios", status_code=status.HTTP_201_CREATED)
async def post_scenario(payload: ScenarioCreate, user: dict = Depends(require_user)) -> JSONResponse:
    return await create_scenario(user["sub"], payload)


@router.patch("/api/scenarios/{scenario_id}")
async def patch_scenario(
    scenario_id: str, payload: ScenarioUpdate, user: dict = Depends(require_user)
) -> JSONResponse:
    return await update_scenario(user["sub"], scenario_id, payload)


@router.delete("/api/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario_route(scenario_id: str, user: dict = Depends(require_user)) -> Response:
    return await delete_scenario(user["sub"], scenario_id)


@router.post("/api/scenarios/{scenario_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def post_duplicate_scenario(
    scenario_id: str, user: dict = Depends(require_user)
) -> JSONResponse:
    return await duplicate_scenario(user["sub"], scenario_id)
