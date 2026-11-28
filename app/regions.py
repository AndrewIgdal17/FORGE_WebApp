"""NERC regional entities: the region codes and the region shapes endpoint."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from . import db as db_module

router = APIRouter()

REGION_CODES: tuple[str, ...] = ("WECC", "TRE", "MRO", "NPCC", "RF", "SERC")

REGION_NAMES: dict[str, str] = {
    "WECC": "WECC",
    "TRE": "Texas RE",
    "MRO": "MRO",
    "NPCC": "NPCC",
    "RF": "ReliabilityFirst",
    "SERC": "SERC",
}

_REGION_ORDER: dict[str, int] = {code: i for i, code in enumerate(REGION_CODES)}

# A terminal must lie this close to the union of the ticked regions (EPSG:5070 metres).
REGION_TOLERANCE_M = 25000
# The suggestion is the nearest unticked region within this distance.
REGION_SUGGEST_MAX_M = 100000

# One row per terminal, sending first. ticked_m is the distance to the nearest
# ticked region (null when no ticked region exists). suggested_code is the
# nearest unticked region within REGION_SUGGEST_MAX_M (null when none is).
_TERMINAL_CHECK_SQL = """
with ends(end_name, pt) as (
  values
    ('sending'::text,
     ST_Transform(ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326), 5070)),
    ('receiving'::text,
     ST_Transform(ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326), 5070))
)
select
  e.end_name,
  (
    select min(ST_Distance(e.pt, r.geom))
    from ref.nerc_regions r
    where r.code = any($5::text[])
  ) as ticked_m,
  s.code as suggested_code
from ends e
left join lateral (
  select r.code
  from ref.nerc_regions r
  where not (r.code = any($5::text[]))
    and ST_DWithin(e.pt, r.geom, $6::float8)
  order by ST_Distance(e.pt, r.geom)
  limit 1
) s on true
order by case e.end_name when 'sending' then 1 else 2 end
"""

# Simplified to about 1 km (geom is EPSG:5070, metres), then reprojected to 4326.
_REGIONS_SQL = """
select
  code,
  name,
  ST_AsGeoJSON(
    ST_Transform(ST_SimplifyPreserveTopology(geom, 1000), 4326)
  ) as geojson
from ref.nerc_regions
"""

_CACHE_CONTROL = "public, max-age=86400"


def normalize_regions(codes: list[str]) -> list[str]:
    """Dedupe and sort region codes into REGION_CODES order.

    Raises ValueError for an empty list or any code that is not one of the six.
    """
    if not codes:
        raise ValueError("At least one region is required.")
    for code in codes:
        if not isinstance(code, str) or code not in REGION_NAMES:
            raise ValueError(f"Unknown NERC region: {code!r}.")
    wanted = set(codes)
    return [code for code in REGION_CODES if code in wanted]


def _outside_response(end: str, names: tuple[str, str] | None, suggested: str | None) -> JSONResponse:
    index = 0 if end == "sending" else 1
    label = f"The {end} terminal"
    if names is not None:
        label = f"{label} ({names[index]})"
    tolerance_km = REGION_TOLERANCE_M // 1000
    if suggested is None:
        message = f"{label} is outside FORGE's coverage."
    else:
        message = (
            f"{label} lies more than {tolerance_km} km outside the project's regions. "
            f"Add {REGION_NAMES[suggested]} to include it."
        )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "error": {
                "code": "terminal_outside_regions",
                "message": message,
                "detail": {"end": end, "suggested_region": suggested},
            }
        },
    )


async def check_terminals_in_regions(
    conn,
    sending: tuple[float, float],
    receiving: tuple[float, float],
    regions: list[str],
    names: tuple[str, str] | None = None,
) -> JSONResponse | None:
    """Refuse the project if a terminal is more than 25 km outside the ticked regions.

    ``sending`` and ``receiving`` are (lon, lat) in EPSG:4326. The sending end is
    checked first. Returns None when both ends pass.
    """
    rows = await conn.fetch(
        _TERMINAL_CHECK_SQL,
        float(sending[0]),
        float(sending[1]),
        float(receiving[0]),
        float(receiving[1]),
        list(regions),
        float(REGION_SUGGEST_MAX_M),
    )
    by_end = {row["end_name"]: row for row in rows}
    for end in ("sending", "receiving"):
        row = by_end[end]
        ticked = row["ticked_m"]
        if ticked is not None and ticked <= REGION_TOLERANCE_M:
            continue
        return _outside_response(end, names, row["suggested_code"])
    return None


def _decode_geometry(value: Any) -> dict | None:
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        value = value.decode()
    if isinstance(value, str):
        value = json.loads(value)
    return value if isinstance(value, dict) else None


def build_feature_collection(rows) -> dict:
    """GeoJSON FeatureCollection of region rows, in REGION_CODES order."""
    ordered = sorted(
        rows,
        key=lambda row: _REGION_ORDER.get(row["code"], len(REGION_CODES)),
    )
    features = [
        {
            "type": "Feature",
            "properties": {"code": row["code"], "name": row["name"]},
            "geometry": _decode_geometry(row["geojson"]),
        }
        for row in ordered
    ]
    return {"type": "FeatureCollection", "features": features}


@router.get("/api/nerc-regions")
async def get_nerc_regions() -> JSONResponse:
    """The six NERC regions as GeoJSON. No auth; the shapes change rarely."""
    pool = db_module.get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_REGIONS_SQL)
    return JSONResponse(
        content=build_feature_collection(rows),
        headers={"Cache-Control": _CACHE_CONTROL},
    )
