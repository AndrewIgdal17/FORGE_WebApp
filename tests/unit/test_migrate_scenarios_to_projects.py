"""Grouping of the six live scenario rows into projects.

Fixtures are the rows in the spec table "Migrating the stored rows"
(2026-11-26 webapp-01). Owner ids are the prefixes in that table.
"""

from datetime import UTC, datetime, timedelta

from scripts.migrate_scenarios_to_projects import (
    RowEnds,
    group_rows,
    ratios_from_results,
)

OWNER = "f2ac5e68"
COPY_A = "ed7200ac"
COPY_B = "3d97b236"

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
