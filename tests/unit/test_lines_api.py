"""POST /api/lines/assemble. The database is mocked."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

import pytest

from app import lines as lines_module
from app.layer_releases import CORRIDORS_RELEASE
from app.models import LineAssembleRequest
from app.terminals import TERMINAL_FOOTPRINT_MAX_M, TERMINAL_TOLERANCE_M

USER_ID = "abababab-abab-abab-abab-abababababab"

# Synthetic 4326 terminals; mocks map them to these EPSG:5070 points.
SEND_4326 = (-97.74, 30.27)
RECV_4326 = (-96.80, 32.78)
SEND_5070 = (0.0, 0.0)
RECV_5070 = (2000.0, 0.0)


def _5070_to_4326(x: float, y: float) -> list[float]:
    return [SEND_4326[0] + x / 1_000_000.0, SEND_4326[1] + y / 1_000_000.0]


def _corridor_row(
    gid: int,
    coords_5070: list[tuple[float, float]],
    *,
    voltage_kv: int | None = 138,
    volt_class: str = "AC",
) -> dict:
    return {
        "gid": gid,
        "voltage_kv": voltage_kv,
        "volt_class": volt_class,
        "sub_1": f"sub{gid}a",
        "sub_2": f"sub{gid}b",
        "source": "hifld",
        "length_m": 1609.344,
        "geom_type": "ST_LineString",
        "geojson": {"type": "LineString", "coordinates": [list(c) for c in coords_5070]},
    }


class _Conn:
    def __init__(self, corridors: dict[int, dict], footprint: tuple[bool, bool] = (False, False)):
        self.calls: list[tuple[str, tuple]] = []
        self._corridors = corridors
        self._footprint = footprint

    async def fetch(self, sql, *args):
        self.calls.append((sql, args))
        compact = " ".join(sql.lower().split())
        if "from ref.corridors" in compact:
            wanted = list(args[0])
            rows = []
            for gid in wanted:
                if gid in self._corridors:
                    rows.append(self._corridors[gid])
            return rows
        raise AssertionError(f"unexpected fetch: {sql}")

    async def fetchrow(self, sql, *args):
        self.calls.append((sql, args))
        compact = " ".join(sql.lower().split())
        if "st_transform" in compact and "st_makepoint" in compact and "4326" in compact:
            sx, sy = float(args[0]), float(args[1])
            rx, ry = float(args[2]), float(args[3])
            row = {
                "send_x": SEND_5070[0],
                "send_y": SEND_5070[1],
                "recv_x": RECV_5070[0],
                "recv_y": RECV_5070[1],
            }
            if (sx, sy) != SEND_4326 or (rx, ry) != RECV_4326:
                row = {
                    "send_x": (sx - SEND_4326[0]) * 1_000_000.0,
                    "send_y": (sy - SEND_4326[1]) * 1_000_000.0,
                    "recv_x": (rx - SEND_4326[0]) * 1_000_000.0,
                    "recv_y": (ry - SEND_4326[1]) * 1_000_000.0,
                }
            if len(args) >= 6 and args[4] is not None:
                row["stretch_x"] = (float(args[4]) - SEND_4326[0]) * 1_000_000.0
                row["stretch_y"] = (float(args[5]) - SEND_4326[1]) * 1_000_000.0
            else:
                row["stretch_x"] = None
                row["stretch_y"] = None
            return row
        if "st_covers" in compact and "ref.substations" in compact:
            return {
                "sending_inside": self._footprint[0],
                "receiving_inside": self._footprint[1],
            }
        if "st_asgeojson" in compact and "st_transform" in compact and "4326" in compact:
            payload = json.loads(args[0])
            coords_in = payload["coordinates"]
            coords_out = [_5070_to_4326(c[0], c[1]) for c in coords_in]
            return {
                "geojson": {
                    "type": payload["type"],
                    "coordinates": coords_out
                    if payload["type"] == "LineString"
                    else coords_out,
                }
            }
        raise AssertionError(f"unexpected fetchrow: {sql}")


class _Pool:
    def __init__(self, conn: _Conn):
        self.conn = conn

    def acquire(self):
        conn = self.conn

        class _Hold:
            async def __aenter__(self):
                return conn

            async def __aexit__(self, *_exc):
                return False

        return _Hold()


def _assemble(
    monkeypatch,
    corridors: dict[int, dict],
    *,
    gids: list[int],
    footprint: tuple[bool, bool] = (False, False),
    stretch_end: tuple[float, float] | None = None,
    sending_gid: int | None = 101,
    receiving_gid: int | None = 202,
) -> tuple[dict, _Conn]:
    conn = _Conn(corridors, footprint)
    pool = _Pool(conn)

    @asynccontextmanager
    async def _tx(_user_id):
        yield conn

    monkeypatch.setattr(lines_module.db_module, "forge_api_transaction", _tx)
    monkeypatch.setattr(lines_module.db_module, "get_db_pool", lambda: pool)
    monkeypatch.setattr(
        lines_module.auth_module.rate_limiter,
        "allow_write",
        lambda _user_id, now=None: True,
    )

    response = asyncio.run(
        lines_module.assemble_line(
            USER_ID,
            LineAssembleRequest(
                gids=gids,
                sending=SEND_4326,
                receiving=RECV_4326,
                sending_gid=sending_gid,
                receiving_gid=receiving_gid,
                stretch_end=stretch_end,
            ),
        )
    )
    assert response.status_code == 200, response.body
    body = json.loads(response.body)
    return body, conn


def test_happy_path_one_linestring_and_chain_order(monkeypatch):
    a = _corridor_row(101, [(0.0, 0.0), (1000.0, 0.0)])
    b = _corridor_row(102, [(1000.0, 0.0), (2000.0, 0.0)])
    body, _conn = _assemble(monkeypatch, {101: a, 102: b}, gids=[102, 101])

    assert body["route"]["type"] == "MultiLineString"
    assert len(body["route"]["coordinates"]) == 1
    assert len(body["route"]["coordinates"][0]) >= 2
    assert [p["gid"] for p in body["pieces"]] == [101, 102]
    assert body["prefill"]["old_capacity_mw"] == 394
    assert body["corridors_release"] == CORRIDORS_RELEASE


def test_unknown_gid_returns_422(monkeypatch):
    conn = _Conn({101: _corridor_row(101, [(0.0, 0.0), (1000.0, 0.0)])})

    @asynccontextmanager
    async def _tx(_user_id):
        yield conn

    monkeypatch.setattr(lines_module.db_module, "forge_api_transaction", _tx)
    monkeypatch.setattr(
        lines_module.auth_module.rate_limiter,
        "allow_write",
        lambda _user_id, now=None: True,
    )

    response = asyncio.run(
        lines_module.assemble_line(
            USER_ID,
            LineAssembleRequest(gids=[101, 999], sending=SEND_4326, receiving=RECV_4326),
        )
    )
    assert response.status_code == 422
    err = json.loads(response.body)["error"]
    assert err["code"] == "unknown_line"
    assert 999 in err["detail"]["gids"]


def test_line_not_single_returns_422(monkeypatch):
    row = _corridor_row(55, [(0, 0), (1, 0)])
    row["geom_type"] = "ST_MultiLineString"
    conn = _Conn({55: row})

    @asynccontextmanager
    async def _tx(_user_id):
        yield conn

    monkeypatch.setattr(lines_module.db_module, "forge_api_transaction", _tx)
    monkeypatch.setattr(
        lines_module.auth_module.rate_limiter,
        "allow_write",
        lambda _user_id, now=None: True,
    )

    response = asyncio.run(
        lines_module.assemble_line(
            USER_ID,
            LineAssembleRequest(gids=[55], sending=SEND_4326, receiving=RECV_4326),
        )
    )
    assert response.status_code == 422
    err = json.loads(response.body)["error"]
    assert err["code"] == "line_not_single"
    assert err["detail"]["gid"] == 55


def test_chain_end_inside_footprint_skips_sending_connector(monkeypatch):
    """Review focus 4: end inside footprint needs no connector."""
    a = _corridor_row(101, [(300.0, 0.0), (1000.0, 0.0)])
    b = _corridor_row(102, [(1000.0, 0.0), (2000.0, 0.0)])
    body, _conn = _assemble(
        monkeypatch,
        {101: a, 102: b},
        gids=[101, 102],
        footprint=(True, False),
    )
    assert all(c["end"] != "sending" for c in body["connectors"])
    sending_conn = [c for c in body["connectors"] if c["end"] == "sending"]
    assert not sending_conn


def test_chain_end_300m_outside_gets_sending_connector(monkeypatch):
    a = _corridor_row(101, [(300.0, 0.0), (1000.0, 0.0)])
    b = _corridor_row(102, [(1000.0, 0.0), (2000.0, 0.0)])
    body, _conn = _assemble(monkeypatch, {101: a, 102: b}, gids=[101, 102], footprint=(False, False))
    sending_conn = next(c for c in body["connectors"] if c["end"] == "sending")
    assert sending_conn["length_m"] == pytest.approx(300.0, abs=1.0)


def test_footprint_inside_but_within_1km_still_reaches(monkeypatch):
    """183 m off centroid but inside footprint → no sending connector."""
    a = _corridor_row(101, [(TERMINAL_TOLERANCE_M + 83.0, 0.0), (1000.0, 0.0)])
    b = _corridor_row(102, [(1000.0, 0.0), (2000.0, 0.0)])
    dist = TERMINAL_TOLERANCE_M + 83.0
    assert dist < TERMINAL_FOOTPRINT_MAX_M
    body, _conn = _assemble(
        monkeypatch,
        {101: a, 102: b},
        gids=[101, 102],
        footprint=(True, False),
    )
    assert all(c["end"] != "sending" for c in body["connectors"])


def test_response_carries_corridors_release(monkeypatch):
    row = _corridor_row(7, [(0.0, 0.0), (2000.0, 0.0)])
    body, _ = _assemble(monkeypatch, {7: row}, gids=[7], sending_gid=None, receiving_gid=None)
    assert body["corridors_release"] == CORRIDORS_RELEASE