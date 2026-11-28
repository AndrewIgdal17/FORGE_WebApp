# /// script
# requires-python = ">=3.11"
# dependencies = ["geopandas>=1.0", "pyarrow>=15", "shapely>=2.0", "asyncpg>=0.29"]
# ///
"""Load the NERC regions and interconnections reference tables.

Source: HIFLD "NERC Regions and Subregions" (Source Cooperative archive).
The file is untrusted data. Pass its path; do not run anything from its folder.

    uv run scripts/load_nerc_regions.py --file <path> --dry-run
    uv run scripts/load_nerc_regions.py --file <path>        # needs FORGE_ADMIN_DATABASE_URL
    uv run scripts/load_nerc_regions.py --provenance         # prints PROVENANCE.md text

The file is checked against its size and SHA-256 before it is read. Write mode
replaces both tables in one transaction. Dry run prints and writes nothing.
geopandas is imported only inside the functions that need it, so the mapping
and hash gates run without it.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

SOURCE_SHA256 = "c22b00bee13835653362ffbf7b2404ee13022747371462ba176adc004b3f7506"
SOURCE_SIZE = 11_165_413
SOURCE_CRS = "EPSG:4326"
TARGET_CRS = "EPSG:5070"
ARCHIVE_URL = "https://source.coop/seerai/hifld/nerc-regions"
FILE_URL = (
    "https://data.source.coop/seerai/hifld/nerc-regions/nerc-regions-subregions/"
    "nerc-regions-subregions.parquet/part-00000-tid-5239687217117897467-"
    "a4e29393-0095-4450-ab9b-b4e76635b41d-719-1-c000.zstd.parquet"
)

# (code, display name), in display order.
REGIONS: tuple[tuple[str, str], ...] = (
    ("WECC", "WECC"),
    ("TRE", "Texas RE"),
    ("MRO", "MRO"),
    ("NPCC", "NPCC"),
    ("RF", "ReliabilityFirst"),
    ("SERC", "SERC"),
)
# (code, display name, member region codes).
INTERCONNECTIONS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("western", "Western", ("WECC",)),
    ("ercot", "ERCOT", ("TRE",)),
    ("eastern", "Eastern", ("MRO", "NPCC", "RF", "SERC")),
)

# Substring of the file's NAME -> region code. Any name matching no rule, or
# matching rules for two different codes, stops the loader.
_NAME_RULES: tuple[tuple[str, str], ...] = (
    ("WECC", "WECC"),
    ("TRE", "TRE"),
    ("(MRO)", "MRO"),
    ("SOUTHWEST POWER POOL, RE (SPP)", "MRO"),
    ("(NPCC)", "NPCC"),
    ("(RFC)", "RF"),
    ("(SERC)", "SERC"),
    ("(FRCC)", "SERC"),
)

_PROVENANCE_LIMIT = (
    "**Known limit.** The boundaries follow utility service territories (EIA-861), "
    "not the electrical seams, which run between substations. Lines of 100 kV and "
    "above (HIFLD and merged rows) crossing the dissolved interconnection boundaries: "
    "Western–Eastern 41, ERCOT–Eastern 92, ERCOT–Western 1, all AC, where the real "
    "seams carry only DC ties. The database's existing ERCOT polygons (market layer, "
    "balancing area) show the same (84 crossings), so no better polygon is available; "
    "the 25 km allowance below absorbs this."
)


class SourceRejected(Exception):
    """The source file's size or SHA-256 does not match the recorded value."""


class UnmappedName(ValueError):
    """A NAME in the file matches no mapping rule, or matches two codes."""


@dataclass(frozen=True)
class Shape:
    code: str
    name: str
    geom: object  # shapely MultiPolygon in EPSG:5070


def region_code(name: str) -> str:
    codes = {code for needle, code in _NAME_RULES if needle in name}
    if len(codes) != 1:
        raise UnmappedName(f"{name!r} maps to {sorted(codes) or 'nothing'}")
    return codes.pop()


def verify_source(
    path: Path | str,
    *,
    sha256: str = SOURCE_SHA256,
    size: int = SOURCE_SIZE,
) -> None:
    """Stop before reading if the file's size or SHA-256 differs."""

    source = Path(path)
    actual_size = source.stat().st_size
    if actual_size != size:
        raise SourceRejected(f"size {actual_size}, expected {size}")
    digest = hashlib.sha256()
    with source.open("rb") as handle:
        while block := handle.read(1024 * 1024):
            digest.update(block)
    if digest.hexdigest() != sha256:
        raise SourceRejected(f"sha256 {digest.hexdigest()}, expected {sha256}")


def _polygons(geom) -> list:
    if geom is None:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if geom.geom_type == "MultiPolygon":
        return list(geom.geoms)
    if hasattr(geom, "geoms"):
        found: list = []
        for part in geom.geoms:
            found.extend(_polygons(part))
        return found
    return []


def _as_multipolygon(geom):
    from shapely.geometry import MultiPolygon

    polygons = _polygons(geom)
    if not polygons:
        raise ValueError("geometry has no polygon parts")
    return MultiPolygon(polygons)


def build_shapes(path: Path | str) -> tuple[list[Shape], list[Shape]]:
    """Read, map, repair, dissolve, and transform to EPSG:5070."""

    import geopandas as gpd
    import shapely
    from shapely.ops import unary_union

    frame = gpd.read_parquet(path)
    if frame.crs is None:
        frame = frame.set_crs(SOURCE_CRS)
    codes = [region_code(name) for name in frame["NAME"]]
    repaired = [shapely.make_valid(geom) for geom in frame.geometry]

    by_code: dict[str, list] = {}
    for code, geom in zip(codes, repaired, strict=True):
        by_code.setdefault(code, []).append(geom)
    missing = [code for code, _ in REGIONS if code not in by_code]
    if missing:
        raise ValueError(f"no polygons for {missing}")

    region_geoms = {code: unary_union(by_code[code]) for code, _ in REGIONS}
    region_names = dict(REGIONS)
    region_shapes = _transform_all(
        [(code, region_names[code], region_geoms[code]) for code, _ in REGIONS], gpd
    )

    interconnection_shapes = _transform_all(
        [
            (
                code,
                name,
                unary_union([region_geoms[member] for member in members]),
            )
            for code, name, members in INTERCONNECTIONS
        ],
        gpd,
    )
    for shape in region_shapes + interconnection_shapes:
        if not shape.geom.is_valid:
            raise ValueError(f"{shape.code} is not valid after dissolve")
    return region_shapes, interconnection_shapes


def _transform_all(items: Sequence[tuple[str, str, object]], gpd) -> list[Shape]:
    series = gpd.GeoSeries([geom for _, _, geom in items], crs=SOURCE_CRS).to_crs(TARGET_CRS)
    return [
        Shape(code=code, name=name, geom=_as_multipolygon(geom))
        for (code, name, _), geom in zip(items, series, strict=True)
    ]


def dry_run_lines(regions: Sequence[Shape], interconnections: Sequence[Shape]) -> list[str]:
    lines = [f"regions: {len(regions)}", f"{'code':<10}{'name':<18}{'area_km2':>16}"]
    lines += [_area_line(shape) for shape in regions]
    lines.append(f"interconnections: {len(interconnections)}")
    lines += [_area_line(shape) for shape in interconnections]
    return lines


def _area_line(shape: Shape) -> str:
    area_km2 = shape.geom.area / 1_000_000
    return f"{shape.code:<10}{shape.name:<18}{area_km2:>16,.0f}"


def provenance_text() -> str:
    mapping_rows = "\n".join(
        f"| `{needle}` | `{code}` |" for needle, code in _NAME_RULES
    )
    return "\n".join(
        [
            "# NERC regions and subregions (HIFLD archive)",
            "",
            "- Source: HIFLD \"NERC Regions and Subregions\", licence public (HIFLD Open).",
            "- Field `SOURCEDATE`: 2023-09-29. Source field: EIA 861, nerc.com.",
            f"- Archive: {ARCHIVE_URL} (README generated 2025-08-25).",
            f"- File: {FILE_URL}",
            f"- Size: {SOURCE_SIZE:,} bytes. SHA-256: `{SOURCE_SHA256}`.",
            "- Downloaded 2026-11-27 01:38 UTC. No CRS recorded; treated as EPSG:4326.",
            "- Loader: `scripts/load_nerc_regions.py` (dissolves to 6 regions and 3 interconnections, EPSG:5070).",
            "",
            "## Mapping (file `NAME` substring to code)",
            "",
            "| File substring | Code |",
            "|---|---|",
            mapping_rows,
            "",
            "- FRCC merged into SERC in 2019, so FRCC rows dissolve into SERC.",
            "- SPP RE was dissolved in 2018; its entities moved mostly to MRO.",
            "- Display names: WECC, Texas RE, MRO, NPCC, ReliabilityFirst, SERC.",
            "- Interconnections: western = WECC; ercot = TRE; eastern = MRO, NPCC, RF, SERC.",
            "",
            _PROVENANCE_LIMIT,
            "",
        ]
    )


async def replace_rows(conn, regions: Sequence[Shape], interconnections: Sequence[Shape]) -> None:
    """Delete and insert both tables on the given connection.

    The caller owns the transaction, so a test can roll this back.
    """

    await conn.execute("DELETE FROM ref.nerc_regions")
    await conn.execute("DELETE FROM ref.interconnections")
    insert = (
        "INSERT INTO ref.{table} (code, name, geom) "
        "VALUES ($1, $2, ST_Multi(ST_GeomFromWKB($3::bytea, 5070)))"
    )
    await conn.executemany(
        insert.format(table="nerc_regions"),
        [(s.code, s.name, s.geom.wkb) for s in regions],
    )
    await conn.executemany(
        insert.format(table="interconnections"),
        [(s.code, s.name, s.geom.wkb) for s in interconnections],
    )


async def _write_async(url: str, regions: Sequence[Shape], interconnections: Sequence[Shape]) -> None:
    import asyncpg

    connection = await asyncpg.connect(url)
    try:
        async with connection.transaction():
            await replace_rows(connection, regions, interconnections)
    finally:
        await connection.close()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--file", type=Path, help="path to the GeoParquet file")
    parser.add_argument("--dry-run", action="store_true", help="print areas, write nothing")
    parser.add_argument(
        "--provenance", action="store_true", help="print PROVENANCE.md text and exit"
    )
    args = parser.parse_args(argv)

    if args.provenance:
        print(provenance_text())
        return 0
    if args.file is None:
        parser.error("--file is required")

    url = None
    if not args.dry_run:
        url = os.environ.get("FORGE_ADMIN_DATABASE_URL")
        if not url:
            parser.error("FORGE_ADMIN_DATABASE_URL is not set")

    verify_source(args.file)
    regions, interconnections = build_shapes(args.file)
    if args.dry_run:
        print("\n".join(dry_run_lines(regions, interconnections)))
        return 0
    asyncio.run(_write_async(url, regions, interconnections))
    print(f"wrote {len(regions)} regions and {len(interconnections)} interconnections")
    return 0


if __name__ == "__main__":
    sys.exit(main())
