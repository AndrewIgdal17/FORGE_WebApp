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
            DELETE FROM ref.nerc_regions;
            """
        )
        await conn.execute(
            "INSERT INTO ref.nerc_regions (code, name, geom) VALUES "
            "('WECC', 'WECC', ST_Multi(ST_GeomFromText($1, 5070))), "
            "('TRE', 'Texas RE', ST_Multi(ST_GeomFromText($2, 5070)))",
            _box_wkt(WECC_BOX),
            _box_wkt(TRE_BOX),
        )
        for table in ["ref.corridors", "ref.highways_nhs", "ref.rail_narn", "ref.substations_display"]:
            await conn.execute(f"DELETE FROM {table}")
            await conn.execute(
                f"INSERT INTO {table} (gid, name, volt_class, geom) VALUES "
                "(1, $1, '345', ST_GeomFromText($2, 5070)), "
                "(2, $3, '345', ST_GeomFromText($4, 5070))",
                _name(table, "INSIDE_WECC"),
                _inside_wkt(table),
                _name(table, "OUTSIDE"),
                _outside_wkt(table),
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
    assert await _tile(world, function, _tile_params("TRE")) == b""


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
@pytest.mark.parametrize("regions", ["", "XYZ", "WECC,XYZ", None])
async def test_empty_or_invalid_regions_return_empty_tile(world, function, regions):
    assert await _tile(world, function, _tile_params(regions)) == b""


@pytest.mark.anyio
@pytest.mark.parametrize("function", list(LAYERS))
async def test_missing_query_params_return_empty_tile(world, function):
    assert await _tile(world, function, "{}") == b""
