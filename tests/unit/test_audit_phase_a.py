"""Tests for Phase A substation-identity audit API.

Covers SQL content, helpers, payload builder, and request model.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.audit import (
    _COUNT_BY_DECISION_SQL,
    _COUNT_SQL,
    _DECISIONS,
    _DELETE_MERGED_SQL,
    _INSERT_DECISION_SQL,
    _INSERT_HIFLD_ROW_SQL,
    _INSERT_OSM_ROW_SQL,
    _NEXT_SQL,
    _NULLIFY_NODE_A_SQL,
    _NULLIFY_NODE_B_SQL,
    _REMAINING_SQL,
    _TRAINING_SQL,
    DecideRequest,
    _state_match,
    _substation_payload,
    _voltage_match,
)
from app.audit_models import CANONICAL_LABELS

# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------


def test_phase_a_labels_are_canonical():
    assert "same_facility" in CANONICAL_LABELS
    assert "different_facility" in CANONICAL_LABELS


def test_decisions_tuple():
    assert _DECISIONS == ("same_facility", "different_facility")


# ---------------------------------------------------------------------------
# SQL — queue
# ---------------------------------------------------------------------------


def test_next_sql_selects_tier23_merged():
    assert "s.source = 'merged'" in _NEXT_SQL
    assert "NOT ST_Within(h.geom, s.geom)" in _NEXT_SQL
    assert "ST_GeometryType(s.geom) != 'ST_Point'" in _NEXT_SQL
    assert "ref.phase_a_decisions" in _NEXT_SQL
    assert "ORDER BY random()" in _NEXT_SQL
    assert "s.osm_original_name" in _NEXT_SQL


def test_next_sql_computes_spatial_features():
    assert "ST_Distance(h.geom, ST_Centroid(s.geom))" in _NEXT_SQL
    assert "ST_Distance(h.geom, ST_Boundary(s.geom))" in _NEXT_SQL
    assert "ST_Area(s.geom)" in _NEXT_SQL
    assert "compactness" in _NEXT_SQL
    assert "orientation_deg" in _NEXT_SQL
    assert "corridor_degree" in _NEXT_SQL
    assert "nearby_hifld" in _NEXT_SQL
    assert "nearby_osm" in _NEXT_SQL


def test_next_sql_returns_geojson():
    assert "ST_AsGeoJSON(ST_Transform(h.geom, 4326))" in _NEXT_SQL
    assert "ST_AsGeoJSON(ST_Transform(s.geom, 4326))" in _NEXT_SQL


def test_remaining_sql_matches_queue_filter():
    assert "s.source = 'merged'" in _REMAINING_SQL
    assert "NOT ST_Within(h.geom, s.geom)" in _REMAINING_SQL
    assert "ref.phase_a_decisions" in _REMAINING_SQL


# ---------------------------------------------------------------------------
# SQL — decisions and un-merge
# ---------------------------------------------------------------------------


def test_insert_decision_sql():
    assert "ref.phase_a_decisions" in _INSERT_DECISION_SQL
    assert "sub_gid" in _INSERT_DECISION_SQL
    assert "decision" in _INSERT_DECISION_SQL


def test_unmerge_inserts_hifld_point_row():
    assert "'hifld'" in _INSERT_HIFLD_ROW_SQL
    assert "ref.substations_hifld" in _INSERT_HIFLD_ROW_SQL
    assert "h.hifld_id" in _INSERT_HIFLD_ROW_SQL
    assert "h.geom" in _INSERT_HIFLD_ROW_SQL
    assert "CASE WHEN h.max_volt > 0 THEN h.max_volt ELSE NULL END" in _INSERT_HIFLD_ROW_SQL
    assert "h.max_volt," not in _INSERT_HIFLD_ROW_SQL


def test_unmerge_inserts_osm_polygon_row():
    assert "'osm'" in _INSERT_OSM_ROW_SQL
    assert "s.osm_id" in _INSERT_OSM_ROW_SQL
    assert "s.geom" in _INSERT_OSM_ROW_SQL
    assert "s.source = 'merged'" in _INSERT_OSM_ROW_SQL


def test_unmerge_nullifies_corridor_nodes():
    assert "node_a = NULL" in _NULLIFY_NODE_A_SQL
    assert "node_b = NULL" in _NULLIFY_NODE_B_SQL
    assert "node_a = $1" in _NULLIFY_NODE_A_SQL
    assert "node_b = $1" in _NULLIFY_NODE_B_SQL


def test_delete_merged_row():
    assert "ref.substations" in _DELETE_MERGED_SQL
    assert "gid = $1" in _DELETE_MERGED_SQL


# ---------------------------------------------------------------------------
# SQL — training
# ---------------------------------------------------------------------------


def test_training_sql_joins_decisions():
    assert "ref.phase_a_decisions d" in _TRAINING_SQL
    assert "ref.substations s ON s.gid = d.sub_gid" in _TRAINING_SQL
    assert "ref.substations_hifld h ON h.hifld_id = s.hifld_id" in _TRAINING_SQL
    assert "d.decision" in _TRAINING_SQL
    assert "ORDER BY d.id" in _TRAINING_SQL
    assert "s.osm_original_name" in _TRAINING_SQL


def test_training_sql_recomputes_features():
    assert "ST_Distance" in _TRAINING_SQL
    assert "ST_Area" in _TRAINING_SQL
    assert "compactness" in _TRAINING_SQL
    assert "corridor_degree" in _TRAINING_SQL
    assert "nearby_hifld" in _TRAINING_SQL
    assert "nearby_osm" in _TRAINING_SQL


def test_count_sql_targets_phase_a():
    assert "ref.phase_a_decisions" in _COUNT_SQL
    assert "ref.phase_a_decisions" in _COUNT_BY_DECISION_SQL


# ---------------------------------------------------------------------------
# Voltage match
# ---------------------------------------------------------------------------


def test_voltage_match_exact():
    assert _voltage_match(345, 345) == 1.0


def test_voltage_match_same_tier():
    assert _voltage_match(345, 500) == 0.5
    assert _voltage_match(115, 230) == 0.5


def test_voltage_match_different_tier():
    assert _voltage_match(345, 69) == 0.0


def test_voltage_match_none():
    assert _voltage_match(None, 345) == 0.0
    assert _voltage_match(345, None) == 0.0
    assert _voltage_match(None, None) == 0.0


# ---------------------------------------------------------------------------
# State match
# ---------------------------------------------------------------------------


def test_state_match_same():
    assert _state_match("TX", "TX") is True
    assert _state_match("tx", "TX") is True
    assert _state_match("  TX ", "TX") is True


def test_state_match_different():
    assert _state_match("TX", "CA") is False


def test_state_match_none():
    assert _state_match(None, "TX") is False
    assert _state_match("TX", None) is False
    assert _state_match(None, None) is False


# ---------------------------------------------------------------------------
# DecideRequest
# ---------------------------------------------------------------------------


def test_decide_request_accepts_valid():
    req = DecideRequest(sub_gid=42, decision="same_facility")
    assert req.sub_gid == 42
    assert req.decision == "same_facility"

    req2 = DecideRequest(sub_gid=99, decision="different_facility")
    assert req2.decision == "different_facility"


def test_decide_request_rejects_invalid_decision():
    with pytest.raises(ValidationError):
        DecideRequest(sub_gid=42, decision="accept")

    with pytest.raises(ValidationError):
        DecideRequest(sub_gid=42, decision="relabel")


# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------


def _mock_row() -> dict:
    return {
        "gid": 101,
        "hifld_id": "H123",
        "osm_id": "O456",
        "hifld_name": "ALPHA SUB",
        "osm_name": "Alpha Substation",
        "osm_original_name": "Alpha",
        "hifld_voltage_kv": 345,
        "osm_voltage_kv": 345,
        "hifld_type": "SUBSTATION",
        "osm_type": "transmission",
        "distance_m": 42.0,
        "hifld_inside": False,
        "boundary_distance_m": 10.0,
        "osm_area_sqm": 8000.0,
        "compactness": 0.65,
        "orientation_deg": 30.0,
        "corridor_degree": 3,
        "nearby_hifld": 1,
        "nearby_osm": 2,
        "state": "TX",
        "hifld_state": "TX",
        "county": "Travis",
        "operator": "AEP",
        "hifld_geojson": '{"type":"Point","coordinates":[-97,30]}',
        "osm_geojson": (
            '{"type":"Polygon","coordinates":'
            "[[[-97,30],[-97,30.001],[-96.999,30.001],[-97,30]]]}"
        ),
    }


def test_substation_payload_fields():
    row = _mock_row()
    payload = _substation_payload(row, nlcd_hifld=21.0, nlcd_osm=23.0)
    assert payload["done"] is False
    assert payload["sub_gid"] == 101
    assert payload["hifld_id"] == "H123"
    assert payload["osm_id"] == "O456"
    assert payload["hifld_name"] == "ALPHA SUB"
    assert payload["osm_original_name"] == "Alpha"
    assert payload["merged_name"] == "Alpha Substation"
    assert "osm_name" not in payload
    assert payload["distance_m"] == 42.0
    assert payload["boundary_distance_m"] == 10.0
    assert payload["osm_area_sqm"] == 8000.0
    assert payload["compactness"] == 0.65
    assert payload["corridor_degree"] == 3
    assert payload["nearby_hifld"] == 1
    assert payload["nearby_osm"] == 2
    assert payload["state"] == "TX"
    assert payload["county"] == "Travis"
    assert payload["voltage_match"] == 1.0
    assert payload["state_match"] is True
    assert payload["hifld_geojson"]["type"] == "Point"
    assert payload["osm_geojson"]["type"] == "Polygon"


def test_substation_payload_predictions_none_before_training():
    row = _mock_row()
    payload = _substation_payload(row, nlcd_hifld=0.0, nlcd_osm=0.0)
    assert payload["predictions"] is None


def test_substation_payload_voltage_mismatch():
    row = _mock_row()
    row["hifld_voltage_kv"] = 345
    row["osm_voltage_kv"] = 69
    payload = _substation_payload(row, nlcd_hifld=0.0, nlcd_osm=0.0)
    assert payload["voltage_match"] == 0.0


def test_substation_payload_state_mismatch():
    row = _mock_row()
    row["hifld_state"] = "TX"
    row["state"] = "CA"
    payload = _substation_payload(row, nlcd_hifld=0.0, nlcd_osm=0.0)
    assert payload["state_match"] is False
