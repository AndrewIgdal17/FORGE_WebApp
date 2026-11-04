"""Corridor slices. Task 5 fills the PostGIS query."""

from __future__ import annotations

import asyncpg


async def fetch_wetland_areas_m2(
    conn: asyncpg.Connection, geojson: str, row_width_ft: float
) -> list[float]:
    await conn.fetchval("SELECT 1 FROM ref.nwi_wetlands LIMIT 0")
    raise RuntimeError("slice query is not implemented")
