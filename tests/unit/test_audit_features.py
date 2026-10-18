"""Audit feature vector: name similarity plus substation and land-cover context."""

from __future__ import annotations

import numpy as np

from app.audit_features import FEATURE_NAMES, compute_features, features_to_array


def test_feature_names_include_area_degree_and_nlcd():
    assert len(FEATURE_NAMES) == 23
    assert "sub_area_sqm" in FEATURE_NAMES
    assert "corridor_degree" in FEATURE_NAMES
    assert "nlcd_class" in FEATURE_NAMES
    assert "hifld_name_has_digits" in FEATURE_NAMES
    assert "matched_name_known_prefix" in FEATURE_NAMES


def test_compute_features_keeps_new_values():
    features = compute_features(
        "TEST",
        "TEST2",
        50.0,
        1,
        1.0,
        10.0,
        138,
        "SUBSTATION",
        "merged",
        True,
        sub_area_sqm=5000.0,
        corridor_degree=4,
        nlcd_class=23,
    )
    assert len(features) == 23
    assert list(features) == list(FEATURE_NAMES)
    assert features["sub_area_sqm"] == 5000.0
    assert features["corridor_degree"] == 4.0
    assert features["nlcd_class"] == 23.0
    vector = features_to_array(features)
    assert vector.shape == (23,)


def test_new_features_default_to_zero():
    features = compute_features(
        "TEST",
        "TEST2",
        50.0,
        1,
        1.0,
        10.0,
        138,
        "SUBSTATION",
        "merged",
        True,
        sub_area_sqm=None,
        corridor_degree=None,
        nlcd_class=None,
    )
    assert features["sub_area_sqm"] == 0.0
    assert features["corridor_degree"] == 0.0
    assert features["nlcd_class"] == 0.0


def test_audit_sql_selects_area_degree_and_endpoint():
    from app.audit import _NEXT_SQL, _SPECIFIC_SQL, _TRAINING_SQL

    for sql in (_NEXT_SQL, _SPECIFIC_SQL, _TRAINING_SQL):
        assert "ST_Area(s.geom) AS sub_area_sqm" in sql
        assert "node_a = s.gid OR node_b = s.gid" in sql
        assert "AS corridor_degree" in sql
        assert "ST_X(ep.geom) AS endpoint_x" in sql
        assert "ST_Y(ep.geom) AS endpoint_y" in sql


class _Raster:
    def __init__(self, samples: list) -> None:
        self._samples = samples

    def sample(self, coords: list[tuple[float, float]]):
        if len(coords) != len(self._samples):
            raise AssertionError(
                f"expected {len(self._samples)} coordinates, got {len(coords)}"
            )
        return iter(self._samples)


def test_nlcd_classes_samples_endpoint(monkeypatch):
    from app import audit

    monkeypatch.setattr(audit, "_nlcd_unavailable", False)
    monkeypatch.setattr(
        audit,
        "_open_nlcd",
        lambda: _Raster([np.array([23]), np.ma.array([82], mask=[True])]),
    )
    assert audit._nlcd_classes([(500.0, 300.0), (None, 1.0), (1.0, 2.0)]) == [
        23.0,
        0.0,
        0.0,
    ]


def test_nlcd_classes_stay_zero_when_raster_is_missing(monkeypatch):
    from app import audit

    monkeypatch.setattr(audit, "_nlcd_unavailable", False)

    def missing() -> None:
        raise FileNotFoundError("/gis-data/nlcd/missing.tif")

    monkeypatch.setattr(audit, "_open_nlcd", missing)
    assert audit._nlcd_classes([(1.0, 2.0)]) == [0.0]
    assert audit._nlcd_unavailable is True
