"""Edition labels for the GIS layers a run used."""

from __future__ import annotations

LAND_COVER_RELEASE = (
    "NLCD 2021 land cover (ver. 2.0, June 2026), DOI 10.5066/P9JZ7AO3"
)
SLOPE_RELEASE = "USGS 3DEP 1-arc-second percent slope, CONUS COG built 2026-10-13"
PROTECTED_AREAS_RELEASE = "PAD-US 4.1 GAP 1-3 (DOI 10.5066/P96WBCHS)"
COUNTIES_RELEASE = "Census TIGER/Line 2024 counties (ref.counties_tiger)"
BLM_ZONES_RELEASE = "BLM linear right-of-way rent schedule 2022 (blm_zone_2022)"


def wetland_release_label(labels: list[str]) -> str:
    unique = sorted({label for label in labels if label})
    return "; ".join(unique)


def layer_releases(wetland_labels: list[str]) -> dict[str, str]:
    return {
        "land_cover": LAND_COVER_RELEASE,
        "slope": SLOPE_RELEASE,
        "wetlands": wetland_release_label(wetland_labels),
        "protected_areas": PROTECTED_AREAS_RELEASE,
        "counties": COUNTIES_RELEASE,
        "blm_zones": BLM_ZONES_RELEASE,
    }
