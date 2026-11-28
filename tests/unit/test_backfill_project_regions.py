"""Backfill of project NERC regions: the plan, the stop rule, and the write order.

The database is mocked here. The SQL strings run against the local Postgres in
tests/integration/test_regions_sql.py.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import pytest

from scripts import backfill_project_regions as backfill

OWNER = "11111111-1111-1111-1111-111111111111"
PAIR_ID = "22222222-2222-2222-2222-222222222222"
SEA_ID = "33333333-3333-3333-3333-333333333333"


def _row(project_id: str, name: str, regions: list[str]) -> dict:
    return {"project_id": project_id, "user_id": OWNER, "name": name, "regions": regions}


class _Conn:
    def __init__(self, rows):
        self.rows = rows
        self.executed: list[tuple[str, tuple]] = []

    async def fetch(self, sql, *args):
        assert sql == backfill.SELECT_SQL
        return self.rows

    async def execute(self, sql, *args):
        self.executed.append((sql, args))
        return "UPDATE 1"

    @asynccontextmanager
    async def transaction(self):
        yield self

    async def close(self):
        return None


def _patch_connect(monkeypatch, conn: _Conn) -> None:
    async def _connect(_url):
        return conn

    monkeypatch.setattr(backfill, "_connect", _connect)


def test_plan_keeps_projects_with_regions_and_lists_the_rest():
    plans, missing = backfill.plan_backfill(
        [_row(PAIR_ID, "pair", ["MRO", "TRE"]), _row(SEA_ID, "sea", [])]
    )

    assert [plan.regions for plan in plans] == [("TRE", "MRO")]
    assert [plan.name for plan in missing] == ["sea"]


def test_mode_defaults_to_report_and_apply_is_separate():
    assert backfill._parse_mode([]) == "report"
    assert backfill._parse_mode(["--apply"]) == "apply"
    with pytest.raises(SystemExit):
        backfill._parse_mode(["--apply", "--report"])


def test_apply_stops_before_any_write_when_a_project_has_no_region(monkeypatch):
    conn = _Conn([_row(PAIR_ID, "pair", ["TRE"]), _row(SEA_ID, "sea", [])])
    _patch_connect(monkeypatch, conn)

    with pytest.raises(backfill.BackfillError, match="sea"):
        asyncio.run(backfill.apply("postgresql://example"))

    assert conn.executed == []


def test_apply_acts_as_each_owner_then_writes_their_regions(monkeypatch):
    conn = _Conn([_row(PAIR_ID, "pair", ["MRO", "TRE"])])
    _patch_connect(monkeypatch, conn)

    assert asyncio.run(backfill.apply("postgresql://example")) == 0

    claim_sql, claim_args = conn.executed[0]
    assert "request.jwt.claim.sub" in claim_sql
    assert claim_args == (OWNER,)
    update_sql, update_args = conn.executed[1]
    assert update_sql == backfill.UPDATE_SQL
    assert update_args == (PAIR_ID, ["TRE", "MRO"])


def test_main_exits_1_when_the_database_url_is_missing(monkeypatch):
    monkeypatch.delenv("FORGE_DATABASE_URL", raising=False)

    with pytest.raises(SystemExit) as exc:
        backfill.main([])

    assert exc.value.code == 1
