"""POST /api/route/analyze: terrain and ROW-zone miles for a drawn route.

The browser sends a GeoJSON MultiLineString in EPSG:4326. PostGIS measures
the line and the county intersections in EPSG:5070 (meters). NLCD land-cover
samples classify terrain. Mountain and rolling-hills stay at zero until 3DEP
slope sampling exists; every other unclassified pixel is scrubbed flat.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

import asyncpg
import yaml
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

from . import db as db_module
from .models import sanitize_for_json

logger = logging.getLogger(__name__)

try:
    import rasterio
except ImportError:  # local dev and unit tests can run without GIS libraries
    rasterio = None
    logger.warning(
        "rasterio is not installed; POST /api/route/analyze will return 503."
    )

router = APIRouter()

METERS_PER_MILE = 1609.344
SAMPLE_SPACING_M = 30.0
DEFAULT_NLCD_PATH = "/gis-data/nlcd/nlcd_2021_land_cover_cog.tif"
TERRAIN_LAYER = "terrain/nlcd"
ROW_LAYER = "row/blm"
TERRAIN_CATEGORIES = (
    "forested",
    "wetland",
    "scrubbed_flat",
    "urban",
    "farmland",
    "desert_barren",
    "mountain",
    "rolling_hills",
    "subsea",
)

_NLCD_TO_TERRAIN = {
    90: "wetland",
    95: "wetland",
    41: "forested",
    42: "forested",
    43: "forested",
    21: "urban",
    22: "urban",
    23: "urban",
    24: "urban",
    81: "farmland",
    82: "farmland",
    31: "desert_barren",
}

_rules_cache: list[dict[str, Any]] | None = None
_nlcd_dataset: Any = None
_nlcd_lock = threading.Lock()
_bearer = HTTPBearer(auto_error=False)

# Length is ST_Length of the EPSG:5070 geometry (meters). Casting that
# projected geometry to geography fails: geography only accepts lon/lat.
_TOTAL_MILES_SQL = """
SELECT ST_Length(
         ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 5070)
       ) / 1609.344
"""

_ZONE_MILES_SQL = """
WITH route AS (
  SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 5070) AS geom
)
SELECT z.blm_zone_2022 AS zone,
       SUM(
         ST_Length(ST_CollectionExtract(ST_Intersection(r.geom, c.geom), 2))
       ) / 1609.344 AS miles
FROM route r
JOIN ref.counties_tiger c ON ST_Intersects(r.geom, c.geom)
JOIN ref.blm_zone_crosswalk z
  ON z.geoid = lpad(trim(c.geoid::text), 5, '0')
WHERE z.blm_zone_2022 IS NOT NULL
GROUP BY z.blm_zone_2022
ORDER BY z.blm_zone_2022
"""

# Midpoint of each ~30 m piece, so samples neither overlap nor leave a tail.
_SAMPLE_POINTS_SQL = """
WITH route AS (
  SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 5070) AS geom
),
parts AS (
  SELECT (ST_Dump(geom)).geom AS line
  FROM route
),
measured AS (
  SELECT line, ST_Length(line) AS meters
  FROM parts
  WHERE ST_Length(line) > 0
),
steps AS (
  SELECT line,
         meters,
         GREATEST(1, CEIL(meters / 30.0))::int AS n
  FROM measured
)
SELECT ST_X(pt) AS x,
       ST_Y(pt) AS y,
       meters / n AS spacing_m
FROM steps
CROSS JOIN LATERAL generate_series(0, n - 1) AS i
CROSS JOIN LATERAL (
  SELECT ST_LineInterpolatePoint(line, ((i + 0.5) / n)::float8) AS pt
) sampled
"""


class RouteGeometry(BaseModel):
    type: str
    coordinates: list[list[list[float]]] = Field(min_length=1)

    @field_validator("type")
    @classmethod
    def _must_be_multilinestring(cls, value: str) -> str:
        if value != "MultiLineString":
            raise ValueError("route.type must be MultiLineString")
        return value

    @field_validator("coordinates")
    @classmethod
    def _lines_have_two_positions(
        cls, coordinates: list[list[list[float]]]
    ) -> list[list[list[float]]]:
        for line in coordinates:
            if len(line) < 2:
                raise ValueError("each line requires at least two positions")
            for position in line:
                if len(position) < 2:
                    raise ValueError("each position requires longitude and latitude")
        return coordinates


class AnalyzeRequest(BaseModel):
    route: RouteGeometry


def load_mapping_rules() -> list[dict[str, Any]]:
    """Return the 24 terrain and ROW-zone rules. Parsed once per process."""
    global _rules_cache
    if _rules_cache is None:
        path = Path(__file__).with_name("mapping_rules.yaml")
        with path.open() as handle:
            document = yaml.safe_load(handle)
        rules = document["rules"]
        if not isinstance(rules, list):
            raise RuntimeError("mapping_rules.yaml is missing a rules list")
        _rules_cache = rules
    return _rules_cache


def classify_nlcd(code: int) -> str:
    """Map one NLCD class to a terrain category.

    Slope categories (mountain, rolling hills) and subsea are not assigned
    here. 3DEP sampling is deferred, and subsea comes from construction type.
    """
    return _NLCD_TO_TERRAIN.get(int(code), "scrubbed_flat")


def miles_by_category(samples: list[tuple[str, float]]) -> dict[str, float]:
    """Sum sample spacing (meters) into miles for every terrain category."""
    totals = {category: 0.0 for category in TERRAIN_CATEGORIES}
    for category, spacing_m in samples:
        if category not in totals:
            category = "scrubbed_flat"
        totals[category] += spacing_m
    return {
        category: round(meters / METERS_PER_MILE, 2)
        for category, meters in totals.items()
    }


def changes_for(intersections: dict[str, dict[str, float]]) -> dict[str, float]:
    """Copy intersection miles onto calculator paths using the direct rules."""
    changes: dict[str, float] = {}
    for rule in load_mapping_rules():
        if rule.get("transform") != "direct":
            logger.warning("Skipping mapping rule with unknown transform: %s", rule)
            continue
        layer = intersections.get(rule["layer"])
        if not isinstance(layer, dict) or rule["key"] not in layer:
            continue
        changes[rule["forge_path"]] = layer[rule["key"]]
    return changes


def nlcd_path() -> str:
    return os.environ.get("FORGE_NLCD_PATH", DEFAULT_NLCD_PATH)


def _pixel_code(sample: Any) -> int | None:
    value = sample[0]
    mask = getattr(sample, "mask", None)
    if mask is not None and bool(mask[0]):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _open_nlcd() -> Any:
    """Open the NLCD COG once. Caller must hold ``_nlcd_lock``."""
    global _nlcd_dataset
    if rasterio is None:
        raise RuntimeError("rasterio is not installed")
    if _nlcd_dataset is not None:
        return _nlcd_dataset
    path = nlcd_path()
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    dataset = rasterio.open(path)
    logger.info("Opened NLCD raster %s crs=%s", path, dataset.crs)
    _nlcd_dataset = dataset
    return dataset


def sample_terrain(points: list[tuple[float, float, float]]) -> list[tuple[str, float]]:
    """Classify NLCD at EPSG:5070 sample points. ``points`` are (x, y, spacing_m)."""
    if not points:
        return []
    with _nlcd_lock:
        dataset = _open_nlcd()
        samples = list(dataset.sample([(x, y) for x, y, _spacing in points]))
    classified: list[tuple[str, float]] = []
    for sample, (_x, _y, spacing_m) in zip(samples, points, strict=True):
        code = _pixel_code(sample)
        category = "scrubbed_flat" if code is None else classify_nlcd(code)
        classified.append((category, float(spacing_m)))
    return classified


async def _require_auth(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Call ``app.main.require_auth`` without importing it at module load."""
    from .main import require_auth

    return await require_auth(cred)


def _unavailable(message: str) -> JSONResponse:
    logger.warning("POST /api/route/analyze unavailable: %s", message)
    return JSONResponse(status_code=503, content={"detail": message})


@router.post("/api/route/analyze")
async def analyze_route(
    request: Request,
    payload: AnalyzeRequest,
    user: dict = Depends(_require_auth),
) -> JSONResponse:
    """Intersect a route with counties and NLCD, then map miles to input paths."""
    user_id = user.get("sub")
    if user_id:
        request.state.user_id = user_id

    if rasterio is None:
        return _unavailable(
            "Terrain sampling is unavailable because rasterio is not installed."
        )

    geojson = json.dumps(payload.route.model_dump())
    try:
        pool = db_module.get_db_pool()
    except RuntimeError:
        logger.exception("route analyze: database pool is not initialized")
        return _unavailable("Database is not available.")

    try:
        async with pool.acquire() as conn:
            total_miles = await conn.fetchval(_TOTAL_MILES_SQL, geojson)
            zone_rows = await conn.fetch(_ZONE_MILES_SQL, geojson)
            point_rows = await conn.fetch(_SAMPLE_POINTS_SQL, geojson)
    except asyncpg.PostgresError as exc:
        sqlstate = getattr(exc, "sqlstate", "") or ""
        message = str(exc).lower()
        if sqlstate.startswith("22") or "geojson" in message:
            logger.warning("route analyze rejected geometry: %s", exc)
            return JSONResponse(
                status_code=422,
                content={"detail": "Route geometry could not be analyzed."},
            )
        logger.exception("route analyze database error")
        return JSONResponse(
            status_code=500,
            content={"detail": "Route analysis failed."},
        )

    points = [(float(row["x"]), float(row["y"]), float(row["spacing_m"])) for row in point_rows]
    try:
        samples = await asyncio.to_thread(sample_terrain, points)
    except FileNotFoundError:
        return _unavailable(f"NLCD land-cover raster was not found at {nlcd_path()}.")
    except RuntimeError as exc:
        return _unavailable(str(exc))
    except Exception:
        logger.exception("NLCD sampling failed")
        return JSONResponse(
            status_code=500,
            content={"detail": "Terrain sampling failed."},
        )

    terrain = miles_by_category(samples)
    zones: dict[str, float] = {}
    for row in zone_rows:
        miles = round(float(row["miles"]), 2)
        if miles <= 0:
            continue
        zone_number = int(row["zone"])
        if not 1 <= zone_number <= 15:
            logger.warning("Ignoring BLM zone %s outside 1–15", zone_number)
            continue
        zones[f"zone_{zone_number}"] = miles

    intersections = {TERRAIN_LAYER: terrain, ROW_LAYER: zones}
    body = {
        "total_miles": round(float(total_miles), 2),
        "intersections": intersections,
        "changes": changes_for(intersections),
    }
    return JSONResponse(sanitize_for_json(body))
