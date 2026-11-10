"""Edition strings stored with a run."""

from app.layer_releases import (
    BLM_ZONES_RELEASE,
    COUNTIES_RELEASE,
    LAND_COVER_RELEASE,
    PROTECTED_AREAS_RELEASE,
    SLOPE_RELEASE,
    layer_releases,
    wetland_release_label,
)


def test_constants_name_the_edition():
    assert LAND_COVER_RELEASE == (
        "NLCD 2021 land cover (ver. 2.0, June 2026), DOI 10.5066/P9JZ7AO3"
    )
    assert SLOPE_RELEASE == (
        "USGS 3DEP 1-arc-second percent slope, CONUS COG built 2026-10-13"
    )
    assert PROTECTED_AREAS_RELEASE == "PAD-US 4.1 GAP 1-3 (DOI 10.5066/P96WBCHS)"
    assert COUNTIES_RELEASE == "Census TIGER/Line 2024 counties (ref.counties_tiger)"
    assert BLM_ZONES_RELEASE == (
        "BLM Per-Acre Linear Rent Schedule 2026–2035 (county zones from the 2022 Census of Agriculture)"
    )


def test_one_wetland_label_is_unchanged():
    assert wetland_release_label(["FWS State-Downloads geodatabase (file dates 2026-10-09)"]) == (
        "FWS State-Downloads geodatabase (file dates 2026-10-09)"
    )


def test_several_wetland_labels_are_sorted_and_joined():
    assert wetland_release_label(["b", "a", "b"]) == "a; b"


def test_layer_releases_object_uses_the_constants():
    body = layer_releases(["a"])
    assert body == {
        "land_cover": LAND_COVER_RELEASE,
        "slope": SLOPE_RELEASE,
        "wetlands": "a",
        "protected_areas": PROTECTED_AREAS_RELEASE,
        "counties": COUNTIES_RELEASE,
        "blm_zones": BLM_ZONES_RELEASE,
    }
