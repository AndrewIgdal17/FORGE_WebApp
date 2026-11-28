"""Run the NERC regions write SQL against the local Postgres, not a mock.

Everything runs inside one transaction that is rolled back, so the local
tables are left as they were. Skipped when the local stack is not reachable.
"""

from __future__ import annotations

import os
from types import SimpleNamespace

import asyncpg
import pytest

from scripts import load_nerc_regions as loader

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


async def _square(conn, x0: float):
    """A 1 km square as a MultiPolygon WKB, built by Postgres (shapely is not in this env)."""

    wkb = await conn.fetchval(
        "SELECT ST_AsBinary(ST_Multi(ST_MakeEnvelope($1::float8, 0, $2::float8, 1000, 5070)))",
        x0,
        x0 + 1000,
    )
    return SimpleNamespace(wkb=bytes(wkb))


@pytest.mark.anyio
async def test_replace_rows_writes_both_tables_and_rolls_back(conn):
    regions = [
        loader.Shape("WECC", "WECC", await _square(conn, 0)),
        loader.Shape("SERC", "SERC", await _square(conn, 5000)),
    ]
    interconnections = [loader.Shape("western", "Western", await _square(conn, 0))]
    transaction = conn.transaction()
    await transaction.start()
    try:
        await loader.replace_rows(conn, regions, interconnections)
        region_rows = await conn.fetch(
            "SELECT code, name, ST_SRID(geom) AS srid, GeometryType(geom) AS kind, "
            "ST_Area(geom) AS area FROM ref.nerc_regions ORDER BY code"
        )
        interconnection_rows = await conn.fetch(
            "SELECT code, name, ST_SRID(geom) AS srid, GeometryType(geom) AS kind "
            "FROM ref.interconnections"
        )
    finally:
        await transaction.rollback()

    assert [(r["code"], r["name"], r["srid"], r["kind"]) for r in region_rows] == [
        ("SERC", "SERC", 5070, "MULTIPOLYGON"),
        ("WECC", "WECC", 5070, "MULTIPOLYGON"),
    ]
    assert region_rows[1]["area"] == pytest.approx(1_000_000.0)
    assert [(r["code"], r["srid"], r["kind"]) for r in interconnection_rows] == [
        ("western", 5070, "MULTIPOLYGON"),
    ]


@pytest.mark.anyio
async def test_replace_rows_clears_previous_rows_in_the_same_transaction(conn):
    transaction = conn.transaction()
    await transaction.start()
    try:
        await loader.replace_rows(
            conn,
            [loader.Shape("WECC", "WECC", await _square(conn, 0))],
            [loader.Shape("western", "Western", await _square(conn, 0))],
        )
        await loader.replace_rows(
            conn,
            [loader.Shape("TRE", "Texas RE", await _square(conn, 9000))],
            [loader.Shape("ercot", "ERCOT", await _square(conn, 9000))],
        )
        codes = await conn.fetch("SELECT code FROM ref.nerc_regions ORDER BY code")
        ercot = await conn.fetch("SELECT code FROM ref.interconnections")
    finally:
        await transaction.rollback()

    assert [r["code"] for r in codes] == ["TRE"]
    assert [r["code"] for r in ercot] == ["ercot"]


@pytest.mark.anyio
async def test_forge_api_and_authenticated_can_select(conn):
    for role in ("forge_api", "authenticated"):
        for table in ("ref.nerc_regions", "ref.interconnections"):
            allowed = await conn.fetchval(
                "SELECT has_table_privilege($1::text, $2::text, 'select')",
                role,
                table,
            )
            assert allowed is True, (role, table)
