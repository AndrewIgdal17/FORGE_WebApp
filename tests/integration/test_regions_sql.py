"""Run the region shapes query against the local Postgres, not a mock.

The fixture rows are written inside a transaction that is rolled back, so the
local ref.nerc_regions table is left as it was. Skipped when the local stack
is not reachable.
"""

from __future__ import annotations

import os

import asyncpg
import pytest

from app import regions

SUPERUSER_DATABASE_URL = os.environ.get(
    "SUPERUSER_DATABASE_URL_TEST",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def conn():
    try:
        connection = await asyncpg.connect(dsn=SUPERUSER_DATABASE_URL, timeout=2)
    except Exception:  # noqa: BLE001 — any connect failure means the local stack is down
        pytest.skip("Local Postgres is not reachable.")
    yield connection
    await connection.close()


@pytest.mark.anyio
async def test_region_shapes_query_returns_4326_features_with_code_and_name(conn):
    tx = conn.transaction()
    await tx.start()
    try:
        # Fixtures in EPSG:5070 metres near the lon/lat origin of the Albers
        # projection (about -96, 23), so the expected output is continental US.
        await conn.execute("delete from ref.nerc_regions")
        await conn.execute(
            """
            insert into ref.nerc_regions (code, name, geom) values
              ('WECC', 'WECC', ST_Multi(ST_MakeEnvelope(-200000, -100000, 200000, 100000, 5070))),
              ('TRE', 'Texas RE', ST_Multi(ST_MakeEnvelope(300000, 0, 600000, 300000, 5070)))
            """
        )
        rows = await conn.fetch(regions._REGIONS_SQL)
        collection = regions.build_feature_collection(rows)
    finally:
        await tx.rollback()

    assert collection["type"] == "FeatureCollection"
    assert [f["properties"] for f in collection["features"]] == [
        {"code": "WECC", "name": "WECC"},
        {"code": "TRE", "name": "Texas RE"},
    ]
    for feature in collection["features"]:
        geometry = feature["geometry"]
        # PostGIS returns a Polygon when simplification leaves one part.
        assert geometry["type"] in ("Polygon", "MultiPolygon")
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        for polygon in polygons:
            for ring in polygon:
                for lon, lat in ring:
                    assert -125 < lon < -65, "longitude is not EPSG:4326 degrees"
                    assert 20 < lat < 55, "latitude is not EPSG:4326 degrees"
