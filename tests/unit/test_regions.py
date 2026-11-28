"""NERC region codes, normalization, and the region shapes endpoint. The database is mocked.

The SQL the endpoint runs is checked against the local Postgres in
tests/integration/test_regions_sql.py.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient

from app import db as db_module
from app import regions
from app.main import app


class _Conn:
    def __init__(self, rows):
        self.rows = rows
        self.calls: list[str] = []

    async def fetch(self, sql, *args):
        self.calls.append(sql)
        return self.rows


class _Pool:
    def __init__(self, conn: _Conn):
        self.conn = conn
        self.acquires = 0

    def acquire(self):
        self.acquires += 1
        conn = self.conn

        @asynccontextmanager
        async def _hold():
            yield conn

        return _hold()


def _row(code: str, name: str) -> dict:
    geometry = {
        "type": "MultiPolygon",
        "coordinates": [[[[-100.0, 30.0], [-99.0, 30.0], [-99.0, 31.0], [-100.0, 30.0]]]],
    }
    return {"code": code, "name": name, "geojson": json.dumps(geometry)}


def test_region_codes_are_the_six_in_order_with_names():
    assert regions.REGION_CODES == ("WECC", "TRE", "MRO", "NPCC", "RF", "SERC")
    assert regions.REGION_NAMES == {
        "WECC": "WECC",
        "TRE": "Texas RE",
        "MRO": "MRO",
        "NPCC": "NPCC",
        "RF": "ReliabilityFirst",
        "SERC": "SERC",
    }


def test_normalize_dedupes_and_sorts_by_region_order():
    assert regions.normalize_regions(["SERC", "WECC", "SERC", "RF"]) == [
        "WECC",
        "RF",
        "SERC",
    ]


def test_normalize_keeps_a_single_region():
    assert regions.normalize_regions(["TRE"]) == ["TRE"]


@pytest.mark.parametrize("codes", [[], ["XYZ"], ["WECC", "frcc"], ["SERC", None], [["WECC"]]])
def test_normalize_rejects_empty_and_unknown_codes(codes):
    with pytest.raises(ValueError):
        regions.normalize_regions(codes)


def test_endpoint_returns_feature_collection_with_cache_header(monkeypatch):
    conn = _Conn([_row("SERC", "SERC"), _row("WECC", "WECC")])
    pool = _Pool(conn)
    monkeypatch.setattr(db_module, "get_db_pool", lambda: pool)

    response = TestClient(app).get("/api/nerc-regions")

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "public, max-age=86400"
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert [f["properties"] for f in body["features"]] == [
        {"code": "WECC", "name": "WECC"},
        {"code": "SERC", "name": "SERC"},
    ]
    feature = body["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "MultiPolygon"
    assert pool.acquires == 1


def test_endpoint_sql_simplifies_to_about_1km_and_outputs_4326(monkeypatch):
    conn = _Conn([])
    monkeypatch.setattr(db_module, "get_db_pool", lambda: _Pool(conn))

    response = TestClient(app).get("/api/nerc-regions")

    assert response.status_code == 200
    assert response.json() == {"type": "FeatureCollection", "features": []}
    sql = " ".join(conn.calls[0].split())
    assert "ST_SimplifyPreserveTopology(geom, 1000)" in sql
    assert "ST_Transform(" in sql and ", 4326)" in sql
    assert "from ref.nerc_regions" in sql
