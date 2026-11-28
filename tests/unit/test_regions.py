"""NERC region codes, normalization, and the region shapes endpoint. The database is mocked.

The SQL the endpoint runs is checked against the local Postgres in
tests/integration/test_regions_sql.py.
"""

from __future__ import annotations

import asyncio
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


# --- Terminal check (the SQL is run against the local database in
# tests/integration/test_regions_sql.py; these tests read the rows it returns).

SENDING = (-97.74, 30.27)
RECEIVING = (-96.80, 32.78)


def _end(end_name: str, ticked_m, suggested_code=None) -> dict:
    return {"end_name": end_name, "ticked_m": ticked_m, "suggested_code": suggested_code}


def _check(rows, names=None):
    conn = _Conn(rows)
    return asyncio.run(
        regions.check_terminals_in_regions(conn, SENDING, RECEIVING, ["TRE"], names=names)
    ), conn


def test_terminal_10km_outside_a_ticked_region_is_accepted():
    result, conn = _check([_end("sending", 10_000.0), _end("receiving", 0.0)])

    assert result is None
    assert len(conn.calls) == 1


def test_terminal_40km_outside_suggests_the_unticked_neighbour():
    result, _conn = _check(
        [_end("sending", 40_000.0, "MRO"), _end("receiving", 0.0)],
        names=("Austin", "Dallas"),
    )

    assert result.status_code == 422
    error = json.loads(result.body)["error"]
    assert error["code"] == "terminal_outside_regions"
    assert error["detail"] == {"end": "sending", "suggested_region": "MRO"}
    assert "Austin" in error["message"]
    assert "MRO" in error["message"]


def test_point_outside_every_region_suggests_null_and_says_coverage():
    result, _conn = _check([_end("sending", 600_000.0, None), _end("receiving", 0.0)])

    assert result.status_code == 422
    error = json.loads(result.body)["error"]
    assert error["detail"] == {"end": "sending", "suggested_region": None}
    assert "outside FORGE's coverage" in error["message"]


def test_receiving_end_is_named_when_only_it_fails():
    result, _conn = _check([_end("sending", 0.0), _end("receiving", 30_000.0, "WECC")])

    assert result.status_code == 422
    assert json.loads(result.body)["error"]["detail"] == {
        "end": "receiving",
        "suggested_region": "WECC",
    }


def test_sending_end_is_reported_first_when_both_fail():
    result, _conn = _check(
        [_end("sending", 40_000.0, "MRO"), _end("receiving", 50_000.0, None)]
    )

    assert json.loads(result.body)["error"]["detail"]["end"] == "sending"


def test_no_ticked_region_distance_counts_as_outside():
    result, _conn = _check([_end("sending", None, "MRO"), _end("receiving", 0.0)])

    assert result.status_code == 422
    assert json.loads(result.body)["error"]["detail"]["end"] == "sending"
