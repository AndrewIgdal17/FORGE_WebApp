"""Run the region-filtered tile functions against the local Postgres, not a mock.

deploy/tiles/region_functions.sql is applied inside one transaction that is
rolled back, together with fixture rows for ref.nerc_regions and the four
layer tables (created only if missing, also rolled back). Skipped when the
local stack is not reachable.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import asyncpg
import pytest

SUPERUSER_DATABASE_URL = os.environ.get(
    "SUPERUSER_DATABASE_URL_TEST",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
)

SQL_FILE = Path(__file__).resolve().parents[2] / "deploy" / "tiles" / "region_functions.sql"

LAYERS = {
    # function name -> (table, geometry type, fixture name prefix)
    "ref.corridors_by_region": ("ref.corridors", "MultiLineString"),
    "ref.highways_nhs_by_region": ("ref.highways_nhs", "MultiLineString"),
    "ref.rail_narn_by_region": ("ref.rail_narn", "MultiLineString"),
    "ref.substations_display_by_region": ("ref.substations_display", "Point"),
}

# Boxes in EPSG:5070 metres. WECC holds the inside fixture; TRE is far east.
WECC_BOX = (-2_000_000, 1_000_000, -1_000_000, 2_000_000)
TRE_BOX = (0, -1_500_000, 500_000, -500_000)


def _inside_wkt(table: str) -> str:
    if table == "ref.substations_display":
        return "POINT(-1500000 1500000)"
    return "MULTILINESTRING((-1800000 1500000, -1700000 1500000))"


def _outside_wkt(table: str) -> str:
    if table == "ref.substations_display":
        return "POINT(2000000 0)"
    return "MULTILINESTRING((2000000 0, 2100000 0))"


# Extra fixtures. NEAR is ~20 km west of WECC (inside the 25 km buffer), FAR
# ~30 km west (outside it). TRE holds INSIDE_TRE. SERC has no features.
def _wkt(table: str, kind: str) -> str:
    points = {
        "NEAR_WECC": (-2_020_000, 1_500_000),
        "FAR_WECC": (-2_030_000, 1_500_000),
        "INSIDE_TRE": (250_000, -1_000_000),
    }
    x, y = points[kind]
    if table == "ref.substations_display":
        return f"POINT({x} {y})"
    # 100 km long (a shorter line collapses to under a pixel at z=0). NEAR and
    # FAR extend away from WECC so their closest point is the stated distance.
    x2 = x + 100_000 if kind == "INSIDE_TRE" else x - 100_000
    return f"MULTILINESTRING(({x} {y}, {x2} {y}))"


SERC_BOX = (3_000_000, 0, 3_500_000, 500_000)


def _name(table: str, where: str) -> str:
    return f"FIXTURE_{table.split('.')[1].upper()}_{where}"


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


def _box_wkt(box):
    xmin, ymin, xmax, ymax = box
    return (
        "MULTIPOLYGON(((" f"{xmin} {ymin}, {xmax} {ymin}, {xmax} {ymax}, "
        f"{xmin} {ymax}, {xmin} {ymin})))"
    )


@pytest.fixture
async def world(conn):
    """Install the functions and fixture rows inside a transaction that is rolled back."""

    transaction = conn.transaction()
    await transaction.start()
    try:
        await conn.execute(
            """
            CREATE SCHEMA IF NOT EXISTS ref;
            CREATE TABLE IF NOT EXISTS ref.nerc_regions (
              code text PRIMARY KEY,
              name text NOT NULL,
              geom public.geometry(MultiPolygon, 5070) NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ref.corridors (
              gid integer PRIMARY KEY, name text, volt_class text,
              geom public.geometry(MultiLineString, 5070)
            );
            CREATE TABLE IF NOT EXISTS ref.highways_nhs (
              gid integer PRIMARY KEY, name text, volt_class text,
              geom public.geometry(MultiLineString, 5070)
            );
            CREATE TABLE IF NOT EXISTS ref.rail_narn (
              gid integer PRIMARY KEY, name text, volt_class text,
              geom public.geometry(MultiLineString, 5070)
            );
            CREATE TABLE IF NOT EXISTS ref.substations_display (
              gid integer PRIMARY KEY, name text, volt_class text,
              geom public.geometry(Point, 5070)
            );
            DROP TRIGGER IF EXISTS nerc_regions_refresh_buffered ON ref.nerc_regions;
            DELETE FROM ref.nerc_regions;
            """
        )
        await conn.execute(
            "INSERT INTO ref.nerc_regions (code, name, geom) VALUES "
            "('WECC', 'WECC', ST_Multi(ST_GeomFromText($1, 5070))), "
            "('TRE', 'Texas RE', ST_Multi(ST_GeomFromText($2, 5070))), "
            "('SERC', 'SERC', ST_Multi(ST_GeomFromText($3, 5070)))",
            _box_wkt(WECC_BOX),
            _box_wkt(TRE_BOX),
            _box_wkt(SERC_BOX),
        )
        for table in ["ref.corridors", "ref.highways_nhs", "ref.rail_narn", "ref.substations_display"]:
            await conn.execute(f"DELETE FROM {table}")
            await conn.execute(
                f"INSERT INTO {table} (gid, name, volt_class, geom) VALUES "
                "(1, $1, '345', ST_GeomFromText($2, 5070)), "
                "(2, $3, '345', ST_GeomFromText($4, 5070)), "
                "(3, $5, '345', ST_GeomFromText($6, 5070)), "
                "(4, $7, '345', ST_GeomFromText($8, 5070)), "
                "(5, $9, '345', ST_GeomFromText($10, 5070))",
                _name(table, "INSIDE_WECC"),
                _inside_wkt(table),
                _name(table, "OUTSIDE"),
                _outside_wkt(table),
                _name(table, "NEAR_WECC"),
                _wkt(table, "NEAR_WECC"),
                _name(table, "FAR_WECC"),
                _wkt(table, "FAR_WECC"),
                _name(table, "INSIDE_TRE"),
                _wkt(table, "INSIDE_TRE"),
            )
        await conn.execute(SQL_FILE.read_text())
        yield conn
    finally:
        await transaction.rollback()


def _tile_params(regions) -> str:
    return json.dumps({} if regions is None else {"regions": regions})


async def _tile(conn, function: str, query_params: str) -> bytes:
    value = await conn.fetchval(
        f"SELECT {function}(0, 0, 0, $1::json)", query_params
    )
    return bytes(value) if value is not None else b""


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
async def test_tile_over_inside_feature_returns_bytes_with_its_properties(world, function):
    table, _ = LAYERS[function]
    tile = await _tile(world, function, _tile_params("WECC"))
    assert len(tile) > 0
    assert _name(table, "INSIDE_WECC").encode() in tile
    assert _name(table, "OUTSIDE").encode() not in tile
    # Non-geometry columns are expanded from to_jsonb() into properties. An
    # unexpanded value would appear as a JSON string, so '{"' must be absent.
    assert b"volt_class" in tile
    assert b'{"' not in tile


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
async def test_region_without_the_feature_returns_empty_tile(world, function):
    # SERC holds no fixture feature; TRE holds only INSIDE_TRE (see below).
    assert await _tile(world, function, _tile_params("SERC")) == b""
    table, _ = LAYERS[function]
    tre = await _tile(world, function, _tile_params("TRE"))
    assert _name(table, "INSIDE_WECC").encode() not in tre


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
@pytest.mark.parametrize("regions", ["", "XYZ", "WECC,XYZ", None])
async def test_empty_or_invalid_regions_return_empty_tile(world, function, regions):
    assert await _tile(world, function, _tile_params(regions)) == b""


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
async def test_missing_query_params_return_empty_tile(world, function):
    assert await _tile(world, function, "{}") == b""


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
async def test_buffer_keeps_20km_outside_and_drops_30km_outside(world, function):
    table, _ = LAYERS[function]
    tile = await _tile(world, function, _tile_params("WECC"))
    assert _name(table, "NEAR_WECC").encode() in tile
    assert _name(table, "FAR_WECC").encode() not in tile


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
async def test_two_region_list_returns_features_of_both(world, function):
    table, _ = LAYERS[function]
    tile = await _tile(world, function, _tile_params("TRE,WECC"))
    assert _name(table, "INSIDE_WECC").encode() in tile
    assert _name(table, "INSIDE_TRE").encode() in tile
    assert _name(table, "OUTSIDE").encode() not in tile
    assert _name(table, "FAR_WECC").encode() not in tile


async def _tile_xyz_at(conn, wkt: str, z: int) -> tuple[int, int]:
    row = await conn.fetchrow(
        "SELECT ST_X(p) AS px, ST_Y(p) AS py FROM "
        "(SELECT ST_Transform(ST_GeomFromText($1, 5070), 3857) AS p) s",
        wkt,
    )
    half = 20037508.342789244
    size = 2 * half / (2**z)
    return int((row["px"] + half) // size), int((half - row["py"]) // size)


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
async def test_higher_zoom_tile_over_feature_is_non_empty_and_neighbour_is_empty(
    world, function
):
    table, _ = LAYERS[function]
    z = 8
    # Tile over the feature's own location (point, or midpoint of the line).
    spot = "POINT(-1500000 1500000)" if table == "ref.substations_display" else "POINT(-1750000 1500000)"
    x, y = await _tile_xyz_at(world, spot, z)
    own = bytes(
        await world.fetchval(
            f"SELECT {function}($1, $2, $3, $4::json)", z, x, y, _tile_params("WECC")
        )
    )
    assert len(own) > 0
    assert _name(table, "INSIDE_WECC").encode() in own
    neighbour = await world.fetchval(
        f"SELECT {function}($1, $2, $3, $4::json)", z, x, y + 2, _tile_params("WECC")
    )
    assert bytes(neighbour) == b""


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
async def test_function_bodies_use_the_precomputed_buffer_not_union_or_buffer(world, function):
    schema, name = function.split(".")
    body = await world.fetchval(
        "SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace "
        "WHERE n.nspname = $1 AND p.proname = $2",
        schema,
        name,
    )
    lowered = body.lower()
    assert "tiles_private.nerc_regions_buffered" in lowered
    assert "st_union" not in lowered
    assert "st_buffer" not in lowered
    helper = await world.fetchval(
        "SELECT prosrc FROM pg_proc WHERE proname = 'region_codes_param'"
    )
    assert "st_union" not in helper.lower()
    assert "st_buffer" not in helper.lower()


@pytest.mark.anyio
async def test_ref_nerc_regions_has_exactly_one_geometry_column(world):
    # Martin auto-publishes ref tables; a second geometry column could add an
    # ambiguous source. The buffered shapes live in tiles_private instead.
    count = await world.fetchval(
        "SELECT count(*) FROM geometry_columns "
        "WHERE f_table_schema = 'ref' AND f_table_name = 'nerc_regions'"
    )
    assert count == 1
    buffered = await world.fetchval(
        "SELECT count(*) FROM geometry_columns "
        "WHERE f_table_schema = 'tiles_private' AND f_table_name = 'nerc_regions_buffered'"
    )
    assert buffered == 1


@pytest.mark.anyio
async def test_applying_the_file_twice_is_clean(world):
    await world.execute(SQL_FILE.read_text())
    assert await world.fetchval("SELECT count(*) FROM tiles_private.nerc_regions_buffered") == 3


@pytest.mark.anyio
async def test_trigger_refreshes_buffered_table_on_insert_update_delete(world):
    async def codes():
        rows = await world.fetch(
            "SELECT code FROM tiles_private.nerc_regions_buffered ORDER BY code"
        )
        return [r["code"] for r in rows]

    assert await codes() == ["SERC", "TRE", "WECC"]
    await world.execute(
        "INSERT INTO ref.nerc_regions (code, name, geom) VALUES "
        "('MRO', 'MRO', ST_Multi(ST_GeomFromText($1, 5070)))",
        _box_wkt((1_000_000, 1_000_000, 1_500_000, 1_500_000)),
    )
    assert await codes() == ["MRO", "SERC", "TRE", "WECC"]
    before = await world.fetchval(
        "SELECT ST_Area(geom_buffered) FROM tiles_private.nerc_regions_buffered WHERE code = 'MRO'"
    )
    await world.execute(
        "UPDATE ref.nerc_regions SET geom = ST_Multi(ST_GeomFromText($1, 5070)) WHERE code = 'MRO'",
        _box_wkt((1_000_000, 1_000_000, 2_000_000, 2_000_000)),
    )
    after = await world.fetchval(
        "SELECT ST_Area(geom_buffered) FROM tiles_private.nerc_regions_buffered WHERE code = 'MRO'"
    )
    assert after > before
    await world.execute("DELETE FROM ref.nerc_regions WHERE code = 'MRO'")
    assert await codes() == ["SERC", "TRE", "WECC"]
    await world.execute("TRUNCATE ref.nerc_regions")
    assert await codes() == []
