"""Assemble a corridor selection into a project route."""

from __future__ import annotations

import json
import math
from typing import Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse

from . import auth as auth_module
from . import db as db_module
from .layer_releases import CORRIDORS_RELEASE
from .line_assembly import (
    CONNECTOR_MAX_M,
    AssemblyError,
    Piece,
    add_connectors,
    check_voltage,
    cut_at_stretch,
    order_chain,
    piece_spans_along_chain,
    pieces_beyond_cut,
    prefill,
    validate_stretch_end,
)
from .models import LineAssembleRequest
from .scenarios import _error, _rate_limited, require_user
from .terminals import TERMINAL_FOOTPRINT_MAX_M, TERMINAL_TOLERANCE_M, _end_within_reach

router = APIRouter()

_POLYGON_TYPES = "('ST_Polygon', 'ST_MultiPolygon')"
_MILES_PER_M = 1.0 / 1609.344

_CORRIDORS_SQL = """
select
  gid,
  voltage_kv,
  volt_class,
  sub_1,
  sub_2,
  source,
  ST_Length(geom) as length_m,
  ST_GeometryType(ST_LineMerge(geom)) as geom_type,
  ST_AsGeoJSON(ST_LineMerge(geom))::json as geojson
from ref.corridors
where gid = any($1::int[])
order by gid
"""

_TRANSFORM_TERMINALS_SQL = """
select
  ST_X(ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 5070)) as send_x,
  ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 5070)) as send_y,
  ST_X(ST_Transform(ST_SetSRID(ST_MakePoint($3, $4), 4326), 5070)) as recv_x,
  ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint($3, $4), 4326), 5070)) as recv_y,
  case
    when $5 is null then null
    else ST_X(ST_Transform(ST_SetSRID(ST_MakePoint($5, $6), 4326), 5070))
  end as stretch_x,
  case
    when $5 is null then null
    else ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint($5, $6), 4326), 5070))
  end as stretch_y
"""

_FOOTPRINT_AT_POINTS_SQL = f"""
select
  coalesce((
    select ST_Covers(
             geom,
             ST_SetSRID(ST_MakePoint($1, $2), 5070)
           )
    from ref.substations
    where gid = $3::int
      and ST_GeometryType(geom) in {_POLYGON_TYPES}
  ), false) as sending_inside,
  coalesce((
    select ST_Covers(
             geom,
             ST_SetSRID(ST_MakePoint($4, $5), 5070)
           )
    from ref.substations
    where gid = $6::int
      and ST_GeometryType(geom) in {_POLYGON_TYPES}
  ), false) as receiving_inside
"""

_TO_4326_SQL = """
select ST_AsGeoJSON(
         ST_Transform(
           ST_SetSRID(ST_GeomFromGeoJSON($1::text), 5070),
           4326
         )
       )::json as geojson
"""


def _assembly_message(err: AssemblyError) -> str:
    code = err.code
    d = err.detail
    if code == "unknown_line":
        missing = d.get("gids", [])
        if len(missing) == 1:
            return f"No corridor row for gid {missing[0]}."
        return f"No corridor rows for gids {missing}."
    if code == "line_not_single":
        return f"Corridor gid {d.get('gid')} does not merge to a single line."
    if code == "mixed_voltage":
        return "Selected pieces have different voltages."
    if code == "pieces_not_connected":
        if "gap_m" in d:
            return (
                f"Selected pieces are not connected; the gap is about {d['gap_m']:.0f} m."
            )
        if "stretch_m" in d:
            return f"The stretch point is {d['stretch_m']:.0f} m from the selected line."
        return "Selected pieces are not connected."
    if code == "piece_beyond_stretch":
        return f"Piece {d.get('gid')} lies wholly beyond the stretch cut."
    if code == "invalid_stretch_end":
        return "The stretch point must be the project's receiving terminal."
    if code == "connector_too_long":
        return (
            f"The {d.get('end')} connector is {d['distance_m']:.0f} m; "
            f"the maximum is {CONNECTOR_MAX_M:.0f} m."
        )
    return code


def _assembly_error(err: AssemblyError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": err.code,
                "message": _assembly_message(err),
                "detail": err.detail,
            }
        },
    )


def _decode_geojson(value: Any) -> dict | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode()
    if isinstance(value, str):
        return json.loads(value)
    return None


def _linestring_coords(geojson: dict) -> list[tuple[float, float]]:
    if geojson.get("type") != "LineString":
        return []
    raw = geojson.get("coordinates") or []
    return [(float(c[0]), float(c[1])) for c in raw]


def _dist_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _reaches(
    end: tuple[float, float],
    terminal: tuple[float, float],
    inside_footprint: bool,
) -> bool:
    return _end_within_reach(
        _dist_m(end, terminal),
        tolerance_m=TERMINAL_TOLERANCE_M,
        inside_footprint=inside_footprint,
        footprint_max_m=TERMINAL_FOOTPRINT_MAX_M,
    )


async def _footprint_flags_5070(
    conn,
    chain_start: tuple[float, float],
    chain_end: tuple[float, float],
    sending_gid: int | None,
    receiving_gid: int | None,
) -> tuple[bool, bool]:
    if sending_gid is None and receiving_gid is None:
        return (False, False)
    row = await conn.fetchrow(
        _FOOTPRINT_AT_POINTS_SQL,
        chain_start[0],
        chain_start[1],
        sending_gid,
        chain_end[0],
        chain_end[1],
        receiving_gid,
    )
    if row is None:
        return (False, False)
    return (bool(row["sending_inside"]), bool(row["receiving_inside"]))


async def _to_4326_line(conn, coords_5070: list[tuple[float, float]]) -> list[list[float]]:
    payload = {
        "type": "LineString",
        "coordinates": [[x, y] for x, y in coords_5070],
    }
    row = await conn.fetchrow(_TO_4326_SQL, json.dumps(payload))
    geo = _decode_geojson(row["geojson"]) if row else None
    if not geo or geo.get("type") != "LineString":
        return [[x, y] for x, y in coords_5070]
    return [[float(c[0]), float(c[1])] for c in geo["coordinates"]]


async def assemble_line(user_id: str, payload: LineAssembleRequest) -> JSONResponse:
    """Fetch corridor pieces, assemble in EPSG:5070, return route in EPSG:4326."""
    async with db_module.forge_api_transaction(user_id) as conn:
        try:
            return await _assemble_with_conn(conn, payload)
        except AssemblyError as exc:
            return _assembly_error(exc)


async def _assemble_with_conn(conn, payload: LineAssembleRequest) -> JSONResponse:
    validate_stretch_end(
        payload.stretch_end,
        payload.receiving,
        payload.receiving_gid,
    )
    rows = await conn.fetch(_CORRIDORS_SQL, payload.gids)
    by_gid = {int(row["gid"]): row for row in rows}
    missing = [gid for gid in payload.gids if gid not in by_gid]
    if missing:
        raise AssemblyError("unknown_line", {"gids": missing})

    raw_pieces: list[Piece] = []
    meta: dict[int, dict] = {}
    is_dc = False
    for gid in payload.gids:
        row = by_gid[gid]
        geom_type = str(row["geom_type"] or "")
        if geom_type != "ST_LineString":
            raise AssemblyError("line_not_single", {"gid": gid})
        geojson = _decode_geojson(row["geojson"])
        if not geojson:
            raise AssemblyError("line_not_single", {"gid": gid})
        coords = _linestring_coords(geojson)
        if len(coords) < 2:
            raise AssemblyError("line_not_single", {"gid": gid})
        raw_pieces.append(
            Piece(
                gid=gid,
                coords=coords,
                voltage_kv=row["voltage_kv"],
            )
        )
        meta[gid] = row
        if str(row.get("volt_class") or "").upper() == "DC":
            is_dc = True

    stretch = payload.stretch_end
    terminal_row = await conn.fetchrow(
        _TRANSFORM_TERMINALS_SQL,
        payload.sending[0],
        payload.sending[1],
        payload.receiving[0],
        payload.receiving[1],
        stretch[0] if stretch else None,
        stretch[1] if stretch else None,
    )
    if terminal_row is None:
        raise AssemblyError("pieces_not_connected", {})

    sending_5070 = (float(terminal_row["send_x"]), float(terminal_row["send_y"]))
    receiving_5070 = (float(terminal_row["recv_x"]), float(terminal_row["recv_y"]))
    stretch_5070: tuple[float, float] | None = None
    if stretch is not None:
        stretch_5070 = (float(terminal_row["stretch_x"]), float(terminal_row["stretch_y"]))

    voltage_kv = check_voltage(raw_pieces)
    chain = order_chain(raw_pieces, sending_5070)
    spans = piece_spans_along_chain(raw_pieces, sending_5070)

    if stretch_5070 is not None:
        chain = cut_at_stretch(chain, stretch_5070)
        cut_len = sum(
            math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1])
            for i in range(len(chain) - 1)
        )
        pieces_beyond_cut(spans, cut_len)

    inside_sending, inside_receiving = await _footprint_flags_5070(
        conn,
        chain[0],
        chain[-1],
        payload.sending_gid,
        payload.receiving_gid,
    )
    sending_reaches = _reaches(chain[0], sending_5070, inside_sending)
    receiving_reaches = _reaches(chain[-1], receiving_5070, inside_receiving)

    receiving_connector = None if stretch_5070 is not None else receiving_5070
    if stretch_5070 is not None:
        receiving_reaches = True

    final_chain, connectors_5070 = add_connectors(
        chain,
        sending_5070,
        receiving_connector,
        sending_reaches=sending_reaches,
        receiving_reaches=receiving_reaches,
    )

    route_4326 = await _to_4326_line(conn, final_chain)
    connectors_out: list[dict] = []
    for conn_info in connectors_5070:
        ends_5070 = [
            (float(conn_info["coordinates"][0][0]), float(conn_info["coordinates"][0][1])),
            (float(conn_info["coordinates"][1][0]), float(conn_info["coordinates"][1][1])),
        ]
        ends_4326 = await _to_4326_line(conn, ends_5070)
        connectors_out.append(
            {
                "end": conn_info["end"],
                "length_m": float(conn_info["length_m"]),
                "coordinates": ends_4326,
            }
        )

    ordered_gids = [gid for gid, _, _ in spans]
    pieces_out: list[dict] = []
    for gid in ordered_gids:
        row = meta[gid]
        length_m = float(row["length_m"])
        pieces_out.append(
            {
                "gid": gid,
                "voltage_kv": row["voltage_kv"],
                "sub_1": row["sub_1"],
                "sub_2": row["sub_2"],
                "source": row["source"],
                "miles": length_m * _MILES_PER_M,
            }
        )

    body = {
        "route": {"type": "MultiLineString", "coordinates": [route_4326]},
        "connectors": connectors_out,
        "pieces": pieces_out,
        "prefill": prefill(voltage_kv, is_dc),
        "corridors_release": CORRIDORS_RELEASE,
    }
    return JSONResponse(status_code=status.HTTP_200_OK, content=body)


@router.post("/api/lines/assemble")
async def post_lines_assemble(
    payload: LineAssembleRequest,
    user: dict = Depends(require_user),
) -> JSONResponse:
    if not auth_module.rate_limiter.allow_write(user["sub"]):
        return _rate_limited()
    return await assemble_line(user["sub"], payload)