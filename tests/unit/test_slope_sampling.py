"""Slope sampling: percent extraction and terrain reclassification."""

from __future__ import annotations

import numpy as np
import pytest


class _Raster:
    """Stand-in for a rasterio dataset. ``sample`` yields one value per point."""

    def __init__(self, samples: list) -> None:
        self._samples = samples

    def sample(self, coords: list[tuple[float, float]]):
        if len(coords) != len(self._samples):
            raise AssertionError(
                f"expected {len(self._samples)} coordinates, got {len(coords)}"
            )
        return iter(self._samples)


def _install_rasters(monkeypatch, nlcd_samples: list, slope_samples: list | None) -> None:
    from app import route as route_module

    monkeypatch.setattr(route_module, "_open_nlcd", lambda: _Raster(nlcd_samples))
    if slope_samples is None:
        monkeypatch.setattr(route_module, "_open_slope", lambda: None)
    else:
        monkeypatch.setattr(route_module, "_open_slope", lambda: _Raster(slope_samples))


@pytest.mark.parametrize(
    ("sample", "expected"),
    [
        ([5.0], 5.0),
        ([-9999], None),
        ([-4.0], None),
        (np.ma.array([5.0], mask=True), None),
        ([0.0], 0.0),
    ],
)
def test_slope_value_keeps_flat_ground_and_drops_missing(sample, expected):
    from app.route import _slope_value

    assert _slope_value(sample) == expected


@pytest.mark.parametrize(
    ("nlcd_code", "slope", "expected"),
    [
        (41, 15.0, "forested"),
        (71, 12.0, "mountain"),
        (71, 5.0, "rolling_hills"),
        (71, 0.5, "scrubbed_flat"),
        (71, -9999, "scrubbed_flat"),
    ],
)
def test_sample_terrain_reclassifies_only_scrubbed_flat(
    monkeypatch, nlcd_code, slope, expected
):
    from app.route import sample_terrain

    _install_rasters(monkeypatch, [[nlcd_code]], [[slope]])
    assert sample_terrain([(500000.0, 3000000.0, 30.0)]) == [(expected, 30.0)]


def test_sample_terrain_keeps_scrubbed_flat_when_slope_cog_is_missing(monkeypatch):
    from app.route import sample_terrain

    _install_rasters(monkeypatch, [[71], [71], [71]], None)
    points = [
        (500000.0, 3000000.0, 30.0),
        (500030.0, 3000000.0, 30.0),
        (500060.0, 3000000.0, 15.0),
    ]
    assert sample_terrain(points) == [
        ("scrubbed_flat", 30.0),
        ("scrubbed_flat", 30.0),
        ("scrubbed_flat", 15.0),
    ]
