"""Terminal snap and mismatch checks for project routes. No database."""

import copy

import pytest

from app.terminals import (
    TERMINAL_TOLERANCE_M,
    TerminalMismatch,
    haversine_m,
    mismatch_message,
    snap_route_to_terminals,
)

SENDING = (-101.5, 35.2)
RECEIVING = (-100.0, 36.0)


def _route(
    first: tuple[float, float],
    last: tuple[float, float],
    *,
    lines: list[tuple[tuple[float, float], tuple[float, float]]] | None = None,
) -> dict:
    """Build a minimal MultiLineString dict."""
    if lines is None:
        mid = ((first[0] + last[0]) / 2, (first[1] + last[1]) / 2)
        coordinates = [[[first[0], first[1]], [mid[0], mid[1]], [last[0], last[1]]]]
    else:
        coordinates = [[[a[0], a[1]], [b[0], b[1]]] for a, b in lines]
    return {"type": "MultiLineString", "coordinates": coordinates}


def _offset_lat(point: tuple[float, float], delta_m: float) -> tuple[float, float]:
    """Move a point north by delta_m meters (approximate)."""
    delta_deg = delta_m / 111_194.926
    return (point[0], point[1] + delta_deg)


def test_haversine_one_degree_latitude():
    distance = haversine_m((0, 0), (0, 1))
    assert distance == pytest.approx(111_195, abs=1)


def test_snap_within_tolerance_replaces_both_ends():
    first_off = _offset_lat(SENDING, 30)
    last_off = _offset_lat(RECEIVING, -30)
    route = _route(first_off, last_off)
    original = copy.deepcopy(route)

    result = snap_route_to_terminals(route, SENDING, RECEIVING)

    assert isinstance(result, dict)
    assert result is not route
    assert route == original

    coords = result["coordinates"]
    assert coords[0][0] == [SENDING[0], SENDING[1]]
    assert coords[0][1] == route["coordinates"][0][1]
    assert coords[-1][-1] == [RECEIVING[0], RECEIVING[1]]


def test_sending_end_off_returns_mismatch():
    first_off = _offset_lat(SENDING, 150)
    route = _route(first_off, RECEIVING)

    result = snap_route_to_terminals(route, SENDING, RECEIVING)

    assert isinstance(result, TerminalMismatch)
    assert result.end == "sending"
    assert result.distance_m == pytest.approx(150, abs=5)


def test_reversed_route_is_sending_mismatch():
    """Route drawn from receiving to sending must fail on the sending end first."""
    route = _route(RECEIVING, SENDING)

    result = snap_route_to_terminals(route, SENDING, RECEIVING)

    assert isinstance(result, TerminalMismatch)
    assert result.end == "sending"


def test_multiline_uses_first_and_last_line():
    line1 = (SENDING, (-101.0, 35.5))
    line2 = ((-100.5, 35.7), RECEIVING)
    first_off = _offset_lat(SENDING, 20)
    last_off = _offset_lat(RECEIVING, -20)
    route = {
        "type": "MultiLineString",
        "coordinates": [
            [[first_off[0], first_off[1]], [line1[1][0], line1[1][1]]],
            [[line2[0][0], line2[0][1]], [last_off[0], last_off[1]]],
        ],
    }

    result = snap_route_to_terminals(route, SENDING, RECEIVING)

    assert isinstance(result, dict)
    assert result["coordinates"][0][0] == [SENDING[0], SENDING[1]]
    assert result["coordinates"][-1][-1] == [RECEIVING[0], RECEIVING[1]]
    assert result["coordinates"][0][1] == route["coordinates"][0][1]
    assert result["coordinates"][-1][0] == route["coordinates"][-1][0]


def test_mismatch_message_format():
    m = TerminalMismatch(end="sending", distance_m=150.4)
    assert (
        mismatch_message(m)
        == "The route's sending end is 150 m from the project's sending terminal; it must be within 100 m."
    )


def test_terminal_tolerance_constant():
    assert TERMINAL_TOLERANCE_M == 100.0