"""Read-only report of stored scenario rows against the v4 paths."""

import inspect

from scripts.report_v5_stored_changes import (
    classify_row,
    format_report,
    main,
    measure_saved_routes,
)

GREENFIELD = (
    "17_congestion_reductions.greenfield_congestion_reductions"
    ".prices.average_congestion_price"
)
INCREMENTAL = (
    "17_congestion_reductions.incremental_congestion_reductions"
    ".prices.average_congestion_price"
)
LOAD = "01_project_technical_details.project.value_of_load_per_mwh"
REMOVED = (GREENFIELD, INCREMENTAL, LOAD)
RATIOS = ("bcr_societal", "bcr_ratepayer", "bcr_utility")
MEASUREMENTS = (
    "congestion_spread_per_mwh",
    "hours_receiving_more_congested",
    "hours_sending_more_congested",
    "receiving_energy_value_per_mwh",
)
COLUMNS = (
    "id",
    "name",
    "route_present",
    "subsea_leave",
    *REMOVED,
    *RATIOS,
    *MEASUREMENTS,
    *RATIOS,
)
OLD_RATIO_AT = 7
MEASURED_AT = 10
NEW_RATIO_AT = 14


def _bcr(societal: float, ratepayer: float, utility: float) -> dict:
    return {
        "bcr": {
            "bcr_societal": societal,
            "bcr_ratepayer": ratepayer,
            "bcr_utility": utility,
        }
    }


def _table(text: str) -> list[list[str]]:
    lines = text.splitlines()
    header = lines[0].split("\t")
    body = [line.split("\t") for line in lines[1:]]
    assert header == list(COLUMNS)
    assert all(len(cells) == len(COLUMNS) for cells in body)
    return body


def _by_name(body: list[list[str]]) -> dict[str, list[str]]:
    return {cells[1]: cells for cells in body}


def test_acceptance_stored_rows_report_does_not_write():
    stored = [
        ("tbc-1", "TBC_Delay4", {"conductor": "Subsea"}, _bcr(1.5, 1.25, 1.75), True),
        (
            "tbc-2",
            "TBC_Delay4 copy",
            {"line": {"cable": "Subsea"}},
            _bcr(2.5, 2.25, 2.75),
            False,
        ),
        (
            "tbc-3",
            "TBC_Delay4_copy",
            {GREENFIELD: 15, "type": "Subsea"},
            _bcr(3.5, 3.25, 3.75),
            True,
        ),
        (
            "tbc-4",
            "TBC_Delay4 (copy)",
            {"section": {"end": "Subsea"}},
            None,
            False,
        ),
        ("n-1", "Inland Alpha", {INCREMENTAL: 9}, _bcr(5.5, 5.25, 5.75), False),
        (
            "n-2",
            "Inland Bravo",
            {GREENFIELD: 1, LOAD: 40},
            _bcr(6.5, 6.25, 6.75),
            True,
        ),
        (
            "n-3",
            "Inland Charlie",
            {
                "17_congestion_reductions": {
                    "incremental_congestion_reductions": {
                        "prices": {"average_congestion_price": 11}
                    }
                }
            },
            _bcr(7.5, 7.25, 7.75),
            False,
        ),
        ("n-4", "Inland Delta", {}, None, False),
        ("n-5", "Harbor Echo", {"cable": "Subsea"}, _bcr(8.5, 8.25, 8.75), True),
        (
            "n-6",
            "Inland Foxtrot",
            {GREENFIELD: 2, INCREMENTAL: 3, LOAD: 41},
            _bcr(9.5, 9.25, 9.75),
            False,
        ),
    ]
    for index in range(1, 11):
        stored.append((f"p-{index:02d}", f"Plain-{index:02d}", {}, None, False))
    assert len(stored) == 20
    assert sum(name.startswith("TBC_") for _id, name, *_rest in stored) == 4

    classified = []
    for row_id, name, changes, results, route_present in stored:
        row = classify_row(changes, results, route_present, name)
        row["id"] = row_id
        classified.append(row)

    delay = classified[0]
    assert delay["subsea_leave"] is True
    assert delay["removed"] == {path: False for path in REMOVED}
    assert delay["bcr"] == {
        "bcr_societal": 1.5,
        "bcr_ratepayer": 1.25,
        "bcr_utility": 1.75,
    }
    assert delay["measured"] == {key: "" for key in (*MEASUREMENTS, *RATIOS)}

    copy_with_price = classified[2]
    assert copy_with_price["subsea_leave"] is True
    assert copy_with_price["removed"][GREENFIELD] is True
    assert copy_with_price["removed"][INCREMENTAL] is False
    assert copy_with_price["removed"][LOAD] is False

    alpha = classified[4]
    assert alpha["subsea_leave"] is False
    assert alpha["removed"][INCREMENTAL] is True
    assert alpha["removed"][GREENFIELD] is False
    assert alpha["removed"][LOAD] is False
    assert alpha["bcr"]["bcr_societal"] == 5.5

    charlie = classified[6]
    assert charlie["removed"][INCREMENTAL] is True
    assert charlie["removed"][GREENFIELD] is False

    blank_results = classified[7]
    assert blank_results["bcr"] == {key: "" for key in RATIOS}

    harbor = classified[8]
    assert harbor["name"] == "Harbor Echo"
    assert harbor["subsea_leave"] is True

    foxtrot = classified[9]
    assert foxtrot["removed"] == {path: True for path in REMOVED}

    calls: list[str] = []

    def analyzer(row: dict) -> dict:
        calls.append(row["name"])
        return {
            "congestion_spread_per_mwh": 12.5,
            "hours_receiving_more_congested": 310,
            "hours_sending_more_congested": 120,
            "receiving_energy_value_per_mwh": 48.25,
            "bcr_societal": 4.4,
            "bcr_ratepayer": 3.3,
            "bcr_utility": 2.2,
        }

    default_text = format_report(classified)
    assert calls == []
    body = _table(default_text)
    assert [cells[1] for cells in body] == [name for _id, name, *_rest in stored]

    found = _by_name(body)
    for name in (
        "TBC_Delay4",
        "TBC_Delay4 copy",
        "TBC_Delay4_copy",
        "TBC_Delay4 (copy)",
    ):
        assert found[name][3] == "subsea_leave"
    assert found["Inland Alpha"][3] == ""
    assert INCREMENTAL in found["Inland Alpha"]
    assert GREENFIELD not in found["Inland Alpha"]
    assert LOAD not in found["Inland Alpha"]
    assert found["Inland Alpha"][OLD_RATIO_AT : OLD_RATIO_AT + 3] == [
        "5.5",
        "5.25",
        "5.75",
    ]
    assert found["TBC_Delay4"][OLD_RATIO_AT : OLD_RATIO_AT + 3] == [
        "1.5",
        "1.25",
        "1.75",
    ]
    assert found["TBC_Delay4 (copy)"][OLD_RATIO_AT : OLD_RATIO_AT + 3] == ["", "", ""]
    assert found["Inland Delta"][OLD_RATIO_AT : OLD_RATIO_AT + 3] == ["", "", ""]
    assert found["Inland Foxtrot"][4:7] == list(REMOVED)
    assert found["TBC_Delay4_copy"][4] == GREENFIELD
    for cells in body:
        assert cells[MEASURED_AT:] == [""] * 7

    source = inspect.getsource(main)
    assert "SET default_transaction_read_only = on" in source
    assert "measure_saved_routes" not in source
    for forbidden in ("INSERT", "UPDATE", "DELETE"):
        assert forbidden not in source

    measured = measure_saved_routes(classified, analyzer)
    assert calls == ["TBC_Delay4", "TBC_Delay4_copy", "Inland Bravo", "Harbor Echo"]
    assert format_report(classified) == default_text

    after = _by_name(_table(format_report(measured)))
    expected_measured = ["12.5", "310", "120", "48.25", "4.4", "3.3", "2.2"]
    assert after["Inland Bravo"][MEASURED_AT:] == expected_measured
    assert after["Inland Bravo"][OLD_RATIO_AT : OLD_RATIO_AT + 3] == [
        "6.5",
        "6.25",
        "6.75",
    ]
    assert after["Harbor Echo"][MEASURED_AT:] == expected_measured
    assert after["Inland Alpha"][MEASURED_AT:] == [""] * 7
    assert after["Plain-01"][NEW_RATIO_AT:] == ["", "", ""]
