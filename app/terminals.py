"""Terminal snap and mismatch checks for project scenario routes."""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass
from typing import Literal

TERMINAL_TOLERANCE_M: float = 100.0

_EARTH_RADIUS_M = 6_371_008.8


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in metres between two (lon, lat) points in degrees."""
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(h))


@dataclass(frozen=True)
class TerminalMismatch:
    end: Literal["sending", "receiving"]
    distance_m: float


def snap_route_to_terminals(
    route: dict,
    sending: tuple[float, float],
    receiving: tuple[float, float],
    tolerance_m: float = TERMINAL_TOLERANCE_M,
) -> dict | TerminalMismatch:
    """Snap route ends to terminal points, or return which end is out of tolerance.

    Checks the sending end first. Returns a deep copy with first/last vertices
    replaced when both ends are within tolerance_m.
    """
    coordinates = route["coordinates"]
    route_first = (coordinates[0][0][0], coordinates[0][0][1])
    route_last = (coordinates[-1][-1][0], coordinates[-1][-1][1])

    sending_dist = haversine_m(route_first, sending)
    if sending_dist > tolerance_m:
        return TerminalMismatch(end="sending", distance_m=sending_dist)

    receiving_dist = haversine_m(route_last, receiving)
    if receiving_dist > tolerance_m:
        return TerminalMismatch(end="receiving", distance_m=receiving_dist)

    snapped = copy.deepcopy(route)
    snapped["coordinates"][0][0] = [sending[0], sending[1]]
    snapped["coordinates"][-1][-1] = [receiving[0], receiving[1]]
    return snapped


def mismatch_message(m: TerminalMismatch) -> str:
    return (
        f"The route's {m.end} end is {m.distance_m:.0f} m "
        f"from the project's {m.end} terminal; it must be within 100 m."
    )