"""Run the region shapes query against the local Postgres, not a mock.

The fixture rows are written inside a transaction that is rolled back, so the
local ref.nerc_regions table is left as it was. Skipped when the local stack
is not reachable.
"""

from __future__ import annotations

import json
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


# --- Terminal check and project backfill, run against the local database.
# Fixture regions are 5070 metres. TRE covers x 0..100 km, y 0..100 km. MRO
# lies west of it, its east edge 5 km from x = -40 km. Points are given in
# 5070 metres and converted to lon/lat, because the check takes lon/lat.

_TWO_REGIONS_SQL = """
insert into ref.nerc_regions (code, name, geom) values
  ('TRE', 'Texas RE', ST_Multi(ST_MakeEnvelope(0, 0, 100000, 100000, 5070))),
  ('MRO', 'MRO', ST_Multi(ST_MakeEnvelope(-150000, 0, -45000, 100000, 5070)))
"""


async def _lonlat(conn, x: float, y: float) -> tuple[float, float]:
    row = await conn.fetchrow(
        """
        select ST_X(p) as lon, ST_Y(p) as lat
        from (
          select ST_Transform(ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 5070), 4326) as p
        ) as s
        """,
        x,
        y,
    )
    return float(row["lon"]), float(row["lat"])


@pytest.fixture
async def two_regions(conn):
    tx = conn.transaction()
    await tx.start()
    try:
        await conn.execute("delete from ref.nerc_regions")
        await conn.execute(_TWO_REGIONS_SQL)
        yield conn
    finally:
        await tx.rollback()


@pytest.mark.anyio
async def test_terminal_10km_outside_a_ticked_region_is_accepted(two_regions):
    conn = two_regions
    sending = await _lonlat(conn, -10_000, 50_000)
    receiving = await _lonlat(conn, 50_000, 50_000)

    result = await regions.check_terminals_in_regions(conn, sending, receiving, ["TRE"])

    assert result is None


@pytest.mark.anyio
async def test_terminal_40km_outside_suggests_the_neighbour_5km_away(two_regions):
    conn = two_regions
    sending = await _lonlat(conn, -40_000, 50_000)
    receiving = await _lonlat(conn, 50_000, 50_000)

    result = await regions.check_terminals_in_regions(conn, sending, receiving, ["TRE"])

    assert result is not None and result.status_code == 422
    error = json.loads(result.body)["error"]
    assert error["code"] == "terminal_outside_regions"
    assert error["detail"] == {"end": "sending", "suggested_region": "MRO"}


@pytest.mark.anyio
async def test_sea_point_suggests_null(two_regions):
    conn = two_regions
    sending = await _lonlat(conn, -500_000, -500_000)
    receiving = await _lonlat(conn, 50_000, 50_000)

    result = await regions.check_terminals_in_regions(conn, sending, receiving, ["TRE"])

    assert result is not None and result.status_code == 422
    error = json.loads(result.body)["error"]
    assert error["detail"] == {"end": "sending", "suggested_region": None}
    assert "outside FORGE's coverage" in error["message"]


@pytest.mark.anyio
async def test_only_ticked_regions_count_toward_the_check(two_regions):
    conn = two_regions
    # Inside TRE, which is not ticked: the check must fail and suggest TRE.
    sending = await _lonlat(conn, 50_000, 50_000)
    receiving = await _lonlat(conn, -100_000, 50_000)

    result = await regions.check_terminals_in_regions(conn, sending, receiving, ["MRO"])

    assert result is not None
    assert json.loads(result.body)["error"]["detail"] == {
        "end": "sending",
        "suggested_region": "TRE",
    }


@pytest.mark.anyio
async def test_receiving_end_is_reported_when_only_it_fails(two_regions):
    conn = two_regions
    sending = await _lonlat(conn, 50_000, 50_000)
    receiving = await _lonlat(conn, -40_000, 50_000)

    result = await regions.check_terminals_in_regions(conn, sending, receiving, ["TRE"])

    assert json.loads(result.body)["error"]["detail"] == {
        "end": "receiving",
        "suggested_region": "MRO",
    }


async def _project(conn, user_id, name: str, sending_xy, receiving_xy) -> str:
    sending = await _lonlat(conn, *sending_xy)
    receiving = await _lonlat(conn, *receiving_xy)
    project_id = await conn.fetchval(
        """
        insert into public.project (
            user_id, name, sending_name, receiving_name, sending_point, receiving_point
        )
        values (
            $1, $2, 'S', 'R',
            ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326),
            ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 4326)
        )
        returning id
        """,
        user_id,
        name,
        sending[0],
        sending[1],
        receiving[0],
        receiving[1],
    )
    return str(project_id)


@pytest.mark.anyio
async def test_backfill_select_and_update_pick_regions_for_both_ends(two_regions):
    from scripts import backfill_project_regions as backfill

    conn = two_regions
    # Until the not-null migration, nerc_regions is nullable. This transaction
    # drops the constraint too, and the rollback restores it.
    await conn.execute("alter table public.project alter column nerc_regions drop not null")
    user_id = await conn.fetchval(
        "insert into auth.users (id, email) values (gen_random_uuid(), "
        "'backfill-' || gen_random_uuid()::text || '@example.com') returning id"
    )
    spanning = await _project(conn, user_id, "spanning", (50_000, 50_000), (-100_000, 50_000))
    near = await _project(conn, user_id, "near", (-10_000, 50_000), (-10_000, 60_000))
    at_sea = await _project(conn, user_id, "sea", (-500_000, -500_000), (-500_000, -400_000))

    rows = await conn.fetch(backfill.SELECT_SQL, float(backfill.REGION_TOLERANCE_M))
    plans, missing = backfill.plan_backfill(rows)
    found = {str(plan.project_id): list(plan.regions) for plan in plans}
    missing_ids = {str(plan.project_id) for plan in missing}

    assert found[spanning] == ["TRE", "MRO"]
    assert found[near] == ["TRE"]
    assert missing_ids == {at_sea}

    await conn.execute(backfill.UPDATE_SQL, spanning, found[spanning])
    stored = await conn.fetchval(
        "select nerc_regions from public.project where id = $1::uuid", spanning
    )
    assert list(stored) == ["TRE", "MRO"]
