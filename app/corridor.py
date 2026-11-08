"""Corridor slices in EPSG:5070, retained wetland area, and PAD-US overlap."""

from __future__ import annotations

import asyncpg

from .terrain_rules import WetlandRule, load_classification

_STEMS_OK = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")


def wetland_filter_sql(rule: WetlandRule) -> str:
    """SQL for the same test as retain_wetland. mixed=every_part keeps PEM/PSS and drops PEM/PUB."""
    if rule.mixed != "every_part":
        raise ValueError(f"unsupported mixed-code rule: {rule.mixed}")
    likes: list[str] = []
    for stem in rule.stems:
        token = stem.upper()
        if not token or any(char not in _STEMS_OK for char in token):
            raise ValueError(f"wetland stem is not a code token: {stem}")
        likes.append(f"upper(btrim(part)) LIKE '{token}%'")
    stem_match = "(" + " OR ".join(likes) + ")"
    # btrim matches retain_wetland, which strips the whole code and each
    # slash-separated part. A null attribute has no parts, so NOT EXISTS
    # would keep it; require a code before that test.
    return (
        "w.attribute IS NOT NULL AND NOT EXISTS ("
        "SELECT 1 FROM regexp_split_to_table(upper(w.attribute), '/') AS part "
        f"WHERE btrim(part) = '' OR NOT {stem_match}"
        ")"
    )


# $1 geojson MultiLineString in EPSG:4326. $2 half-width in meters.
# Sample boundaries are cut perpendicular to the segment. Corners are also
# cut along the angle bisector. A straight joint is not.
# Part numbers are the ST_Dump geometry index so these slices share the
# sample order in route.py: part id, then piece index i.
SLICE_FROM = """
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
  SELECT part_id, line, meters, GREATEST(1, CEIL(meters / 30.0))::int AS n
  FROM measured
),
segs AS (
  SELECT row_number() OVER (ORDER BY part_id, i) AS slice_id,
         part_id,
         i,
         meters / n AS length_m,
         ST_LineSubstring(line, (i::float8) / n, ((i + 1)::float8) / n) AS seg
  FROM steps
  CROSS JOIN LATERAL generate_series(0, n - 1) AS i
),
sample_cuts AS (
  SELECT ST_StartPoint(seg) AS pt,
         ST_X(ST_EndPoint(seg)) - ST_X(ST_StartPoint(seg)) AS dx,
         ST_Y(ST_EndPoint(seg)) - ST_Y(ST_StartPoint(seg)) AS dy
  FROM segs
  WHERE i > 0
),
corner_cuts AS (
  SELECT ST_PointN(line, gs) AS pt,
         ST_PointN(line, gs - 1) AS prev,
         ST_PointN(line, gs + 1) AS nxt
  FROM measured
  CROSS JOIN LATERAL generate_series(2, ST_NPoints(line) - 1) AS gs
),
blades AS (
  SELECT ST_Collect(blade) AS geom
  FROM (
    SELECT ST_MakeLine(
             ST_Translate(pt, -ny * $2 * 10, nx * $2 * 10),
             ST_Translate(pt, ny * $2 * 10, -nx * $2 * 10)
           ) AS blade
    FROM sample_cuts
    CROSS JOIN LATERAL (
      SELECT
        dx / NULLIF(sqrt(dx * dx + dy * dy), 0) AS nx,
        dy / NULLIF(sqrt(dx * dx + dy * dy), 0) AS ny
    ) n
    UNION ALL
    SELECT ST_MakeLine(
             ST_Translate(pt, dirx * $2 * -10, diry * $2 * -10),
             ST_Translate(pt, dirx * $2 * 10, diry * $2 * 10)
           ) AS blade
    FROM corner_cuts
    CROSS JOIN LATERAL (
      SELECT
        ST_X(pt) - ST_X(prev) AS dx1,
        ST_Y(pt) - ST_Y(prev) AS dy1,
        ST_X(nxt) - ST_X(pt) AS dx2,
        ST_Y(nxt) - ST_Y(pt) AS dy2
    ) d
    CROSS JOIN LATERAL (
      SELECT
        dx1 / NULLIF(sqrt(dx1 * dx1 + dy1 * dy1), 0) AS ux,
        dy1 / NULLIF(sqrt(dx1 * dx1 + dy1 * dy1), 0) AS uy,
        dx2 / NULLIF(sqrt(dx2 * dx2 + dy2 * dy2), 0) AS vx,
        dy2 / NULLIF(sqrt(dx2 * dx2 + dy2 * dy2), 0) AS vy
    ) u
    CROSS JOIN LATERAL (
      SELECT ux + vx AS dirx, uy + vy AS diry
    ) b
    WHERE (ux * vx + uy * vy) <= 0.999
  ) cuts
),
corridor AS (
  SELECT ST_Buffer(geom, $2, 'endcap=flat join=mitre mitre_limit=5') AS geom
  FROM route
),
pieces AS (
  SELECT row_number() OVER () AS piece_id, dumped.geom
  FROM corridor c
  LEFT JOIN blades b ON true
  CROSS JOIN LATERAL ST_Dump(
    CASE
      WHEN b.geom IS NULL THEN c.geom
      ELSE ST_Split(c.geom, b.geom)
    END
  ) AS dumped
),
piece_parts AS (
  -- Nearest route part for each piece. Parts are few, so this stays linear.
  SELECT DISTINCT ON (p.piece_id)
         p.piece_id,
         p.geom,
         st.part_id,
         st.n,
         ST_LineLocatePoint(st.line, ST_PointOnSurface(p.geom)) AS frac
  FROM pieces p
  JOIN steps st ON true
  ORDER BY p.piece_id, ST_Distance(ST_PointOnSurface(p.geom), st.line)
),
assigned AS (
  -- The 30 m segment holding the piece's nearest point on its part is the
  -- nearest segment, so this matches nearest-segment assignment without
  -- comparing every piece with every segment.
  SELECT s.slice_id,
         pp.geom
  FROM piece_parts pp
  JOIN segs s
    ON s.part_id = pp.part_id
   AND s.i = LEAST(pp.n - 1, FLOOR(pp.frac * pp.n)::int)
)
"""


async def fetch_slice_areas_m2(
    conn: asyncpg.Connection, geojson: str, row_width_ft: float
) -> tuple[list[float], float]:
    """Piece areas and the unsplit buffer area, for the partition test."""
    half_m = row_width_ft * 0.3048 / 2.0
    sql = f"""
    {SLICE_FROM}
    SELECT
      (SELECT array_agg(area ORDER BY slice_id) FROM (
         SELECT slice_id, SUM(ST_Area(geom)) AS area
         FROM assigned
         GROUP BY slice_id
      ) s),
      (SELECT ST_Area(geom) FROM corridor)
    """
    row = await conn.fetchrow(sql, geojson, half_m)
    return [float(value) for value in row[0]], float(row[1])


class MissingLayerTable(Exception):
    """A GIS layer table the slice overlap needs is absent. ``layer`` is
    ``"wetlands"`` or ``"protected_areas"``."""

    def __init__(self, layer: str) -> None:
        super().__init__(layer)
        self.layer = layer


_LAYER_TABLES = (
    ("wetlands", "ref.nwi_wetlands"),
    ("protected_areas", "habitat.padus_gap123"),
)


def wetland_area_sql(where: str) -> str:
    """Retained inventory area per slice that has any, as a CTE body over
    ``assigned``. Slices with none are absent and read as 0 by the caller."""
    return f"""
SELECT a.slice_id,
       SUM(ST_Area(ST_Intersection(a.geom, w.geom))) AS area_m2
FROM assigned a
JOIN ref.nwi_wetlands w
  ON ST_Intersects(a.geom, w.geom)
 AND {where}
GROUP BY a.slice_id
"""


PROTECTED_AREA_SQL = """
SELECT a.slice_id,
       ST_Area(
         ST_UnaryUnion(
           ST_Collect(
             ST_CollectionExtract(ST_Intersection(a.geom, p.geom), 3)
           )
         )
       ) AS area_m2
FROM assigned a
JOIN habitat.padus_gap123 p
  ON p.gap_sts IN (1, 2, 3)
 AND ST_Intersects(a.geom, p.geom)
GROUP BY a.slice_id
"""


async def fetch_slice_overlaps_m2(
    conn: asyncpg.Connection, geojson: str, row_width_ft: float
) -> tuple[list[float], list[float]]:
    """Retained wetland area and GAP 1–3 overlap, square meters, one value per
    30 m sample, from one build of the corridor slices.

    Raises ``MissingLayerTable`` naming the first absent layer table. A missing
    table is never read as zero.
    """
    for layer, table in _LAYER_TABLES:
        if await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", table) is not True:
            raise MissingLayerTable(layer)
    half_m = row_width_ft * 0.3048 / 2.0
    where = wetland_filter_sql(load_classification().wetland)
    sql = f"""
    {SLICE_FROM},
    wetland AS ({wetland_area_sql(where)}),
    protected AS ({PROTECTED_AREA_SQL})
    SELECT COALESCE(w.area_m2, 0) AS wetland_m2,
           COALESCE(p.area_m2, 0) AS protected_m2
    FROM segs s
    LEFT JOIN wetland w ON w.slice_id = s.slice_id
    LEFT JOIN protected p ON p.slice_id = s.slice_id
    ORDER BY s.part_id, s.i
    """
    try:
        rows = await conn.fetch(sql, geojson, half_m)
    except asyncpg.UndefinedTableError as exc:
        message = str(exc)
        raise MissingLayerTable(
            "protected_areas" if "padus" in message else "wetlands"
        ) from exc
    return (
        [float(row["wetland_m2"]) for row in rows],
        [float(row["protected_m2"]) for row in rows],
    )
