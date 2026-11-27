"""Substation footprint lookups for the terminal rule.

``ref.substations.geom`` is EPSG:5070. A footprint counts only when that
geometry is a POLYGON or MULTIPOLYGON. A missing gid, a missing row, or
any other geometry type is not inside a footprint.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse

from . import db as db_module
from .scenarios import _error, require_user

router = APIRouter()

_POLYGON_TYPES = "('ST_Polygon', 'ST_MultiPolygon')"

_FLAGS_SQL = f"""
select
  coalesce((
    select ST_Covers(
             geom,
             ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 5070)
           )
    from ref.substations
    where gid = $3::int
      and ST_GeometryType(geom) in {_POLYGON_TYPES}
  ), false) as sending_inside,
  coalesce((
    select ST_Covers(
             geom,
             ST_Transform(ST_SetSRID(ST_MakePoint($4, $5), 4326), 5070)
           )
    from ref.substations
    where gid = $6::int
      and ST_GeometryType(geom) in {_POLYGON_TYPES}
  ), false) as receiving_inside
"""

_GEOJSON_SQL = f"""
select ST_AsGeoJSON(ST_Transform(geom, 4326)) as geojson
from ref.substations
where gid = $1
  and ST_GeometryType(geom) in {_POLYGON_TYPES}
"""

_INT4_MAX = 2_147_483_647


def _route_end(route: dict, *, last: bool) -> tuple[float, float]:
    coordinates = route["coordinates"]
    vertex = coordinates[-1][-1] if last else coordinates[0][0]
    return (float(vertex[0]), float(vertex[1]))


async def footprint_flags(
    conn,
    route: dict,
    sending_gid: int | None,
    receiving_gid: int | None,
) -> tuple[bool, bool]:
    """Whether each route end lies inside that terminal's polygon footprint.

    One statement checks the first vertex against ``sending_gid`` and the
    last vertex against ``receiving_gid``. Both gids null skips the query.
    A null gid, a missing row, or a non-polygon is false.
    """
    if sending_gid is None and receiving_gid is None:
        return (False, False)

    first = _route_end(route, last=False)
    last = _route_end(route, last=True)
    row = await conn.fetchrow(
        _FLAGS_SQL,
        first[0],
        first[1],
        sending_gid,
        last[0],
        last[1],
        receiving_gid,
    )
    if row is None:
        return (False, False)
    return (bool(row["sending_inside"]), bool(row["receiving_inside"]))


def _decode_geojson(value) -> dict | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode()
    if isinstance(value, str):
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else None
    return None


async def footprint_geojson(conn, gid: int) -> dict | None:
    """The substation polygon in EPSG:4326, or None when it is not a polygon."""
    row = await conn.fetchrow(_GEOJSON_SQL, gid)
    if row is None:
        return None
    return _decode_geojson(row["geojson"])


def _parsed_gid(gid: str) -> int | None:
    # ASCII digits only: str.isdigit() also accepts "²" and other scripts'
    # digits, which int() then rejects. At most 10 digits keeps int() cheap.
    if not (1 <= len(gid) <= 10) or not gid.isascii() or not gid.isdigit():
        return None
    parsed = int(gid)
    if parsed > _INT4_MAX:
        return None
    return parsed


@router.get("/api/substations/{gid}/footprint")
async def get_substation_footprint(
    gid: str,
    _user: dict = Depends(require_user),
) -> JSONResponse:
    """Return one substation footprint. Read-only: no rate-limit slot.

    A gid that is not an integer is 404 ``not_found``. A missing row or a
    non-polygon is 200 with ``footprint: null``.
    """
    parsed = _parsed_gid(gid)
    if parsed is None:
        return _error(
            status.HTTP_404_NOT_FOUND,
            "not_found",
            "Malformed substation gid.",
        )
    pool = db_module.get_db_pool()
    async with pool.acquire() as conn:
        geojson = await footprint_geojson(conn, parsed)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"gid": parsed, "footprint": geojson},
    )
