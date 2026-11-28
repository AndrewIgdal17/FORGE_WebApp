"""Assemble a transmission route from corridor pieces in EPSG:5070 metres."""

from __future__ import annotations

import math
from dataclasses import dataclass

Point = tuple[float, float]

PIECE_JOIN_TOLERANCE_M: float = 25.0
CONNECTOR_MAX_M: float = 1000.0
_STRETCH_COORD_EPS: float = 1e-6


def validate_stretch_end(
    stretch_end: tuple[float, float] | None,
    receiving: tuple[float, float],
    receiving_gid: int | None,
) -> None:
    """``stretch_end`` must be absent or exactly the project's receiving point."""
    if stretch_end is None:
        return
    if receiving_gid is not None:
        raise AssemblyError("invalid_stretch_end", {})
    if (
        abs(stretch_end[0] - receiving[0]) > _STRETCH_COORD_EPS
        or abs(stretch_end[1] - receiving[1]) > _STRETCH_COORD_EPS
    ):
        raise AssemblyError("invalid_stretch_end", {})

# Overhead AC line classes (voltage kV → old capacity MW), ties go to higher kV.
_VOLTAGE_CAPACITY: list[tuple[int, int]] = [
    (69, 140),
    (115, 329),
    (138, 394),
    (161, 460),
    (230, 657),
    (345, 1792),
    (500, 2598),
    (765, 6625),
]
_STANDARD_CONDUCTOR = "Standard Aluminum Conductor"


@dataclass(frozen=True)
class Piece:
    gid: int
    coords: list[Point]
    voltage_kv: int | None


class AssemblyError(Exception):
    def __init__(self, code: str, detail: dict | None = None) -> None:
        self.code = code
        self.detail = detail or {}
        super().__init__(code)


def _dist(a: Point, b: Point) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _polyline_length(coords: list[Point]) -> float:
    total = 0.0
    for i in range(len(coords) - 1):
        total += _dist(coords[i], coords[i + 1])
    return total


def _nearest_end_distance(piece: Piece, point: Point) -> float:
    return min(_dist(piece.coords[0], point), _dist(piece.coords[-1], point))


def _orient_piece(piece: Piece, anchor: Point) -> list[Point]:
    """Return piece coordinates oriented so the end nearest ``anchor`` is first."""
    if _dist(piece.coords[0], anchor) <= _dist(piece.coords[-1], anchor):
        return list(piece.coords)
    return list(reversed(piece.coords))


def _join_chain(
    chain: list[Point],
    piece_coords: list[Point],
    join_tolerance_m: float,
) -> list[Point]:
    if not chain:
        return list(piece_coords)
    gap = _dist(chain[-1], piece_coords[0])
    if gap > join_tolerance_m:
        at = ((chain[-1][0] + piece_coords[0][0]) / 2, (chain[-1][1] + piece_coords[0][1]) / 2)
        raise AssemblyError(
            "pieces_not_connected",
            {"gap_m": gap, "at": [at[0], at[1]]},
        )
    return chain + piece_coords[1:]


def _build_chain_with_spans(
    pieces: list[Piece],
    sending: Point,
    join_tolerance_m: float,
) -> tuple[list[Point], list[tuple[int, float, float]]]:
    if not pieces:
        return [], []

    remaining = list(pieces)
    best_idx = 0
    best_d = math.inf
    for i, piece in enumerate(remaining):
        d = _nearest_end_distance(piece, sending)
        if d < best_d:
            best_d = d
            best_idx = i

    first = remaining.pop(best_idx)
    first_coords = _orient_piece(first, sending)
    chain = list(first_coords)
    spans: list[tuple[int, float, float]] = [
        (first.gid, 0.0, _polyline_length(chain)),
    ]

    while remaining:
        best_idx = 0
        best_d = math.inf
        chain_end = chain[-1]
        for i, piece in enumerate(remaining):
            d = _nearest_end_distance(piece, chain_end)
            if d < best_d:
                best_d = d
                best_idx = i

        if best_d > join_tolerance_m:
            at = chain_end
            raise AssemblyError(
                "pieces_not_connected",
                {"gap_m": best_d, "at": [at[0], at[1]]},
            )

        next_piece = remaining.pop(best_idx)
        oriented = _orient_piece(next_piece, chain_end)
        if _dist(oriented[0], chain_end) > join_tolerance_m:
            alt = list(reversed(oriented))
            if _dist(alt[0], chain_end) < _dist(oriented[0], chain_end):
                oriented = alt
        if _dist(oriented[0], chain_end) > join_tolerance_m:
            raise AssemblyError(
                "pieces_not_connected",
                {"gap_m": _dist(oriented[0], chain_end), "at": [chain_end[0], chain_end[1]]},
            )

        start_m = _polyline_length(chain)
        chain = _join_chain(chain, oriented, join_tolerance_m)
        end_m = _polyline_length(chain)
        spans.append((next_piece.gid, start_m, end_m))

    return chain, spans


def order_chain(
    pieces: list[Piece],
    sending: Point,
    join_tolerance_m: float = PIECE_JOIN_TOLERANCE_M,
) -> list[Point]:
    chain, _ = _build_chain_with_spans(pieces, sending, join_tolerance_m)
    return chain


def piece_spans_along_chain(
    pieces: list[Piece],
    sending: Point,
    join_tolerance_m: float = PIECE_JOIN_TOLERANCE_M,
) -> list[tuple[int, float, float]]:
    """Each entry is ``(gid, start_m, end_m)`` along the ordered chain."""
    _, spans = _build_chain_with_spans(pieces, sending, join_tolerance_m)
    return spans


def check_voltage(pieces: list[Piece]) -> int | None:
    voltages = {p.voltage_kv for p in pieces if p.voltage_kv is not None}
    if len(voltages) > 1:
        raise AssemblyError("mixed_voltage", {})
    if not voltages:
        return None
    return next(iter(voltages))


def _project_on_segment(p: Point, a: Point, b: Point) -> tuple[Point, float]:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0.0:
        return a, _dist(p, a)
    t = ((px - ax) * dx + (py - ay) * dy) / seg_len_sq
    t = max(0.0, min(1.0, t))
    proj = (ax + t * dx, ay + t * dy)
    return proj, _dist(p, proj)


def _nearest_on_polyline(line: list[Point], point: Point) -> tuple[Point, float, int, float]:
    """Return projection point, distance to point, segment index, t along that segment."""
    best_dist = math.inf
    best_proj = line[0]
    best_i = 0
    best_t = 0.0
    for i in range(len(line) - 1):
        proj, d = _project_on_segment(point, line[i], line[i + 1])
        if d < best_dist:
            best_dist = d
            best_proj = proj
            best_i = i
            seg_dx = line[i + 1][0] - line[i][0]
            seg_dy = line[i + 1][1] - line[i][1]
            seg_len_sq = seg_dx * seg_dx + seg_dy * seg_dy
            if seg_len_sq == 0.0:
                best_t = 0.0
            else:
                best_t = (
                    (proj[0] - line[i][0]) * seg_dx + (proj[1] - line[i][1]) * seg_dy
                ) / seg_len_sq
    return best_proj, best_dist, best_i, best_t


def cut_at_stretch(chain: list[Point], stretch_end: Point, tolerance_m: float = PIECE_JOIN_TOLERANCE_M) -> list[Point]:
    if len(chain) < 2:
        raise AssemblyError("pieces_not_connected", {"stretch_m": _dist(chain[0], stretch_end)})

    proj, dist, seg_i, t = _nearest_on_polyline(chain, stretch_end)
    if dist > tolerance_m:
        raise AssemblyError("pieces_not_connected", {"stretch_m": dist})

    prefix: list[Point] = [chain[0]]
    for i in range(seg_i):
        prefix.append(chain[i + 1])

    if t >= 1.0 - 1e-12:
        if _dist(prefix[-1], proj) > 1e-9:
            prefix.append(proj)
    elif t <= 1e-12:
        if _dist(prefix[-1], proj) > 1e-9:
            prefix[-1] = proj
    else:
        if _dist(prefix[-1], proj) > 1e-9:
            prefix.append(proj)
        else:
            prefix[-1] = proj

    return prefix


def pieces_beyond_cut(
    spans: list[tuple[int, float, float]],
    chain_cut_length_m: float,
) -> None:
    """Raise ``piece_beyond_stretch`` if any piece lies wholly beyond the cut."""
    for gid, start_m, _end_m in spans:
        if start_m >= chain_cut_length_m - 1e-6:
            raise AssemblyError("piece_beyond_stretch", {"gid": gid})


def add_connectors(
    chain: list[Point],
    sending: Point,
    receiving: Point | None,
    sending_reaches: bool,
    receiving_reaches: bool,
    connector_max_m: float = CONNECTOR_MAX_M,
) -> tuple[list[Point], list[dict]]:
    coords = list(chain)
    connectors: list[dict] = []

    if sending_reaches:
        if coords:
            coords[0] = sending
        else:
            coords = [sending]
    else:
        if not coords:
            raise AssemblyError(
                "connector_too_long",
                {"end": "sending", "distance_m": _dist(sending, sending)},
            )
        start = coords[0]
        length = _dist(sending, start)
        if length > connector_max_m:
            raise AssemblyError("connector_too_long", {"end": "sending", "distance_m": length})
        connectors.append(
            {
                "end": "sending",
                "length_m": length,
                "coordinates": [[sending[0], sending[1]], [start[0], start[1]]],
            }
        )
        coords = [sending] + coords

    if receiving is None:
        return coords, connectors

    if receiving_reaches:
        if coords:
            coords[-1] = receiving
    else:
        end = coords[-1]
        length = _dist(end, receiving)
        if length > connector_max_m:
            raise AssemblyError("connector_too_long", {"end": "receiving", "distance_m": length})
        connectors.append(
            {
                "end": "receiving",
                "length_m": length,
                "coordinates": [[end[0], end[1]], [receiving[0], receiving[1]]],
            }
        )
        coords = coords + [receiving]

    return coords, connectors


def _nearest_voltage_class(voltage_kv: int) -> tuple[int, int]:
    best: tuple[int, int] | None = None
    best_dist = math.inf
    tied_higher: list[tuple[int, int]] = []
    for kv, cap in _VOLTAGE_CAPACITY:
        d = abs(voltage_kv - kv)
        if d < best_dist - 1e-9:
            best_dist = d
            tied_higher = [(kv, cap)]
        elif abs(d - best_dist) <= 1e-9:
            tied_higher.append((kv, cap))
    if len(tied_higher) == 1:
        return tied_higher[0]
    return max(tied_higher, key=lambda x: x[0])


def prefill(voltage_kv: int | None, is_dc: bool) -> dict:
    if is_dc:
        return {"old_ac_dc": "DC"}
    if voltage_kv is None:
        return {}
    _, capacity = _nearest_voltage_class(voltage_kv)
    return {
        "old_ac_dc": "AC",
        "old_capacity_mw": capacity,
        "old_conductor_type": _STANDARD_CONDUCTOR,
    }