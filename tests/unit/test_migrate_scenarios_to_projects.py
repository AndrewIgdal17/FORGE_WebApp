"""Grouping of the six live scenario rows into projects.

Fixtures are the rows in the spec table "Migrating the stored rows"
(2026-11-26 webapp-01). Owner ids are the prefixes in that table.
"""

from __future__ import annotations

import json
import copy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.terminals import haversine_m
from scripts.migrate_scenarios_to_projects import (
    MigrationError,
    ProjectPlan,
    RowEnds,
    Terminal,
    _write_plans,
    format_report,
    group_rows,
    ratios_from_results,
    scenario_end_report,
)

OWNER = "f2ac5e68-0000-4000-8000-000000000001"
COPY_A = "ed7200ac-0000-4000-8000-000000000002"
COPY_B = "3d97b236-0000-4000-8000-000000000003"

# (gid, name, (lon, lat)). Both SunZia ends are distinct points.
SUNZIA_SENDING = (85896, "SunZia HVDC Converter Station", (-107.5, 34.2))
SUNZIA_RECEIVING = (82496, "SunZia HVDC Converter Station", (-106.1, 33.4))
CANYON = (847, "Canyon Substation", (-106.9, 35.1))
RUTHERFORD = (19279, "Rutherford Substation", (-81.9, 35.4))
HICKORY = (19959, "Hickory Tie Substation", (-81.3412, 35.7510))

# Formats as "Point at 35.5928, -81.2841" (lat, lon, four decimals).
AS_RECEIVING = (-81.2841, 35.5928)

T0 = datetime(2026, 11, 1, tzinfo=UTC)


def _row(
    scenario_id: str,
    name: str,
    user_id: str,
    source: str,
    created_at: datetime,
    sending: tuple[float, float],
    receiving: tuple[float, float],
    sending_sub,
    receiving_sub,
) -> RowEnds:
    return RowEnds(
        scenario_id=scenario_id,
        name=name,
        user_id=user_id,
        source=source,
        created_at=created_at,
        sending=sending,
        receiving=receiving,
        sending_sub=sending_sub,
        receiving_sub=receiving_sub,
    )


def live_rows() -> list[RowEnds]:
    """The six stored rows, oldest SunZia paper scenario first."""
    send_pt = SUNZIA_SENDING[2]
    recv_pt = SUNZIA_RECEIVING[2]
    return [
        _row(
            "sunzia-delay17",
            "SunZia_Delay17",
            OWNER,
            "paper",
            T0,
            send_pt,
            recv_pt,
            SUNZIA_SENDING,
            SUNZIA_RECEIVING,
        ),
        _row(
            "sunzia-delay2",
            "SunZia_Delay2",
            OWNER,
            "paper",
            T0 + timedelta(days=1),
            send_pt,
            recv_pt,
            SUNZIA_SENDING,
            SUNZIA_RECEIVING,
        ),
        _row(
            "sunzia-copy-2",
            "SunZia_Delay17 (copy) (2)",
            COPY_A,
            "manual",
            T0 + timedelta(days=2),
            send_pt,
            recv_pt,
            SUNZIA_SENDING,
            SUNZIA_RECEIVING,
        ),
        _row(
            "sunzia-copy-4",
            "SunZia_Delay17 (copy) (4)",
            COPY_B,
            "manual",
            T0 + timedelta(days=3),
            send_pt,
            recv_pt,
            SUNZIA_SENDING,
            SUNZIA_RECEIVING,
        ),
        _row(
            "test1",
            "Test1",
            OWNER,
            "wizard",
            T0 + timedelta(days=4),
            CANYON[2],
            RUTHERFORD[2],
            CANYON,
            RUTHERFORD,
        ),
        _row(
            "as",
            "as",
            OWNER,
            "wizard",
            T0 + timedelta(days=5),
            HICKORY[2],
            AS_RECEIVING,
            HICKORY,
            None,
        ),
    ]


def test_group_rows_six_live_rows_make_five_plans():
    rows = live_rows()
    plans = group_rows(rows)
    by_id = {row.scenario_id: row for row in rows}

    assert len(plans) == 5

    sunzia = [
        plan
        for plan in plans
        if plan.user_id == OWNER and len(plan.scenario_ids) == 2
    ]
    assert len(sunzia) == 1
    assert by_id[sunzia[0].base_scenario_id].name == "SunZia_Delay17"
    assert {by_id[scenario_id].name for scenario_id in sunzia[0].scenario_ids} == {
        "SunZia_Delay17",
        "SunZia_Delay2",
    }

    as_plan = next(
        plan
        for plan in plans
        if any(by_id[scenario_id].name == "as" for scenario_id in plan.scenario_ids)
    )
    assert as_plan.receiving.name == "Point at 35.5928, -81.2841"
    assert as_plan.receiving.gid is None


def test_missing_ratio_is_blank_not_zero():
    assert ratios_from_results(None) == ("", "", "")
    assert ratios_from_results({"bcr": {}}) == ("", "", "")
    assert ratios_from_results({"bcr": {"bcr_societal": None}}) == ("", "", "")
    assert ratios_from_results(
        {"bcr": {"bcr_societal": 0, "bcr_ratepayer": 0.16, "bcr_utility": 1.1}}
    ) == ("0", "0.16", "1.1")


def _offset_north(point: tuple[float, float], delta_m: float) -> tuple[float, float]:
    delta_deg = delta_m / 111_194.926
    return (point[0], point[1] + delta_deg)


def _route(
    first: tuple[float, float],
    last: tuple[float, float],
) -> dict:
    mid = ((first[0] + last[0]) / 2, (first[1] + last[1]) / 2)
    return {
        "type": "MultiLineString",
        "coordinates": [[[first[0], first[1]], [mid[0], mid[1]], [last[0], last[1]]]],
    }


def _sunzia_plan() -> ProjectPlan:
    send_pt = SUNZIA_SENDING[2]
    recv_pt = SUNZIA_RECEIVING[2]
    return ProjectPlan(
        user_id=OWNER,
        name="SunZia HVDC Converter Station → SunZia HVDC Converter Station",
        sending=Terminal(gid=SUNZIA_SENDING[0], name=SUNZIA_SENDING[1], point=send_pt),
        receiving=Terminal(gid=SUNZIA_RECEIVING[0], name=SUNZIA_RECEIVING[1], point=recv_pt),
        scenario_ids=("a1111111-1111-4111-8111-111111111111",),
        base_scenario_id="a1111111-1111-4111-8111-111111111111",
    )


def test_report_rows_include_end_move_columns():
    plan = _sunzia_plan()
    scenario_id = plan.scenario_ids[0]
    names = {scenario_id: "SunZia_Delay17"}
    send_pt = plan.sending.point
    recv_pt = plan.receiving.point
    route = _route(_offset_north(send_pt, 183), _offset_north(recv_pt, 183))
    ends = scenario_end_report(route, plan, (True, True))
    text = format_report([plan], names, {scenario_id: ends})
    header = text.splitlines()[1]
    assert header.endswith("\tsend_m\tsend_in\trecv_m\trecv_in")
    row = text.splitlines()[2]
    cells = row.split("\t")
    assert float(cells[-4]) == pytest.approx(183, abs=5)
    assert float(cells[-2]) == pytest.approx(183, abs=5)
    assert cells[-3] == "true"
    assert cells[-1] == "true"


@pytest.fixture
def anyio_backend():
    return "asyncio"


class _FakeConn:
    def __init__(self) -> None:
        self.scenario_updates: list[tuple] = []
        self.project_inserts = 0

    async def execute(self, sql: str, *args):
        if "insert into public.project" in sql:
            self.project_inserts += 1
            return None
        if "update public.scenario" in sql:
            self.scenario_updates.append(args)
            return "UPDATE 1"
        return None

    async def fetchval(self, *_args, **_kwargs):
        return uuid4()


@pytest.mark.anyio
async def test_apply_snaps_sunzia_like_183m_inside_footprint(monkeypatch):
    plan = _sunzia_plan()
    scenario_id = plan.scenario_ids[0]
    send_pt = plan.sending.point
    recv_pt = plan.receiving.point
    route = _route(_offset_north(send_pt, 183), _offset_north(recv_pt, 183))
    routes = {scenario_id: copy.deepcopy(route)}

    async def _flags(_conn, _route, _send_gid, _recv_gid):
        return (True, True)

    monkeypatch.setattr(
        "scripts.migrate_scenarios_to_projects.footprint_flags",
        _flags,
    )
    conn = _FakeConn()
    await _write_plans(conn, [plan], routes)

    assert conn.scenario_updates
    snapped = json.loads(conn.scenario_updates[0][1])
    assert snapped["coordinates"][0][0] == [send_pt[0], send_pt[1]]
    assert snapped["coordinates"][-1][-1] == [recv_pt[0], recv_pt[1]]
    assert haversine_m(tuple(snapped["coordinates"][0][0]), send_pt) == pytest.approx(
        0, abs=1
    )


@pytest.mark.anyio
async def test_apply_refuses_1200m_inside_footprint(monkeypatch):
    plan = _sunzia_plan()
    scenario_id = plan.scenario_ids[0]
    send_pt = plan.sending.point
    recv_pt = plan.receiving.point
    route = _route(_offset_north(send_pt, 1200), recv_pt)
    routes = {scenario_id: route}

    async def _flags(_conn, _route, _send_gid, _recv_gid):
        return (True, False)

    monkeypatch.setattr(
        "scripts.migrate_scenarios_to_projects.footprint_flags",
        _flags,
    )
    conn = _FakeConn()
    with pytest.raises(MigrationError) as exc:
        await _write_plans(conn, [plan], routes)
    assert "sending" in str(exc.value)
    assert conn.scenario_updates == []
