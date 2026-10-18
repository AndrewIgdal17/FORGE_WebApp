"""Tests for Phase A substation-identity feature extraction."""

import math

import numpy as np

from app.audit_features import (
    FEATURE_NAMES,
    compute_phase_a_features,
    features_to_array,
)


def test_feature_count():
    assert len(FEATURE_NAMES) == 28


def test_all_features_finite():
    features = compute_phase_a_features(
        distance_m=50.0,
        hifld_inside=False,
        osm_area_sqm=12000.0,
        boundary_distance_m=10.0,
        hifld_name="PALO VERDE",
        osm_name="Palo Verde",
        voltage_match=1.0,
        hifld_voltage_kv=500,
        osm_voltage_kv=500,
        hifld_type="SUBSTATION",
        osm_type="transmission",
        nearby_hifld=2,
        nearby_osm=1,
        corridor_degree=5,
        state_match=True,
        compactness=0.7,
        orientation_deg=45.0,
        nlcd_at_hifld=23,
        nlcd_at_osm=23,
    )
    assert len(features) == 28
    for name in FEATURE_NAMES:
        assert name in features, f"Missing feature: {name}"
        assert math.isfinite(features[name]), f"Non-finite: {name}={features[name]}"


def test_null_names_produce_zero_similarity():
    features = compute_phase_a_features(
        distance_m=100.0,
        hifld_inside=False,
        osm_area_sqm=5000.0,
        boundary_distance_m=80.0,
        hifld_name="UNKNOWN",
        osm_name=None,
        voltage_match=0.5,
        hifld_voltage_kv=345,
        osm_voltage_kv=230,
        hifld_type="TAP",
        osm_type=None,
        nearby_hifld=0,
        nearby_osm=0,
        corridor_degree=0,
        state_match=False,
        compactness=0.0,
        orientation_deg=0.0,
        nlcd_at_hifld=0,
        nlcd_at_osm=0,
    )
    assert features["name_jaro_winkler"] == 0.0
    assert features["name_token_overlap"] == 0.0
    assert features["hifld_placeholder"] == 1.0
    assert features["osm_placeholder"] == 1.0


def test_features_to_array_shape():
    features = compute_phase_a_features(
        distance_m=50.0, hifld_inside=False, osm_area_sqm=12000.0,
        boundary_distance_m=10.0, hifld_name="TEST", osm_name="TEST",
        voltage_match=1.0, hifld_voltage_kv=345, osm_voltage_kv=345,
        hifld_type="SUBSTATION", osm_type="transmission",
        nearby_hifld=1, nearby_osm=1, corridor_degree=3,
        state_match=True, compactness=0.6, orientation_deg=90.0,
        nlcd_at_hifld=22, nlcd_at_osm=22,
    )
    arr = features_to_array(features)
    assert arr.shape == (28,)
    assert arr.dtype == np.float64
    assert np.isfinite(arr).all()


def test_identical_names_high_similarity():
    features = compute_phase_a_features(
        distance_m=5.0, hifld_inside=False, osm_area_sqm=8000.0,
        boundary_distance_m=2.0, hifld_name="FOUR CORNERS", osm_name="Four Corners",
        voltage_match=1.0, hifld_voltage_kv=500, osm_voltage_kv=500,
        hifld_type="SUBSTATION", osm_type="transmission",
        nearby_hifld=1, nearby_osm=1, corridor_degree=8,
        state_match=True, compactness=0.5, orientation_deg=0.0,
        nlcd_at_hifld=31, nlcd_at_osm=31,
    )
    assert features["name_jaro_winkler"] > 0.9
    assert features["name_token_overlap"] == 1.0
