"""NERC regional entities: the region codes and the region shapes endpoint."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter
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
