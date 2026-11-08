"""Whole-route coverage SQL against PostGIS. Skips without FORGE_DATABASE_URL_TEST.

When ref.counties_tiger is absent, two synthetic Texas counties are created
inside a transaction that is always rolled back.
"""

import asyncio
import json
import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("FORGE_DATABASE_URL_TEST"),
    reason="FORGE_DATABASE_URL_TEST is not set",
)


def _line(*points: tuple[float, float]) -> str:
    return json.dumps(
        {"type": "MultiLineString", "coordinates": [[list(p) for p in points]]}
    )


INSIDE = _line((-99.9, 31.5), (-99.1, 31.5))  # crosses both synthetic counties
OUTSIDE = _line((-99.5, 31.5), (-98.5, 31.5))  # leaves them eastward


async def _coverage():
    import asyncpg

    from app.route import _COVERAGE_SQL, lower_48_dc_fips, route_not_covered

    conn = await asyncpg.connect(os.environ["FORGE_DATABASE_URL_TEST"])
    tx = conn.transaction()
    await tx.start()
    try:
        if await conn.fetchval("SELECT to_regclass('ref.counties_tiger') IS NULL"):
            await conn.execute("CREATE SCHEMA IF NOT EXISTS ref")
            await conn.execute(
                "CREATE TABLE ref.counties_tiger"
                " (geoid text, statefp text, geom geometry(MultiPolygon, 5070))"
            )
            await conn.execute(
                """
                INSERT INTO ref.counties_tiger (geoid, statefp, geom)
                SELECT g, '48', ST_Multi(ST_Transform(ST_MakeEnvelope(x0, 31, x1, 32, 4326), 5070))
                FROM (VALUES ('48001', -100.0, -99.5), ('48003', -99.5, -99.0)) v(g, x0, x1)
                """
            )
            outside = OUTSIDE
        else:
            # Real counties: Blaine, Washington into British Columbia.
            outside = _line((-122.75, 48.99), (-122.75, 49.10))
        results = {}
        for name, geojson in (("inside", INSIDE), ("outside", outside)):
            row = await conn.fetchrow(_COVERAGE_SQL, geojson, lower_48_dc_fips())
            results[name] = (
                row["route_m"],
                row["inside_m"],
                route_not_covered(row["route_m"], row["inside_m"], ["48"]),
            )
        return results
    finally:
        await tx.rollback()
        await conn.close()


def test_coverage_measures_length_inside_crossed_counties():
    results = asyncio.run(_coverage())
    route_m, inside_m, not_covered = results["inside"]
    assert inside_m == pytest.approx(route_m, abs=1.0)
    assert not_covered is False
    route_m, inside_m, not_covered = results["outside"]
    assert route_m - inside_m > 1.0
    assert not_covered is True
