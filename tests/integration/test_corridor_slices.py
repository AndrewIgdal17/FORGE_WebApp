"""Slice areas partition the corridor. Skips without FORGE_DATABASE_URL_TEST."""

import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("FORGE_DATABASE_URL_TEST"),
    reason="FORGE_DATABASE_URL_TEST is not set",
)


def test_right_angle_slices_cover_the_buffer_once():
    import asyncio

    import asyncpg

    from app.corridor import fetch_slice_areas_m2

    geojson = (
        '{"type":"MultiLineString","coordinates":'
        '[[[0,0],[0.001,0],[0.001,0.001]]]}'
    )

    async def run():
        conn = await asyncpg.connect(os.environ["FORGE_DATABASE_URL_TEST"])
        try:
            return await fetch_slice_areas_m2(conn, geojson, 100.0)
        finally:
            await conn.close()

    areas, buffer_area = asyncio.run(run())
    assert areas
    assert sum(areas) == pytest.approx(buffer_area, rel=0.01)
    assert all(area > 0 for area in areas)
