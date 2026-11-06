import json
import os

import pytest

from app.corridor import SLICE_FROM, wetland_filter_sql
from app.terrain_rules import load_classification


def test_filter_keeps_a_code_only_when_every_part_matches():
    sql = wetland_filter_sql(load_classification().wetland)
    assert "LIKE 'PEM%'" in sql
    assert "LIKE 'E2EM%'" in sql
    assert "regexp_split_to_table" in sql
    assert "position('/'" not in sql


def test_slice_sql_partitions_with_bisector_blades():
    assert "ST_Buffer" in SLICE_FROM
    assert "ST_Split" in SLICE_FROM
    assert "endcap=flat join=mitre" in SLICE_FROM
    assert "/ 30.0" in SLICE_FROM


# Two parts. Each part has a corner (three positions).
_CORNERED_ROUTE = {
    "type": "MultiLineString",
    "coordinates": [
        [[-97.74, 30.27], [-97.735, 30.27], [-97.735, 30.28]],
        [[-97.70, 30.30], [-97.695, 30.305], [-97.690, 30.30]],
    ],
}


@pytest.mark.skipif(
    not os.environ.get("FORGE_DATABASE_URL_TEST"),
    reason="FORGE_DATABASE_URL_TEST is not set",
)
def test_sample_and_slice_midpoints_coincide():
    """Each sample sits on the midpoint of the slice with the same index."""
    import asyncio

    import asyncpg

    from app.route import _SAMPLE_POINTS_SQL

    geojson = json.dumps(_CORNERED_ROUTE)
    slice_midpoints_sql = f"""
    {SLICE_FROM}
    SELECT ST_X(ST_LineInterpolatePoint(seg, 0.5)) AS x,
           ST_Y(ST_LineInterpolatePoint(seg, 0.5)) AS y
    FROM segs
    ORDER BY part_id, i
    """

    async def run():
        conn = await asyncpg.connect(os.environ["FORGE_DATABASE_URL_TEST"])
        try:
            samples = await conn.fetch(_SAMPLE_POINTS_SQL, geojson)
            slices = await conn.fetch(slice_midpoints_sql, geojson, 15.24)
            return samples, slices
        finally:
            await conn.close()

    samples, slices = asyncio.run(run())
    assert len(samples) == len(slices)
    assert len(samples) >= 2
    for sample, slice_row in zip(samples, slices, strict=True):
        assert float(sample["x"]) == pytest.approx(float(slice_row["x"]), abs=1e-4)
        assert float(sample["y"]) == pytest.approx(float(slice_row["y"]), abs=1e-4)


def test_protected_area_sql_unions_gap_status_1_through_3():
    from app.corridor import PROTECTED_AREA_SQL

    assert "habitat.padus_gap123" in PROTECTED_AREA_SQL
    assert "gap_sts IN (1, 2, 3)" in PROTECTED_AREA_SQL
    assert "ST_UnaryUnion" in PROTECTED_AREA_SQL
    assert "ST_CollectionExtract" in PROTECTED_AREA_SQL
    assert "padus_sub" not in PROTECTED_AREA_SQL
    assert "critical_habitat" not in PROTECTED_AREA_SQL
    assert "SUM(ST_Area" not in PROTECTED_AREA_SQL


@pytest.mark.skipif(
    not os.environ.get("FORGE_DATABASE_URL_TEST"),
    reason="FORGE_DATABASE_URL_TEST is not set",
)
def test_two_copies_of_one_square_count_once():
    import asyncio

    import asyncpg

    square = "POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))"

    async def run():
        conn = await asyncpg.connect(os.environ["FORGE_DATABASE_URL_TEST"])
        try:
            await conn.execute(
                "CREATE TEMP TABLE padus_overlap_fixture "
                "(geom geometry(Polygon, 5070))"
            )
            await conn.execute(
                """
                INSERT INTO padus_overlap_fixture (geom)
                VALUES
                  (ST_GeomFromText($1, 5070)),
                  (ST_GeomFromText($1, 5070))
                """,
                square,
            )
            return await conn.fetchrow(
                """
                SELECT ST_Area(ST_UnaryUnion(ST_Collect(geom))) AS union_area,
                       SUM(ST_Area(geom)) AS summed_area
                FROM padus_overlap_fixture
                """
            )
        finally:
            await conn.close()

    row = asyncio.run(run())
    assert float(row["union_area"]) == pytest.approx(100.0)
    assert float(row["summed_area"]) == pytest.approx(200.0)
