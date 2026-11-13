"""Congestion spread and receiving-end energy value for one route."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.market_changes import ArchiveIncomplete, market_changes
from app.route import _ENDPOINT_SQL, FOOTPRINT_ISO, endpoint_context

SPREAD = "01_project_technical_details.market_measurements.congestion_spread_per_mwh"
HOURS_RECEIVING = (
    "01_project_technical_details.market_measurements.hours_receiving_more_congested"
)
HOURS_SENDING = (
    "01_project_technical_details.market_measurements.hours_sending_more_congested"
)
ENERGY = (
    "01_project_technical_details.market_measurements.receiving_energy_value_per_mwh"
)
PATHS = (SPREAD, HOURS_RECEIVING, HOURS_SENDING, ENERGY)


def _end(iso: str | None, zone: str | None, priced: bool) -> dict[str, object]:
    return {"iso": iso, "zone": zone, "priced": priced}


def _pair(spread: str, hours_fwd: int, hours_rev: int) -> dict[str, object]:
    return {
        "spread": Decimal(spread),
        "hours_fwd": hours_fwd,
        "hours_rev": hours_rev,
    }


def _energy(value: str) -> dict[str, Decimal]:
    return {"energy_value_per_mwh": Decimal(value)}


def test_acceptance_measured_west_to_nyc():
    measured, status = market_changes(
        _end("NYISO", "WEST", True),
        _end("NYISO", "N.Y.C.", True),
        _pair("1.25", 100, 80),
        _energy("40"),
    )
    assert set(measured) == set(PATHS)
    assert status["spread"] == {
        "status": "measured",
        "reason": "Both ends are in NYISO.",
    }
    assert measured[SPREAD] == 1.25
    assert measured[HOURS_RECEIVING] == 100
    assert measured[HOURS_SENDING] == 80
    assert isinstance(measured[SPREAD], float)
    assert isinstance(measured[HOURS_RECEIVING], int)
    assert isinstance(measured[HOURS_SENDING], int)
    assert status["receiving_energy_value"] == {
        "status": "measured",
        "reason": "Receiving end is in N.Y.C..",
    }
    assert measured[ENERGY] == 40.0
    assert isinstance(measured[ENERGY], float)


def test_acceptance_reversed_route_swaps_hours():
    measured, status = market_changes(
        _end("NYISO", "N.Y.C.", True),
        _end("NYISO", "WEST", True),
        _pair("1.25", 80, 100),
        _energy("22"),
    )
    assert measured[SPREAD] == 1.25
    assert measured[HOURS_RECEIVING] == 80
    assert measured[HOURS_SENDING] == 100
    assert measured[ENERGY] == 22.0
    assert status["receiving_energy_value"]["status"] == "measured"
    assert status["receiving_energy_value"]["reason"] == "Receiving end is in WEST."


def test_acceptance_same_zone_shows_zero_congestion_relief():
    sending = _end("NYISO", "WEST", True)
    receiving = _end("NYISO", "WEST", True)
    measured, status = market_changes(
        sending,
        receiving,
        _pair("0", 0, 0),
        _energy("12"),
    )
    assert status["spread"] == {
        "status": "same_zone",
        "reason": "Both ends are in WEST.",
    }
    assert measured[SPREAD] == 0
    assert measured[HOURS_RECEIVING] == 0
    assert measured[HOURS_SENDING] == 0
    assert status["receiving_energy_value"]["status"] == "measured"
    assert measured[ENERGY] == 12.0
    with pytest.raises(ArchiveIncomplete):
        market_changes(sending, receiving, None, _energy("12"))
    with pytest.raises(ArchiveIncomplete):
        market_changes(sending, receiving, _pair("0", 0, 0), None)


def test_acceptance_different_markets_spp_not_available():
    measured, status = market_changes(
        _end("MISO", "LRZ1", True),
        _end("SPP", None, False),
    )
    assert set(measured) == set(PATHS)
    assert status["spread"]["status"] == "different_markets"
    assert measured[SPREAD] is None
    assert measured[HOURS_RECEIVING] is None
    assert measured[HOURS_SENDING] is None
    assert status["receiving_energy_value"]["status"] == "market_not_measured"
    assert measured[ENERGY] is None
    assert "SPP" in status["spread"]["reason"]
    assert "SPP" in status["receiving_energy_value"]["reason"]
    assert status["spread"]["reason"] == "The ends are in MISO and SPP."
    assert status["receiving_energy_value"]["reason"] == (
        "Receiving end is in SPP; FORGE has no SPP energy value yet."
    )


def test_acceptance_outside_markets_receiving_sce():
    measured, status = market_changes(
        _end(None, None, False),
        _end("CAISO", "SCE", True),
        energy=_energy("55"),
    )
    assert status["spread"]["status"] == "outside_markets"
    assert status["spread"]["reason"] == "Sending end is outside the seven ISOs."
    assert measured[SPREAD] is None
    assert measured[HOURS_RECEIVING] is None
    assert measured[HOURS_SENDING] is None
    assert status["receiving_energy_value"] == {
        "status": "measured",
        "reason": "Receiving end is in SCE.",
    }
    assert measured[ENERGY] == 55.0


def test_acceptance_unpriced_lrz3_market_not_measured():
    measured, status = market_changes(
        _end("MISO", "LRZ1", True),
        _end("MISO", "LRZ3", False),
    )
    assert status["spread"]["status"] == "market_not_measured"
    assert status["receiving_energy_value"]["status"] == "market_not_measured"
    assert all(measured[path] is None for path in PATHS)
    assert "LRZ3" in status["spread"]["reason"]
    assert status["spread"]["reason"] == (
        "Receiving end is in LRZ3; FORGE has no LRZ3 congestion prices yet."
    )
    assert status["receiving_energy_value"]["reason"] == (
        "Receiving end is in LRZ3; FORGE has no LRZ3 energy value yet."
    )


def test_outside_reasons_name_each_end_without_an_iso():
    _, both = market_changes(_end(None, None, False), _end(None, None, False))
    assert both["spread"] == {
        "status": "outside_markets",
        "reason": "Both ends are outside the seven ISOs.",
    }
    assert both["receiving_energy_value"]["reason"] == (
        "Receiving end is outside the seven ISOs."
    )
    _, receiving = market_changes(
        _end("NYISO", "WEST", True),
        _end(None, None, False),
    )
    assert receiving["spread"] == {
        "status": "outside_markets",
        "reason": "Receiving end is outside the seven ISOs.",
    }
    assert receiving["receiving_energy_value"]["status"] == "outside_markets"


def test_unpriced_pjm_names_the_iso_not_the_zone():
    _, status = market_changes(
        _end("MISO", "LRZ1", True),
        _end("PJM", "PSEG", False),
    )
    assert status["spread"]["status"] == "different_markets"
    assert status["receiving_energy_value"]["reason"] == (
        "Receiving end is in PJM; FORGE has no PJM energy value yet."
    )


def test_endpoint_sql_keeps_spp_and_ercot_out_of_the_partition():
    assert "loc_abbrev LIKE 'LRZ%'" in _ENDPOINT_SQL
    assert "loc_type = 'ZON'" in _ENDPOINT_SQL
    assert "ORDER BY" in _ENDPOINT_SQL
    assert "LIMIT 1" in _ENDPOINT_SQL
    assert "SPP" not in _ENDPOINT_SQL
    assert "ERCOT" not in _ENDPOINT_SQL
    assert FOOTPRINT_ISO == {
        "ISO-NE": "ISONE",
        "CAISO": "CAISO",
        "ERCOT": "ERCOT",
        "MISO": "MISO",
        "NYISO": "NYISO",
        "PJM": "PJM",
        "SPP": "SPP",
    }
    context = endpoint_context(
        {
            "sending_subregion": None,
            "receiving_subregion": None,
            "sending_gea": None,
            "receiving_gea": None,
            "sending_statefp": None,
            "receiving_statefp": None,
            "sending_iso": "ISO-NE",
            "receiving_iso": "WECC",
            "sending_price_zone": ".Z.MAINE",
            "receiving_price_zone": None,
        }
    )
    assert context["sending_iso"] == "ISONE"
    assert context["receiving_iso"] is None
    assert context["sending_price_zone"] == ".Z.MAINE"
    assert context["receiving_price_zone"] is None
