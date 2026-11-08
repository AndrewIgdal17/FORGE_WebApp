"""POST /api/route/analyze: terrain, ROW zones, and protected-area acres.

The browser sends a GeoJSON MultiLineString in EPSG:4326. PostGIS measures
the line and the county intersections in EPSG:5070 (meters). NLCD land-cover
samples classify terrain. Wetland length comes from the National Wetlands
Inventory; NLCD class 90 is forested. 3DEP slope sampling classifies
unresolved pixels as mountain (>8%), rolling hills (2–8%), or scrubbed
flat (<2%). Protected-area acres come from PAD-US GAP 1–3 overlap on the
corridor slices and are returned under ``habitat/padus``. A route that
enters a lower-48 state or the District of Columbia with no inventory load
is unavailable, the same as a missing inventory table. A missing
protected-area table is unavailable with detail ``Protected areas are not
loaded.`` Alaska, Hawaii, and the territories are not the inventory check.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

from . import db as db_module
from .corridor import MissingLayerTable, fetch_slice_overlaps_m2
from .layer_releases import layer_releases
from .models import sanitize_for_json
from .states import FIPS_TO_STATE, fips_to_abbrev
from .terrain_rules import (
    TERRAIN_CLASSES,
    ClassifiedSample,
    SampleHit,
    TerrainResult,
    apply_wetland_transfer,
    land_cover_class,
    load_classification,
    load_mapping_rules,
    protected_acres,
)

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
DEFAULT_SLOPE_PATH = "/gis-data/slope/slope_conus_cog.tif"
TERRAIN_LAYER = "terrain/nlcd"
ROW_LAYER = "row/blm"
TERRAIN_CATEGORIES = TERRAIN_CLASSES

_nlcd_dataset: Any = None
_nlcd_lock = threading.Lock()
_slope_dataset: Any = None
_slope_lock = threading.Lock()
_slope_unavailable = False
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
# Part numbers are the ST_Dump geometry index. Rows are ordered by part id,
# then piece index i, the same order as corridor slices.
_SAMPLE_POINTS_SQL = """
WITH route AS (
  SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 5070) AS geom
),
parts AS (
  SELECT (ST_Dump(geom)).path[1] AS part_id,
         (ST_Dump(geom)).geom AS line
  FROM route
),
measured AS (
  SELECT part_id, line, ST_Length(line) AS meters
  FROM parts
  WHERE ST_Length(line) > 0
),
steps AS (
  SELECT part_id,
         line,
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
ORDER BY part_id, i
"""

# First vertex is the sending end. Last vertex is the receiving end.
# ST_Covers counts a point on a polygon boundary as inside that polygon.
_ENDPOINT_SQL = """
WITH route AS (
  SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 5070) AS geom
),
ends AS (
  SELECT
    ST_StartPoint(ST_GeometryN(geom, 1)) AS send_pt,
    ST_EndPoint(ST_GeometryN(geom, ST_NumGeometries(geom))) AS recv_pt
  FROM route
)
SELECT
  (SELECT e.subregion FROM ref.subregions_egrid e, ends
    WHERE ST_Covers(e.geom, send_pt) LIMIT 1) AS sending_subregion,
  (SELECT e.subregion FROM ref.subregions_egrid e, ends
    WHERE ST_Covers(e.geom, recv_pt) LIMIT 1) AS receiving_subregion,
  (SELECT g.gea_name FROM ref.gea_regions g, ends
    WHERE ST_Covers(g.geom, send_pt) LIMIT 1) AS sending_gea,
  (SELECT g.gea_name FROM ref.gea_regions g, ends
    WHERE ST_Covers(g.geom, recv_pt) LIMIT 1) AS receiving_gea,
  (SELECT c.statefp FROM ref.counties_tiger c, ends
    WHERE ST_Covers(c.geom, send_pt) LIMIT 1) AS sending_statefp,
  (SELECT c.statefp FROM ref.counties_tiger c, ends
    WHERE ST_Covers(c.geom, recv_pt) LIMIT 1) AS receiving_statefp
"""

# Counties the route crosses. statefp is the TIGER code, not the USPS abbreviation.
_ROUTE_STATEFP_SQL = """
WITH route AS (
  SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 5070) AS geom
)
SELECT DISTINCT c.statefp AS statefp
FROM route r
JOIN ref.counties_tiger c ON ST_Intersects(r.geom, c.geom)
"""

_LOADED_NWI_STATES_SQL = """
SELECT state FROM ref.nwi_provenance
"""

# Alaska, Hawaii, and the territories. DC (11) stays required: the loader's
# file set is the states plus DC, and a missing DC file is the same silent zero.
_NWI_STATEFP_NOT_REQUIRED = frozenset({"02", "15", "60", "66", "69", "72", "78"})

COVERAGE_TOLERANCE_M = 1.0
ROUTE_REQUIRED = "A drawn route inside the lower 48 is required."

_COVERAGE_SQL = """
WITH route AS (
  SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 5070) AS geom
),
inside AS (
  -- Only counties the route crosses can hold any of its length, so the union
  -- is limited to them and uses the spatial index.
  SELECT ST_UnaryUnion(ST_Collect(c.geom)) AS geom
  FROM ref.counties_tiger c, route r
  WHERE c.statefp = ANY($2::text[])
    AND ST_Intersects(c.geom, r.geom)
)
SELECT
  ST_Length(r.geom) AS route_m,
  COALESCE(ST_Length(ST_Intersection(r.geom, i.geom)), 0) AS inside_m
FROM route r
LEFT JOIN inside i ON TRUE
"""


def lower_48_dc_fips() -> list[str]:
    return sorted(
        code for code in FIPS_TO_STATE if code not in _NWI_STATEFP_NOT_REQUIRED
    )


def route_not_covered(
    route_m: float | None,
    inside_m: float | None,
    statefps: list[Any],
) -> bool:
    """True when the route is not wholly inside the lower 48 and DC."""
    codes: list[str] = []
    for raw in statefps:
        code = _statefp_key(raw)
        if code is not None:
            codes.append(code)
    if any(code in _NWI_STATEFP_NOT_REQUIRED for code in codes):
        return True
    if not any(code in FIPS_TO_STATE and code not in _NWI_STATEFP_NOT_REQUIRED for code in codes):
        return True
    if route_m is None or inside_m is None:
        return True
    return (float(route_m) - float(inside_m)) > COVERAGE_TOLERANCE_M


_NWI_UNAVAILABLE = "National Wetlands Inventory is not loaded."
_PADUS_UNAVAILABLE = "Protected areas are not loaded."


def _text_cell(row: Any | None, column: str) -> str | None:
    if row is None:
        return None
    value = row[column]
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def endpoint_context(row: Any | None) -> dict[str, str | None]:
    """Region codes at each end. A polygon miss stays None."""
    return {
        "sending_subregion": _text_cell(row, "sending_subregion"),
        "receiving_subregion": _text_cell(row, "receiving_subregion"),
        "sending_gea": _text_cell(row, "sending_gea"),
        "receiving_gea": _text_cell(row, "receiving_gea"),
        "sending_state": fips_to_abbrev(_text_cell(row, "sending_statefp")),
        "receiving_state": fips_to_abbrev(_text_cell(row, "receiving_statefp")),
    }


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
    row_width_ft: float = Field(gt=0)


def miles_by_category(samples: list[tuple[str, float]]) -> dict[str, float]:
    """Sum sample spacing (meters) into miles for every terrain category."""
    totals = {category: 0.0 for category in TERRAIN_CATEGORIES}
    for category, spacing_m in samples:
        if category not in totals:
            category = "scrubbed_flat"
        totals[category] += spacing_m
    return {
        category: meters / METERS_PER_MILE
        for category, meters in totals.items()
    }


def zone_miles_from_rows(zone_rows: list[Any]) -> dict[str, float]:
    """Miles for all 15 BLM zones. Zones the route misses stay at 0."""
    zones = {f"zone_{i}": 0.0 for i in range(1, 16)}
    for row in zone_rows:
        miles = float(row["miles"])
        zone_number = int(row["zone"])
        if not 1 <= zone_number <= 15:
            logger.warning("Ignoring BLM zone %s outside 1–15", zone_number)
            continue
        zones[f"zone_{zone_number}"] = miles
    return zones


def normalize_zone_miles(
    zones: dict[str, float], terrain: dict[str, float]
) -> dict[str, float]:
    """Scale zone miles so they sum to the terrain total.

    NLCD raster sampling and PostGIS vector intersection produce independent
    totals. Scaling keeps the zone mix and makes the sums match.
    Skip when either total is 0 (no terrain samples or no zone intersections).
    """
    terrain_total = sum(terrain.values())
    zone_total = sum(zones.values())
    if terrain_total <= 0 or zone_total <= 0:
        return zones
    scale = terrain_total / zone_total
    return {key: value * scale for key, value in zones.items()}


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


def slope_path() -> str:
    return os.environ.get("FORGE_SLOPE_PATH", DEFAULT_SLOPE_PATH)


def _pixel_code(sample: Any) -> int | None:
    value = sample[0]
    mask = getattr(sample, "mask", None)
    if mask is not None and bool(mask[0]):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _slope_value(sample: Any) -> float | None:
    """Extract percent slope from a rasterio sample. Returns None on NoData.

    The slope COG stores NoData as -9999. Any negative value is missing slope,
    not a real grade. A pixel of 0% is flat and must not be treated as NoData.
    """
    value = sample[0]
    mask = getattr(sample, "mask", None)
    if mask is not None and bool(mask[0]):
        return None
    try:
        val = float(value)
        return val if val >= 0 else None
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


def _open_slope() -> Any | None:
    """Open the slope COG once. Returns None if unavailable.

    Caller must hold ``_slope_lock``. A missing file is logged once; later
    calls skip the warning and leave scrubbed_flat unchanged.
    """
    global _slope_dataset, _slope_unavailable
    if rasterio is None or _slope_unavailable:
        return None
    if _slope_dataset is not None:
        return _slope_dataset
    path = slope_path()
    if not os.path.isfile(path):
        logger.warning(
            "Slope COG not found at %s; mountain/rolling_hills will be 0", path
        )
        _slope_unavailable = True
        return None
    dataset = rasterio.open(path)
    logger.info("Opened slope raster %s crs=%s", path, dataset.crs)
    _slope_dataset = dataset
    return dataset


def sample_terrain(points: list[tuple[float, float, float]]) -> list[SampleHit]:
    """Classify NLCD + slope at EPSG:5070 sample points.

    ``points`` are (x, y, spacing_m). Slope overrides only ``scrubbed_flat``:
    above 8% is mountain, 2–8% is rolling hills, below 2% stays scrubbed flat.
    """
    if not points:
        return []
    coords = [(x, y) for x, y, _spacing in points]

    with _nlcd_lock:
        dataset = _open_nlcd()
        nlcd_samples = list(dataset.sample(coords))

    with _slope_lock:
        slope_ds = _open_slope()
        slope_samples = (
            list(slope_ds.sample(coords)) if slope_ds else [None] * len(coords)
        )

    classification = load_classification()
    classified: list[SampleHit] = []
    for nlcd_sample, slope_sample, (_x, _y, spacing_m) in zip(
        nlcd_samples, slope_samples, points, strict=True
    ):
        code = _pixel_code(nlcd_sample)
        slope_pct = _slope_value(slope_sample) if slope_sample is not None else None
        category = land_cover_class(code, slope_pct, classification)

        classified.append(SampleHit(category, float(spacing_m), code))
    return classified


def classified_samples_from_hits(
    hits: list[SampleHit],
    areas_m2: list[float],
) -> list[ClassifiedSample]:
    """Pair each sample hit with its retained wetland area."""
    if len(hits) != len(areas_m2):
        raise RuntimeError("wetland area count does not match sample count")
    return [
        ClassifiedSample(hit.land_cover, hit.length_m, hit.nlcd_code, area)
        for hit, area in zip(hits, areas_m2, strict=True)
    ]


def terrain_from_hits(
    hits: list[SampleHit],
    areas_m2: list[float],
    row_width_ft: float,
) -> TerrainResult:
    """Thin wrapper for tests that start from sample hits."""
    return apply_wetland_transfer(
        classified_samples_from_hits(hits, areas_m2),
        row_width_ft,
    )


async def _require_auth(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Call ``app.main.require_auth`` without importing it at module load."""
    from .main import require_auth

    return await require_auth(cred)


def _unavailable(message: str) -> JSONResponse:
    logger.warning("POST /api/route/analyze unavailable: %s", message)
    return JSONResponse(status_code=503, content={"detail": message})


def _statefp_key(value: Any) -> str | None:
    if value is None:
        return None
    code = str(value).strip()
    if not code:
        return None
    if code.isdigit():
        return code.zfill(2)
    return code


def missing_required_nwi_state(statefps: list[Any], loaded_states: set[str]) -> bool:
    """True when the route enters a lower-48 state or DC with no load row.

    Alaska (02), Hawaii (15), and the territories are not required. A route
    that only touches those is not this check.
    """
    loaded = {str(code).strip().upper() for code in loaded_states}
    for raw in statefps:
        code = _statefp_key(raw)
        if code is None or code in _NWI_STATEFP_NOT_REQUIRED:
            continue
        abbrev = fips_to_abbrev(code)
        if abbrev is None:
            continue
        if abbrev not in loaded:
            return True
    return False


async def _route_missing_nwi_state(conn: Any, statefps: list[Any]) -> bool:
    loaded_rows = await conn.fetch(_LOADED_NWI_STATES_SQL)
    loaded = {str(row["state"]) for row in loaded_rows if row["state"] is not None}
    return missing_required_nwi_state(statefps, loaded)


def _provenance_abbrevs(statefps: list[Any]) -> list[str]:
    """USPS abbreviations for the states a route crosses."""
    abbrevs: list[str] = []
    for raw in statefps:
        abbrev = fips_to_abbrev(_statefp_key(raw))
        if abbrev:
            abbrevs.append(abbrev)
    return abbrevs


@router.post("/api/route/analyze")
async def analyze_route(
    request: Request,
    payload: AnalyzeRequest,
    user: dict = Depends(_require_auth),
) -> JSONResponse:
    """Intersect a route with counties, NLCD, slope, wetlands, and PAD-US.

    The response includes ``habitat/padus`` acres. A missing protected-area
    table is 503 with detail ``Protected areas are not loaded.``
    """
    user_id = user.get("sub")
    if user_id:
        request.state.user_id = user_id
    return await run_route_analysis(payload.route, payload.row_width_ft)


async def run_route_analysis(
    route: RouteGeometry, row_width_ft: float
) -> JSONResponse:
    """Run the analyze query sequence and return its JSON response.

    A route that is not wholly inside the lower 48 and DC is 422. The success
    body includes ``layer_releases`` for the states the route crosses.
    """
    if rasterio is None:
        return _unavailable(
            "Terrain sampling is unavailable because rasterio is not installed."
        )

    geojson = json.dumps(route.model_dump())
    try:
        pool = db_module.get_db_pool()
    except RuntimeError:
        logger.exception("route analyze: database pool is not initialized")
        return _unavailable("Database is not available.")

    endpoint_row = None
    label_rows: list[Any] = []
    try:
        async with pool.acquire() as conn:
            state_rows = await conn.fetch(_ROUTE_STATEFP_SQL, geojson)
            coverage = await conn.fetchrow(
                _COVERAGE_SQL, geojson, lower_48_dc_fips()
            )
            statefps = [row["statefp"] for row in state_rows]
            if route_not_covered(
                None if coverage is None else coverage["route_m"],
                None if coverage is None else coverage["inside_m"],
                statefps,
            ):
                return JSONResponse(
                    status_code=422, content={"detail": ROUTE_REQUIRED}
                )
            total_miles = await conn.fetchval(_TOTAL_MILES_SQL, geojson)
            zone_rows = await conn.fetch(_ZONE_MILES_SQL, geojson)
            point_rows = await conn.fetch(_SAMPLE_POINTS_SQL, geojson)
            endpoint_row = await conn.fetchrow(_ENDPOINT_SQL, geojson)
            try:
                if await _route_missing_nwi_state(conn, statefps):
                    return _unavailable(_NWI_UNAVAILABLE)
                label_rows = await conn.fetch(
                    """
                    SELECT DISTINCT release_label
                    FROM ref.nwi_provenance
                    WHERE state = ANY($1::text[])
                    """,
                    _provenance_abbrevs(statefps),
                )
            except asyncpg.UndefinedTableError:
                return _unavailable(_NWI_UNAVAILABLE)
            try:
                areas, overlap = await fetch_slice_overlaps_m2(
                    conn, geojson, row_width_ft
                )
            except MissingLayerTable as missing:
                return _unavailable(
                    _PADUS_UNAVAILABLE
                    if missing.layer == "protected_areas"
                    else _NWI_UNAVAILABLE
                )
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
        hits = await asyncio.to_thread(sample_terrain, points)
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

    samples = classified_samples_from_hits(hits, areas)
    result = apply_wetland_transfer(samples, row_width_ft)
    gap = protected_acres(samples, overlap, row_width_ft)
    terrain = result.miles
    zones = zone_miles_from_rows(zone_rows)
    zones = normalize_zone_miles(zones, terrain)

    intersections = {
        TERRAIN_LAYER: result.miles,
        ROW_LAYER: zones,
        "habitat/padus": gap,
    }
    body = {
        "total_miles": float(total_miles),
        "intersections": intersections,
        "changes": changes_for(intersections),
        "open_water_miles": result.open_water_miles,
        "layer_releases": layer_releases(
            [row["release_label"] for row in label_rows]
        ),
        **endpoint_context(endpoint_row),
    }
    return JSONResponse(sanitize_for_json(body))
