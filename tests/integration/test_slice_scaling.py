"""Slice assignment matches nearest-segment and grows linearly with length.

Skips without FORGE_DATABASE_URL_TEST (a PostGIS database).
"""

import asyncio
import json
import math
import os
import time

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("FORGE_DATABASE_URL_TEST"),
    reason="FORGE_DATABASE_URL_TEST is not set",
)

# Nearest-segment assignment, the reference the faster assignment must match.
_NEAREST_SEGMENT_SQL = """
SELECT DISTINCT ON (piece_id) piece_id, s.slice_id
FROM pieces p
JOIN segs s ON true
ORDER BY piece_id, ST_Distance(ST_PointOnSurface(p.geom), s.seg)
"""

_ASSIGNED_SQL = """
SELECT p.piece_id, a.slice_id
FROM pieces p
JOIN assigned a ON ST_Equals(a.geom, p.geom)
"""


def _route(coordinates: list[list[list[float]]]) -> str:
    return json.dumps({"type": "MultiLineString", "coordinates": coordinates})


def _curvy(miles: float, vertices: int) -> str:
    """A west-to-east line in west Texas with three gentle bends."""
    lon0, lat0, span = -103.0, 31.0, miles / 59.7
    points = [
        [
            lon0 + span * k / (vertices - 1),
            lat0 + 0.05 * span * math.sin(6 * math.pi * k / (vertices - 1)),
        ]
        for k in range(vertices)
    ]
    return _route([points])


def _run(coro):
    return asyncio.run(coro)


async def _connect():
    import asyncpg

    return await asyncpg.connect(os.environ["FORGE_DATABASE_URL_TEST"])


@pytest.mark.parametrize(
    "geojson",
    [
        # Right angle, two parts with corners, and a sharp hairpin.
        _route([[[0, 0], [0.001, 0], [0.001, 0.001]]]),
        _route(
            [
                [[-97.74, 30.27], [-97.735, 30.27], [-97.735, 30.28]],
                [[-97.70, 30.30], [-97.695, 30.305], [-97.690, 30.30]],
            ]
        ),
        _route([[[-97.74, 30.27], [-97.73, 30.27], [-97.7395, 30.2712]]]),
        _curvy(3.0, 40),
    ],
    ids=["right-angle", "two-parts", "hairpin", "gentle-bends"],
)
def test_assignment_matches_nearest_segment(geojson):
    from app.corridor import SLICE_FROM

    async def run():
        conn = await _connect()
        try:
            half_m = 215 * 0.3048 / 2
            reference = await conn.fetch(
                f"{SLICE_FROM} {_NEAREST_SEGMENT_SQL}", geojson, half_m
            )
            assigned = await conn.fetch(
                f"{SLICE_FROM} {_ASSIGNED_SQL}", geojson, half_m
            )
            return (
                {row["piece_id"]: row["slice_id"] for row in reference},
                {row["piece_id"]: row["slice_id"] for row in assigned},
            )
        finally:
            await conn.close()

    reference, assigned = _run(run())
    assert assigned == reference


def test_slices_partition_a_long_route_in_linear_time():
    from app.corridor import fetch_slice_areas_m2

    async def timed(geojson):
        conn = await _connect()
        try:
            started = time.perf_counter()
            areas, buffer_area = await fetch_slice_areas_m2(conn, geojson, 215.0)
            return areas, buffer_area, time.perf_counter() - started
        finally:
            await conn.close()

    short_areas, short_buffer, short_s = _run(timed(_curvy(40.0, 60)))
    long_areas, long_buffer, long_s = _run(timed(_curvy(160.0, 240)))

    assert sum(short_areas) == pytest.approx(short_buffer, rel=1e-6)
    assert sum(long_areas) == pytest.approx(long_buffer, rel=1e-6)
    assert all(area > 0 for area in long_areas)
    assert len(long_areas) > 8000
    # Four times the length: linear work is about 4x; the old cross join was about 16x.
    assert long_s < max(8.0 * short_s, 2.0), (short_s, long_s)


def test_one_slice_build_gives_both_overlaps():
    """Wetland and protected-area overlap come from one query, one value per sample."""
    from app.corridor import fetch_slice_areas_m2, fetch_slice_overlaps_m2

    geojson = _curvy(3.0, 40)

    async def run():
        conn = await _connect()
        try:
            present = await conn.fetchval(
                "SELECT to_regclass('ref.nwi_wetlands') IS NOT NULL"
                " AND to_regclass('habitat.padus_gap123') IS NOT NULL"
            )
            if not present:
                pytest.skip("wetland or protected-area table is not loaded")
            areas, _ = await fetch_slice_areas_m2(conn, geojson, 215.0)
            wetland, protected = await fetch_slice_overlaps_m2(conn, geojson, 215.0)
            return areas, wetland, protected
        finally:
            await conn.close()

    areas, wetland, protected = _run(run())
    assert len(wetland) == len(protected) == len(areas)
    assert all(value >= 0 for value in wetland + protected)


# The protected-area overlap before clipping, used as the reference.
_UNCLIPPED_PROTECTED_SQL = """
SELECT a.slice_id,
       ST_Area(ST_UnaryUnion(ST_Collect(
         ST_CollectionExtract(ST_Intersection(a.geom, p.geom), 3)))) AS area_m2
FROM assigned a
JOIN habitat.padus_gap123 p
  ON p.gap_sts IN (1, 2, 3) AND ST_Intersects(a.geom, p.geom)
GROUP BY a.slice_id
"""


def test_clipped_protected_areas_match_the_unclipped_overlap():
    """A large many-vertex polygon and an overlapping second designation give
    the same per-slice protected area clipped or not. Rows are inserted inside
    a transaction that is always rolled back."""
    from app.corridor import fetch_slice_overlaps_m2

    geojson = _curvy(20.0, 120)

    async def run():
        conn = await _connect()
        try:
            present = await conn.fetchval(
                "SELECT to_regclass('ref.nwi_wetlands') IS NOT NULL"
                " AND to_regclass('habitat.padus_gap123') IS NOT NULL"
            )
            if not present:
                pytest.skip("wetland or protected-area table is not loaded")
            tx = conn.transaction()
            await tx.start()
            try:
                # A ragged 2,000-vertex polygon across the route, and a GAP 2
                # rectangle overlapping it, so the union matters.
                await conn.execute(
                    """
                    INSERT INTO habitat.padus_gap123 (gap_sts, geom)
                    SELECT 3, ST_Multi(ST_Transform(ST_SetSRID(ST_MakePolygon(ST_AddPoint(line, ST_StartPoint(line))), 4326), 5070))
                    FROM (
                      SELECT ST_MakeLine(ST_MakePoint(
                               -102.95 + 0.2 * cos(2 * pi() * k / 2000) * (1 + 0.05 * sin(37 * k)),
                               31.0 + 0.2 * sin(2 * pi() * k / 2000) * (1 + 0.05 * sin(37 * k))
                             ) ORDER BY k) AS line
                      FROM generate_series(0, 1999) k
                    ) ring
                    """
                )
                await conn.execute(
                    "INSERT INTO habitat.padus_gap123 (gap_sts, geom) SELECT 2,"
                    " ST_Multi(ST_Transform(ST_MakeEnvelope(-102.9, 30.9, -102.7, 31.1, 4326), 5070))"
                )
                _, protected = await fetch_slice_overlaps_m2(conn, geojson, 215.0)
                from app.corridor import SLICE_FROM

                reference = await conn.fetch(
                    f"{SLICE_FROM}, ref AS ({_UNCLIPPED_PROTECTED_SQL})"
                    " SELECT COALESCE(r.area_m2, 0) AS a FROM segs s"
                    " LEFT JOIN ref r ON r.slice_id = s.slice_id ORDER BY s.part_id, s.i",
                    geojson,
                    215 * 0.3048 / 2,
                )
            finally:
                await tx.rollback()
            return protected, [row["a"] for row in reference]
        finally:
            await conn.close()

    protected, reference = _run(run())
    assert len(protected) == len(reference)
    assert sum(1 for value in reference if value > 0) > 100
    for got, want in zip(protected, reference):
        assert got == pytest.approx(want, abs=0.01)
