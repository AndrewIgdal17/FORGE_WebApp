"""Pure line assembly in EPSG:5070 metres. No database."""

from __future__ import annotations

import pytest

from app.line_assembly import (
    CONNECTOR_MAX_M,
    AssemblyError,
    Piece,
    add_connectors,
    check_voltage,
    cut_at_stretch,
    order_chain,
    piece_spans_along_chain,
    pieces_beyond_cut,
    prefill,
)


def _piece(gid: int, coords: list[tuple[float, float]], voltage_kv: int | None = None) -> Piece:
    return Piece(gid=gid, coords=coords, voltage_kv=voltage_kv)


def test_two_pieces_joined_within_10m_out_of_click_order():
    sending = (0.0, 0.0)
    a = _piece(1, [(0.0, 0.0), (1000.0, 0.0)], 138)
    b = _piece(2, [(1005.0, 0.0), (2000.0, 0.0)], 138)
    # clicked b then a
    chain = order_chain([b, a], sending)
    assert chain[0] == pytest.approx((0.0, 0.0), abs=1e-9)
    assert chain[-1] == pytest.approx((2000.0, 0.0), abs=1e-9)
    assert len(chain) == 3  # joined at one vertex


def test_reversed_piece_oriented_to_chain():
    sending = (0.0, 0.0)
    piece = _piece(1, [(500.0, 0.0), (0.0, 0.0)], 138)
    chain = order_chain([piece], sending)
    assert chain[0] == pytest.approx((0.0, 0.0), abs=1e-9)
    assert chain[-1] == pytest.approx((500.0, 0.0), abs=1e-9)


def test_300m_gap_raises_pieces_not_connected():
    sending = (0.0, 0.0)
    a = _piece(1, [(0.0, 0.0), (1000.0, 0.0)])
    b = _piece(2, [(1300.0, 0.0), (2000.0, 0.0)])
    with pytest.raises(AssemblyError) as exc_info:
        order_chain([a, b], sending)
    err = exc_info.value
    assert err.code == "pieces_not_connected"
    assert err.detail["gap_m"] == pytest.approx(300.0, abs=1.0)
    assert "at" in err.detail


def test_t_junction_raises_pieces_not_connected():
    """Branch piece off the main chain must not be silently dropped."""
    sending = (0.0, 0.0)
    main1 = _piece(1, [(0.0, 0.0), (1000.0, 0.0)])
    main2 = _piece(2, [(1000.0, 0.0), (2000.0, 0.0)])
    branch = _piece(3, [(1000.0, 0.0), (1000.0, 500.0)])
    with pytest.raises(AssemblyError) as exc_info:
        order_chain([main1, main2, branch], sending)
    assert exc_info.value.code == "pieces_not_connected"


def test_check_voltage_mixed():
    pieces = [_piece(1, [(0, 0), (1, 0)], 138), _piece(2, [(1, 0), (2, 0)], 345)]
    with pytest.raises(AssemblyError) as exc_info:
        check_voltage(pieces)
    assert exc_info.value.code == "mixed_voltage"


def test_check_voltage_one_missing_returns_shared():
    pieces = [_piece(1, [(0, 0), (1, 0)], 138), _piece(2, [(1, 0), (2, 0)], None)]
    assert check_voltage(pieces) == 138


def test_check_voltage_none_when_all_missing():
    pieces = [_piece(1, [(0, 0), (1, 0)], None), _piece(2, [(1, 0), (2, 0)], None)]
    assert check_voltage(pieces) is None


def test_cut_at_stretch_mid_segment_ends_at_projection():
    chain = [(0.0, 0.0), (1000.0, 0.0)]
    stretch = (500.0, 0.0)
    cut = cut_at_stretch(chain, stretch)
    assert cut[-1] == pytest.approx((500.0, 0.0), abs=1e-9)
    assert len(cut) == 2


def test_cut_at_stretch_40m_off_raises():
    chain = [(0.0, 0.0), (1000.0, 0.0)]
    stretch = (500.0, 40.0)
    with pytest.raises(AssemblyError) as exc_info:
        cut_at_stretch(chain, stretch)
    err = exc_info.value
    assert err.code == "pieces_not_connected"
    assert err.detail["stretch_m"] == pytest.approx(40.0, abs=0.5)


def test_piece_beyond_stretch_cut():
    sending = (0.0, 0.0)
    a = _piece(1, [(0.0, 0.0), (600.0, 0.0)])
    b = _piece(2, [(600.0, 0.0), (1200.0, 0.0)])
    chain = order_chain([a, b], sending)
    cut = cut_at_stretch(chain, (500.0, 0.0))
    cut_length = _polyline_length(cut)
    spans = piece_spans_along_chain([a, b], sending)
    with pytest.raises(AssemblyError) as exc_info:
        pieces_beyond_cut(spans, cut_length)
    err = exc_info.value
    assert err.code == "piece_beyond_stretch"
    assert err.detail["gid"] == 2


def _polyline_length(coords: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(coords) - 1):
        dx = coords[i + 1][0] - coords[i][0]
        dy = coords[i + 1][1] - coords[i][1]
        total += (dx * dx + dy * dy) ** 0.5
    return total


def test_add_connectors_sending_reaches_replaces_end():
    chain = [(300.0, 0.0), (1000.0, 0.0)]
    sending = (0.0, 0.0)
    receiving = (1200.0, 0.0)
    coords, connectors = add_connectors(
        chain,
        sending,
        receiving,
        sending_reaches=True,
        receiving_reaches=False,
    )
    assert coords[0] == sending
    assert coords[-1] == receiving
    assert any(c["end"] == "receiving" for c in connectors)
    assert all(c["end"] != "sending" for c in connectors)


def test_add_connectors_300m_connector():
    chain = [(300.0, 0.0), (1000.0, 0.0)]
    sending = (0.0, 0.0)
    receiving = (1200.0, 0.0)
    coords, connectors = add_connectors(
        chain,
        sending,
        receiving,
        sending_reaches=False,
        receiving_reaches=True,
    )
    assert coords[0] == sending
    sending_conn = next(c for c in connectors if c["end"] == "sending")
    assert sending_conn["length_m"] == pytest.approx(300.0, abs=0.5)
    assert sending_conn["coordinates"][0] == [sending[0], sending[1]]
    assert sending_conn["coordinates"][1] == [300.0, 0.0]


def test_add_connectors_too_long():
    chain = [(1200.0, 0.0), (2000.0, 0.0)]
    sending = (0.0, 0.0)
    with pytest.raises(AssemblyError) as exc_info:
        add_connectors(
            chain,
            sending,
            None,
            sending_reaches=False,
            receiving_reaches=True,
            connector_max_m=CONNECTOR_MAX_M,
        )
    err = exc_info.value
    assert err.code == "connector_too_long"
    assert err.detail["end"] == "sending"
    assert err.detail["distance_m"] == pytest.approx(1200.0, abs=1.0)


def test_add_connectors_receiving_none_after_stretch():
    chain = [(0.0, 0.0), (500.0, 0.0)]
    sending = (0.0, 0.0)
    coords, connectors = add_connectors(
        chain,
        sending,
        None,
        sending_reaches=True,
        receiving_reaches=False,
    )
    assert coords[-1] == (500.0, 0.0)
    assert all(c["end"] != "receiving" for c in connectors)


def test_prefill_138():
    assert prefill(138, is_dc=False) == {
        "old_ac_dc": "AC",
        "old_capacity_mw": 394,
        "old_conductor_type": "Standard Aluminum Conductor",
    }


def test_prefill_nearest_class_240_to_230():
    assert prefill(240, is_dc=False)["old_capacity_mw"] == 657


def test_prefill_nearest_class_150_to_161():
    assert prefill(150, is_dc=False)["old_capacity_mw"] == 460


def test_prefill_nearest_class_127_to_138():
    """127 kV is nearer the 138 kV class than 115 kV."""
    assert prefill(127, is_dc=False)["old_capacity_mw"] == 394


def test_prefill_tie_goes_higher():
    """92 kV is equidistant from 69 and 115; tie goes to the higher class (115 → 329 MW)."""
    assert prefill(92, is_dc=False)["old_capacity_mw"] == 329


def test_prefill_dc_only_old_ac_dc():
    assert prefill(None, is_dc=True) == {"old_ac_dc": "DC"}


def test_prefill_dc_with_voltage_emits_only_old_ac_dc():
    assert prefill(500, is_dc=True) == {"old_ac_dc": "DC"}


def test_prefill_none_voltage_not_dc():
    assert prefill(None, is_dc=False) == {}