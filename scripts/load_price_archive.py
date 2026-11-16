"""Load the 2025 day-ahead price archive.

Money stays `Decimal`. A failed gate raises `ArchiveRejected` and does not
open `FORGE_LOADER_DATABASE_URL`.
"""

from __future__ import annotations

import asyncio
import csv
import hashlib
import json
import os
import re
import zipfile
from collections import defaultdict
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import asyncpg

RELEASE_LABEL = (
    "Day-ahead energy, congestion, and loss, and hourly load, calendar 2025"
)
POLYGON_SOURCE = (
    "EIA Atlas RTO Regions via the public ArcGIS replica "
    "(item 0e6e5e784bc8458c81f2b05d70f5c3ae)"
)
MARKET_YEAR = 2025
GRIDSTATUS_VERSION = "0.37.0"
_HOURS = 8760
_ENERGY_SPAN = Decimal("0.02")
_IDENTITY_SPAN = Decimal("0.01")
_UTC = UTC
_SPP_LOAD_GAP = datetime(2025, 1, 23, 1, tzinfo=_UTC)
_SPP_LOAD_GAP_AREAS = frozenset(
    {
        "CSWS",
        "EDE",
        "GRDA",
        "INDN",
        "KACY",
        "KCPL",
        "LES",
        "MPS",
        "OKGE",
        "SECI",
        "SPRM",
        "SPS",
        "WFEC",
        "WR",
    }
)
_EST = timezone(timedelta(hours=-5))
_EDT = timezone(timedelta(hours=-4))
_EASTERN = ZoneInfo("America/New_York")
_ISO_FROM_DIR = {
    "CAISO": "CAISO",
    "ISO-NE": "ISONE",
    "NYISO": "NYISO",
    "MISO": "MISO",
    "SPP": "SPP",
}
_BARE_SHA = r"(?:[-*]\s*)?(?:\*\*)?SHA-256:(?:\*\*)?\s*[0-9A-Fa-f]{64}"
_DATE_TEXT = re.compile(r"\d{1,2}/\d{1,2}/\d{4}(?:\s.*)?|\d{4}-\d{2}-\d{2}(?:[T\s].*)?|\d+(?:\.0+)?")
_HEX = re.compile(r"(?<![0-9A-Fa-f])([0-9A-Fa-f]{64})(?![0-9A-Fa-f])")
_CAISO_COMPONENT = {
    "LMP": "lmp",
    "LMP_PRC": "lmp",
    "MCE": "energy",
    "LMP_ENE_PRC": "energy",
    "MCC": "congestion",
    "LMP_CONG_PRC": "congestion",
    "MCL": "loss",
    "LMP_LOSS_PRC": "loss",
}
_MISO_ZONES = ("LRZ8_9_10", "LRZ2_7", "LRZ3_5", "LRZ1", "LRZ4", "LRZ6")
_NYISO_DROP = {"H Q", "NPX", "O H", "PJM"}
_LIBRARY_NYISO = "nyiso_dam_lbmp_zone_2025.csv"

csv.field_size_limit(10_000_000)


class ArchiveRejected(Exception):
    def __init__(self, file: str, location: str, hours: list[str]) -> None:
        self.file = file
        self.location = location
        self.hours = hours
        super().__init__(f"{file} {location} {hours}")


@dataclass(frozen=True)
class Zone:
    iso: str
    zone: str
    price_location: str | None
    load_location: str | None
    polygon_source: str = "rto_subzones"
    polygon_rto_iso: str = ""
    polygon_loc_type: str = ""
    polygon_loc_abbrev: str = ""


@dataclass(frozen=True)
class PriceRow:
    iso: str
    price_location: str
    hour_utc: datetime
    lmp: Decimal
    energy: Decimal
    congestion: Decimal
    loss: Decimal
    energy_derived: bool


@dataclass(frozen=True)
class LoadRow:
    iso: str
    load_location: str
    hour_utc: datetime
    load_mw: Decimal


@dataclass(frozen=True)
class MarketPair:
    iso: str
    zone_snd: str
    zone_rcv: str
    spread_per_mwh: Decimal
    hours_fwd: int
    hours_rev: int


@dataclass(frozen=True)
class ZoneEnergy:
    iso: str
    zone: str
    energy_value_per_mwh: Decimal


def expected_hours(iso: str) -> list[datetime]:
    """8,760 UTC hour starts for calendar 2025.

    ISO-NE, NYISO, and MISO share the Eastern window, which runs from
    2025-01-01 05:00 UTC through 2026-01-01 04:00 UTC. CAISO uses the Pacific
    window, from 2025-01-01 08:00 UTC through 2026-01-01 07:00 UTC. SPP uses
    the Central window, from 2025-01-01 06:00 UTC through 2026-01-01 05:00 UTC.
    """

    if iso == "CAISO":
        start_hour = 8
    elif iso == "SPP":
        start_hour = 6
    elif iso in {"ISONE", "ISO-NE", "NYISO", "MISO"}:
        start_hour = 5
    else:
        raise ArchiveRejected(iso, iso, [])
    start = datetime(2025, 1, 1, start_hour, tzinfo=_UTC)
    return [start + timedelta(hours=offset) for offset in range(_HOURS)]


def _hours_complete(iso: str, location: str, found: list[datetime]) -> bool:
    expected = set(expected_hours(iso))
    got = set(found)
    if len(found) != len(got):
        return False
    if got == expected:
        return True
    return (
        iso == "SPP"
        and location in _SPP_LOAD_GAP_AREAS
        and got == expected - {_SPP_LOAD_GAP}
    )


def load_zones(path: Path | str) -> list[Zone]:
    zones: list[Zone] = []
    with Path(path).open(newline="", encoding="utf-8") as handle:
        for record in csv.DictReader(handle):
            zones.append(
                Zone(
                    iso=record["iso"].strip(),
                    zone=record["zone"].strip(),
                    price_location=_blank(record["price_location"]),
                    load_location=_blank(record["load_location"]),
                    polygon_source=record["polygon_source"].strip(),
                    polygon_rto_iso=record["polygon_rto_iso"].strip(),
                    polygon_loc_type=record["polygon_loc_type"].strip(),
                    polygon_loc_abbrev=record["polygon_loc_abbrev"].strip(),
                )
            )
    return zones


def _required_load_keys(zones: Sequence[Zone]) -> tuple[tuple[str, str], ...]:
    """Non-null load locations on the CAISO, ISONE, NYISO, MISO, and SPP rows."""

    allowed = set(_ISO_FROM_DIR.values())
    keys: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for zone in zones:
        if zone.iso not in allowed or zone.load_location is None:
            continue
        key = (zone.iso, zone.load_location)
        if key in seen:
            continue
        seen.add(key)
        keys.append(key)
    return tuple(keys)


def _required_price_keys(zones: Sequence[Zone]) -> tuple[tuple[str, str], ...]:
    """Non-null price locations on the CAISO, ISONE, NYISO, MISO, and SPP rows."""

    allowed = set(_ISO_FROM_DIR.values())
    keys: list[tuple[str, str]] = []
    for zone in zones:
        if zone.iso not in allowed or zone.price_location is None:
            continue
        key = (zone.iso, zone.price_location)
        if key not in keys:
            keys.append(key)
    return tuple(keys)


def gate_hours(
    rows: Sequence[PriceRow] | Sequence[LoadRow],
    required: Sequence[tuple[str, str]] = (),
) -> None:
    grouped: dict[tuple[str, str], list[datetime]] = defaultdict(list)
    for key in required:
        if key not in grouped:
            grouped[key] = []
    for row in rows:
        if isinstance(row, LoadRow):
            key = (row.iso, row.load_location)
        else:
            key = (row.iso, row.price_location)
        grouped[key].append(_utc(row.hour_utc))
    for (iso, location), found in grouped.items():
        expected = set(expected_hours(iso))
        got = set(found)
        if _hours_complete(iso, location, found):
            continue
        hours = [item.isoformat() for item in sorted(expected.symmetric_difference(got))]
        if len(found) != len(got):
            counts: dict[datetime, int] = defaultdict(int)
            for item in found:
                counts[item] += 1
            hours.extend(item.isoformat() for item, count in counts.items() if count > 1)
        raise ArchiveRejected(iso, location, hours)


def gate_identity(rows: Sequence[PriceRow]) -> None:
    bad: dict[tuple[str, str], list[str]] = defaultdict(list)
    for row in rows:
        residual = abs(row.lmp - (row.energy + row.congestion + row.loss))
        if residual > _IDENTITY_SPAN:
            bad[(row.iso, row.price_location)].append(_utc(row.hour_utc).isoformat())
    if not bad:
        return
    (iso, location), hours = next(iter(bad.items()))
    raise ArchiveRejected(iso, location, hours)


def gate_equal_energy(rows: Sequence[PriceRow]) -> None:
    grouped: dict[tuple[str, datetime], list[Decimal]] = defaultdict(list)
    for row in rows:
        grouped[(row.iso, _utc(row.hour_utc))].append(row.energy)
    bad: dict[str, list[str]] = defaultdict(list)
    for (iso, hour), energies in grouped.items():
        if max(energies) - min(energies) > _ENERGY_SPAN:
            bad[iso].append(hour.isoformat())
    if not bad:
        return
    iso, hours = next(iter(bad.items()))
    raise ArchiveRejected(iso, iso, hours)


def market_pairs(zones: Sequence[Zone], prices: Sequence[PriceRow]) -> list[MarketPair]:
    series: dict[tuple[str, str], dict[datetime, Decimal]] = defaultdict(dict)
    for row in prices:
        series[(row.iso, row.price_location)][_utc(row.hour_utc)] = row.congestion
    by_iso: dict[str, list[Zone]] = defaultdict(list)
    for zone in zones:
        if zone.price_location is not None:
            by_iso[zone.iso].append(zone)
    pairs: list[MarketPair] = []
    for iso, group in by_iso.items():
        for sending in group:
            sending_series = series.get((iso, sending.price_location or ""), {})
            for receiving in group:
                if sending.zone == receiving.zone:
                    pairs.append(
                        MarketPair(iso, sending.zone, receiving.zone, Decimal(0), 0, 0)
                    )
                    continue
                receiving_series = series.get((iso, receiving.price_location or ""), {})
                total = Decimal(0)
                hours_fwd = 0
                hours_rev = 0
                for hour, congestion_snd in sending_series.items():
                    congestion_rcv = receiving_series.get(hour)
                    if congestion_rcv is None:
                        continue
                    total += abs(congestion_rcv - congestion_snd)
                    if congestion_rcv > congestion_snd:
                        hours_fwd += 1
                    elif congestion_snd > congestion_rcv:
                        hours_rev += 1
                pairs.append(
                    MarketPair(
                        iso,
                        sending.zone,
                        receiving.zone,
                        total / Decimal(_HOURS),
                        hours_fwd,
                        hours_rev,
                    )
                )
    return pairs


def zone_energy_values(
    zones: Sequence[Zone],
    prices: Sequence[PriceRow],
    loads: Sequence[LoadRow],
) -> list[ZoneEnergy]:
    energy: dict[tuple[str, str], dict[datetime, Decimal]] = defaultdict(dict)
    for row in prices:
        energy[(row.iso, row.price_location)][_utc(row.hour_utc)] = row.energy
    load: dict[tuple[str, str], dict[datetime, Decimal]] = defaultdict(dict)
    for row in loads:
        load[(row.iso, row.load_location)][_utc(row.hour_utc)] = row.load_mw
    values: list[ZoneEnergy] = []
    for zone in zones:
        if zone.price_location is None or zone.load_location is None:
            continue
        components = energy.get((zone.iso, zone.price_location), {})
        megawatts = load.get((zone.iso, zone.load_location), {})
        numer = Decimal(0)
        denom = Decimal(0)
        for hour, component in components.items():
            hour_load = megawatts.get(hour)
            if hour_load is None:
                continue
            numer += hour_load * component
            denom += hour_load
        if denom == 0:
            raise ArchiveRejected(zone.iso, zone.zone, [])
        values.append(ZoneEnergy(zone.iso, zone.zone, numer / denom))
    return values


def check_tree(root: Path | str) -> dict[str, str]:
    """Hash every allowlisted raw file against its sibling `PROVENANCE.md`."""

    base = Path(root)
    digests: dict[str, str] = {}
    for kind in ("lmp-da", "load-hourly"):
        for dirname in _ISO_FROM_DIR:
            directory = base / kind / "2025" / dirname
            provenance = directory / "PROVENANCE.md"
            raw = directory / "raw"
            if not provenance.is_file() or not raw.is_dir():
                raise ArchiveRejected(str(provenance), dirname, [])
            files = [path for path in sorted(raw.rglob("*")) if path.is_file()]
            recorded = _hash_lines(
                provenance.read_text(encoding="utf-8"),
                [path.name for path in files],
            )
            present = {path.name for path in files}
            for name in recorded:
                if name not in present:
                    raise ArchiveRejected(name, dirname, [])
            for path in files:
                expected = recorded.get(path.name)
                if expected is None:
                    raise ArchiveRejected(path.name, dirname, [])
                digest = _sha256(path)
                if digest != expected:
                    raise ArchiveRejected(path.name, dirname, [])
                key = path.name if path.name not in digests else f"{dirname}/{path.name}"
                digests[key] = digest
    return digests


def read_prices(root: Path | str, zones: Sequence[Zone]) -> list[PriceRow]:
    base = Path(root)
    rows: list[PriceRow] = []
    for dirname, iso in _ISO_FROM_DIR.items():
        keep = _locations(zones, iso, price=True)
        raw = base / "lmp-da" / "2025" / dirname / "raw"
        if not raw.is_dir():
            continue
        if iso == "CAISO":
            rows.extend(_caiso_prices(raw, keep))
        elif iso == "ISONE":
            rows.extend(_isone_prices(raw, keep))
        elif iso == "NYISO":
            rows.extend(_nyiso_prices(raw, keep))
        elif iso == "SPP":
            rows.extend(_spp_prices(raw, keep))
        else:
            rows.extend(_miso_prices(raw, keep))
    return rows


def read_loads(root: Path | str, zones: Sequence[Zone]) -> list[LoadRow]:
    base = Path(root)
    rows: list[LoadRow] = []
    for dirname, iso in _ISO_FROM_DIR.items():
        keep = _locations(zones, iso, price=False)
        raw = base / "load-hourly" / "2025" / dirname / "raw"
        if not raw.is_dir():
            continue
        if iso == "CAISO":
            rows.extend(_caiso_loads(raw, keep))
        elif iso == "ISONE":
            rows.extend(_isone_loads(raw, keep))
        elif iso == "NYISO":
            rows.extend(_nyiso_loads(raw, keep))
        elif iso == "SPP":
            rows.extend(_spp_loads(raw, keep))
        else:
            rows.extend(_miso_loads(raw, keep))
    return rows


def replace_archive(data_root: Path | str, zones_path: Path | str) -> None:
    """Replace the archive after every gate has passed.

    The database connection is opened only after the gates. Every non-null
    load location on the CAISO, ISONE, NYISO, MISO, and SPP rows must already
    be a full 8,760-hour set, including a series such as LRZ3_5 that belongs
    only to unpriced zones. The 14 SPP load areas may omit 2025-01-23 01:00 UTC
    only. One transaction deletes the six tables and
    inserts the replacement. An exception rolls that transaction back.
    """

    zones = load_zones(zones_path)
    digests = check_tree(data_root)
    prices = read_prices(data_root, zones)
    loads = read_loads(data_root, zones)
    gate_hours(prices, _required_price_keys(zones))
    gate_hours(loads, _required_load_keys(zones))
    gate_identity(prices)
    gate_equal_energy(prices)
    pairs = market_pairs(zones, prices)
    values = zone_energy_values(zones, prices, loads)
    url = os.environ["FORGE_LOADER_DATABASE_URL"]
    asyncio.run(_write_async(url, zones, prices, loads, pairs, values, digests))


async def _write_async(
    url: str,
    zones: Sequence[Zone],
    prices: Sequence[PriceRow],
    loads: Sequence[LoadRow],
    pairs: Sequence[MarketPair],
    values: Sequence[ZoneEnergy],
    digests: dict[str, str],
) -> None:
    connection = await asyncpg.connect(url)
    try:
        async with connection.transaction():
            for table in (
                "market_pair",
                "zone_energy_value",
                "da_price_hourly",
                "load_hourly",
                "price_zone",
                "price_archive_release",
            ):
                await connection.execute(f"DELETE FROM ref.{table}")
            await _executemany(
                connection,
                """
                INSERT INTO ref.price_zone (
                    iso, zone, polygon_source, polygon_rto_iso, polygon_loc_type,
                    polygon_loc_abbrev, price_location, load_location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                [
                    (
                        zone.iso,
                        zone.zone,
                        zone.polygon_source,
                        zone.polygon_rto_iso,
                        zone.polygon_loc_type,
                        zone.polygon_loc_abbrev,
                        zone.price_location,
                        zone.load_location,
                    )
                    for zone in zones
                ],
            )
            await _executemany(
                connection,
                """
                INSERT INTO ref.da_price_hourly (
                    iso, price_location, hour_utc, lmp, energy, congestion, loss,
                    energy_derived
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                [
                    (
                        row.iso,
                        row.price_location,
                        _utc(row.hour_utc),
                        row.lmp,
                        row.energy,
                        row.congestion,
                        row.loss,
                        row.energy_derived,
                    )
                    for row in prices
                ],
            )
            await _executemany(
                connection,
                """
                INSERT INTO ref.load_hourly (iso, load_location, hour_utc, load_mw)
                VALUES ($1, $2, $3, $4)
                """,
                [
                    (row.iso, row.load_location, _utc(row.hour_utc), row.load_mw)
                    for row in loads
                ],
            )
            await _executemany(
                connection,
                """
                INSERT INTO ref.market_pair (
                    iso, zone_snd, zone_rcv, spread_per_mwh, hours_fwd, hours_rev
                ) VALUES ($1, $2, $3, $4, $5, $6)
                """,
                [
                    (
                        pair.iso,
                        pair.zone_snd,
                        pair.zone_rcv,
                        pair.spread_per_mwh,
                        pair.hours_fwd,
                        pair.hours_rev,
                    )
                    for pair in pairs
                ],
            )
            await _executemany(
                connection,
                """
                INSERT INTO ref.zone_energy_value (iso, zone, energy_value_per_mwh)
                VALUES ($1, $2, $3)
                """,
                [
                    (item.iso, item.zone, item.energy_value_per_mwh)
                    for item in values
                ],
            )
            await connection.execute(
                """
                INSERT INTO ref.price_archive_release (
                    label, market_year, gridstatus_version, polygon_source,
                    loaded_at, source_sha256
                ) VALUES ($1, $2, $3, $4, now(), $5::jsonb)
                """,
                RELEASE_LABEL,
                MARKET_YEAR,
                GRIDSTATUS_VERSION,
                POLYGON_SOURCE,
                json.dumps(digests, sort_keys=True),
            )
    finally:
        await connection.close()


async def _executemany(connection, sql: str, records: list[tuple]) -> None:
    step = 5000
    for start in range(0, len(records), step):
        await connection.executemany(sql, records[start : start + step])


def _locations(zones: Sequence[Zone], iso: str, *, price: bool) -> set[str]:
    found: set[str] = set()
    for zone in zones:
        if zone.iso != iso:
            continue
        value = zone.price_location if price else zone.load_location
        if value is not None:
            found.add(value)
    return found


def _blank(text: str) -> str | None:
    cleaned = text.strip()
    return cleaned or None


def _utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        return moment.replace(tzinfo=_UTC)
    return moment.astimezone(_UTC)


def _money(text: str) -> Decimal:
    cleaned = text.strip().replace(",", "").replace("$", "")
    return Decimal(cleaned)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1024 * 1024)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def _hash_lines(text: str, raw_names: list[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    raw_set = set(raw_names)
    # A bare "SHA-256: <hex>" list item names its file on an earlier item of
    # the same list block. A blank line or heading ends the block.
    block_name: str | None = None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            block_name = None
        hexes = _HEX.findall(line)
        if not hexes:
            named = [
                name
                for name in raw_set
                if re.search(rf"(?<![\w.-]){re.escape(name)}(?![\w.-])", line)
            ]
            if len(named) == 1:
                block_name = named[0]
            continue
        digest = hexes[0].lower()
        candidates = [Path(item.strip()).name for item in re.findall(r"`([^`]+)`", line)]
        if "|" in line:
            for cell in line.strip().strip("|").split("|"):
                name = Path(cell.strip().strip("`")).name
                if name in raw_set:
                    candidates.append(name)
        chosen = next((name for name in candidates if name in raw_set), None)
        if (
            chosen is None
            and re.fullmatch(_BARE_SHA, line.strip())
            and len(raw_names) == 1
        ):
            chosen = raw_names[0]
        if chosen is None and len(candidates) == 1:
            chosen = candidates[0]
        if (
            chosen is None
            and block_name is not None
            and re.fullmatch(_BARE_SHA, line.strip())
        ):
            chosen = block_name
        if chosen:
            found[chosen] = digest
    return found


def _files(raw: Path) -> list[Path]:
    return sorted(
        path
        for path in raw.rglob("*")
        if path.is_file() and not path.name.startswith(".")
    )


def _decode(payload: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return payload.decode("utf-8")


def _csv_members(path: Path) -> Iterator[tuple[str, str]]:
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist():
                if info.is_dir() or not info.filename.lower().endswith(".csv"):
                    continue
                if Path(info.filename).name.startswith("."):
                    continue
                yield info.filename, _decode(archive.read(info))
        return
    if path.suffix.lower() == ".csv":
        yield path.name, _decode(path.read_bytes())


def _header_map(header: Sequence[str]) -> dict[str, int]:
    return {cell.strip(): index for index, cell in enumerate(header)}


def _pick(header: dict[str, int], names: Sequence[str]) -> int | None:
    for name in names:
        if name in header:
            return header[name]
    lowered = {key.lower(): value for key, value in header.items()}
    for name in names:
        if name.lower() in lowered:
            return lowered[name.lower()]
    return None


def _cell(row: Sequence[str], index: int | None) -> str:
    if index is None or index >= len(row):
        return ""
    return row[index].strip()


def _as_utc_text(text: str) -> datetime:
    cleaned = text.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    parsed = datetime.fromisoformat(cleaned)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=_UTC)
    return parsed.astimezone(_UTC)


def _day_from_name(name: str) -> date | None:
    match = re.search(r"(20\d{2})(\d{2})(\d{2})", Path(name).name)
    if match is None:
        return None
    year, month, day = (int(part) for part in match.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _caiso_prices(raw: Path, keep: set[str]) -> list[PriceRow]:
    grouped: dict[tuple[str, datetime], dict[str, Decimal]] = defaultdict(dict)
    for path in _files(raw):
        for _name, text in _csv_members(path):
            _consume_caiso_price(text, keep, grouped)
    rows: list[PriceRow] = []
    for (node, hour), parts in grouped.items():
        if not {"lmp", "energy", "congestion", "loss"} <= set(parts):
            continue
        rows.append(
            PriceRow(
                "CAISO",
                node,
                hour,
                parts["lmp"],
                parts["energy"],
                parts["congestion"],
                parts["loss"],
                False,
            )
        )
    return rows


def _consume_caiso_price(
    text: str,
    keep: set[str],
    grouped: dict[tuple[str, datetime], dict[str, Decimal]],
) -> None:
    reader = csv.reader(text.splitlines())
    try:
        header = _header_map(next(reader))
    except StopIteration:
        return
    time_index = _pick(header, ("INTERVALSTARTTIME_GMT", "Interval Start"))
    node_index = _pick(header, ("NODE", "Location", "PNODE_RESMRID"))
    if time_index is None or node_index is None:
        return
    wide = _pick(header, ("LMP_PRC",))
    if wide is not None:
        energy_index = _pick(header, ("LMP_ENE_PRC",))
        congestion_index = _pick(header, ("LMP_CONG_PRC",))
        loss_index = _pick(header, ("LMP_LOSS_PRC",))
        for row in reader:
            node = _cell(row, node_index)
            if node not in keep:
                continue
            hour = _as_utc_text(_cell(row, time_index))
            bucket = grouped[(node, hour)]
            for key, index in (
                ("lmp", wide),
                ("energy", energy_index),
                ("congestion", congestion_index),
                ("loss", loss_index),
            ):
                value = _cell(row, index)
                if value != "":
                    bucket[key] = _money(value)
        return
    type_index = _pick(header, ("LMP_TYPE",))
    price_index = _pick(header, ("MW", "PRC", "VALUE"))
    if type_index is None or price_index is None:
        return
    for row in reader:
        node = _cell(row, node_index)
        if node not in keep:
            continue
        component = _CAISO_COMPONENT.get(_cell(row, type_index).upper())
        value = _cell(row, price_index)
        if component is None or value == "":
            continue
        grouped[(node, _as_utc_text(_cell(row, time_index)))][component] = _money(value)


def _caiso_loads(raw: Path, keep: set[str]) -> list[LoadRow]:
    rows: list[LoadRow] = []
    for path in _files(raw):
        for _name, text in _csv_members(path):
            rows.extend(_consume_caiso_load(text, keep))
    return rows


def _consume_caiso_load(text: str, keep: set[str]) -> list[LoadRow]:
    reader = csv.reader(text.splitlines())
    try:
        header = _header_map(next(reader))
    except StopIteration:
        return []
    time_index = _pick(header, ("INTERVALSTARTTIME_GMT", "Interval Start"))
    area_index = _pick(header, ("TAC_AREA_NAME", "TAC Area Name"))
    value_index = _pick(header, ("Load", "MW"))
    market_index = _pick(header, ("MARKET_RUN_ID",))
    if time_index is None or area_index is None or value_index is None:
        return []
    rows: list[LoadRow] = []
    for row in reader:
        if market_index is not None and _cell(row, market_index) not in {"", "ACTUAL"}:
            continue
        area = _cell(row, area_index)
        if area not in keep:
            continue
        value = _cell(row, value_index)
        if value == "":
            continue
        rows.append(
            LoadRow("CAISO", area, _as_utc_text(_cell(row, time_index)), _money(value))
        )
    return rows


def _isone_prices(raw: Path, keep: set[str]) -> list[PriceRow]:
    found: list[PriceRow] = []
    for path in _files(raw):
        for _name, text in _csv_members(path):
            found.extend(_consume_isone_price(text, keep))
    return found


def _consume_isone_price(text: str, keep: set[str]) -> list[PriceRow]:
    reader = csv.reader(text.splitlines())
    try:
        header = _header_map(next(reader))
    except StopIteration:
        return []
    location_index = _pick(header, ("Location", "Location Name"))
    energy_index = _pick(header, ("Energy", "Energy Component"))
    congestion_index = _pick(header, ("Congestion", "Congestion Component"))
    loss_index = _pick(header, ("Loss", "Marginal Loss Component", "Loss Component"))
    lmp_index = _pick(header, ("LMP", "Locational Marginal Price"))
    start_index = _pick(header, ("Interval Start",))
    date_index = _pick(header, ("Date",))
    ending_index = _pick(header, ("Hour Ending", "Hr_End"))
    if location_index is None or energy_index is None or lmp_index is None:
        return []
    seen: dict[tuple[str, str], int] = defaultdict(int)
    rows: list[PriceRow] = []
    for row in reader:
        location = _cell(row, location_index)
        if location not in keep:
            continue
        if start_index is not None and _cell(row, start_index) != "":
            stamp = _cell(row, start_index)
            key = (location, stamp)
            occurrence = seen[key]
            seen[key] += 1
            hour = _interval_start(stamp, occurrence)
        else:
            day = _parse_day(_cell(row, date_index))
            token = _hr_token(_cell(row, ending_index))
            hour = _isone_start(day, token)
        rows.append(
            PriceRow(
                "ISONE",
                location,
                hour,
                _money(_cell(row, lmp_index)),
                _money(_cell(row, energy_index)),
                _money(_cell(row, congestion_index)),
                _money(_cell(row, loss_index)),
                False,
            )
        )
    return rows


def _isone_loads(raw: Path, keep: set[str]) -> list[LoadRow]:
    books = [path for path in _files(raw) if path.suffix.lower() == ".xlsx"]
    rows: list[LoadRow] = []
    for sheet_name in sorted(keep):
        table = None
        source = ""
        for book in books:
            table = _xlsx_table(book, sheet_name)
            source = book.name
            if table is not None:
                break
        if table is None:
            raise ArchiveRejected(source or sheet_name, sheet_name, [])
        for record in table:
            if "Hr_End" not in record or "RT_Demand" not in record or "Date" not in record:
                continue
            demand = record["RT_Demand"].strip()
            if demand == "":
                continue
            day = _parse_day(record["Date"])
            hour = _isone_start(day, _hr_token(record["Hr_End"]))
            rows.append(LoadRow("ISONE", sheet_name, hour, Decimal(demand.strip())))
    return rows


def _nyiso_prices(raw: Path, keep: set[str]) -> list[PriceRow]:
    rows: list[PriceRow] = []
    for path in _files(raw):
        if path.name == _LIBRARY_NYISO:
            continue
        for _name, text in _csv_members(path):
            rows.extend(_consume_nyiso_price(text, keep))
    return rows


def _consume_nyiso_price(text: str, keep: set[str]) -> list[PriceRow]:
    reader = csv.reader(text.splitlines())
    try:
        header = _header_map(next(reader))
    except StopIteration:
        return []
    stamp_index = _pick(header, ("Time Stamp", "Timestamp"))
    name_index = _pick(header, ("Name", "Location"))
    lmp_index = _pick(header, ("LBMP ($/MWHr)", "LMP"))
    loss_index = _pick(header, ("Marginal Cost Losses ($/MWHr)", "Loss"))
    congestion_index = _congestion_index(header)
    if None in {stamp_index, name_index, lmp_index, loss_index, congestion_index}:
        return []
    seen: dict[tuple[str, str], int] = defaultdict(int)
    rows: list[PriceRow] = []
    for row in reader:
        name = _cell(row, name_index)
        if name in _NYISO_DROP or name not in keep:
            continue
        stamp = _cell(row, stamp_index)
        key = (name, stamp)
        occurrence = seen[key]
        seen[key] += 1
        published_congestion = _money(_cell(row, congestion_index))
        published_loss = _money(_cell(row, loss_index))
        lmp = _money(_cell(row, lmp_index))
        congestion = -published_congestion
        loss = published_loss
        energy = lmp - congestion - loss
        rows.append(
            PriceRow(
                "NYISO",
                name,
                _nyiso_stamp(stamp, occurrence),
                lmp,
                energy,
                congestion,
                loss,
                True,
            )
        )
    return rows


def _congestion_index(header: dict[str, int]) -> int | None:
    direct = _pick(header, ("Marginal Cost Congestion ($/MWHr)", "Congestion"))
    if direct is not None:
        return direct
    for name, index in header.items():
        if name.startswith("Marginal Cost Congestion"):
            return index
    return None


def _nyiso_loads(raw: Path, keep: set[str]) -> list[LoadRow]:
    rows: list[LoadRow] = []
    for path in _files(raw):
        for _name, text in _csv_members(path):
            rows.extend(_consume_nyiso_load(text, keep))
    return rows


def _consume_nyiso_load(text: str, keep: set[str]) -> list[LoadRow]:
    reader = csv.reader(text.splitlines())
    try:
        header = _header_map(next(reader))
    except StopIteration:
        return []
    stamp_index = _pick(header, ("Time Stamp", "Timestamp"))
    zone_index = _pick(header, ("Time Zone",))
    name_index = _pick(header, ("Name", "Zone"))
    load_index = _pick(header, ("Integrated Load", "Load"))
    if None in {stamp_index, zone_index, name_index, load_index}:
        return []
    rows: list[LoadRow] = []
    for row in reader:
        name = _cell(row, name_index)
        if name not in keep:
            continue
        value = _cell(row, load_index)
        if value == "":
            continue
        rows.append(
            LoadRow(
                "NYISO",
                name,
                _nyiso_zoned(_cell(row, stamp_index), _cell(row, zone_index)),
                _money(value),
            )
        )
    return rows


def _nyiso_stamp(stamp: str, occurrence: int) -> datetime:
    day, hour, minute = _stamp_parts(stamp)
    if day == date(2025, 11, 2) and hour == 1 and minute == 0:
        offset = _EDT if occurrence == 0 else _EST
    else:
        offset = _EASTERN
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=offset).astimezone(
        _UTC
    )


def _nyiso_zoned(stamp: str, zone_name: str) -> datetime:
    day, hour, minute = _stamp_parts(stamp)
    offset = _EDT if zone_name.upper() == "EDT" else _EST
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=offset).astimezone(
        _UTC
    )


def _stamp_parts(stamp: str) -> tuple[date, int, int]:
    try:
        date_text, time_text = stamp.split()
        month_text, day_text, year_text = date_text.split("/")
        clock = time_text.split(":")
        return (
            date(int(year_text), int(month_text), int(day_text)),
            int(clock[0]),
            int(clock[1]),
        )
    except ValueError as exc:
        raise ArchiveRejected(stamp, "NYISO", []) from exc


def _gmt_hour_start(text: str) -> datetime | None:
    cleaned = text.strip()
    if cleaned == "":
        return None
    for fmt in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M"):
        try:
            ending = datetime.strptime(cleaned, fmt).replace(tzinfo=_UTC)
        except ValueError:
            continue
        return ending - timedelta(hours=1)
    return None


def _spp_prices(raw: Path, keep: set[str]) -> list[PriceRow]:
    rows: list[PriceRow] = []
    for path in _files(raw):
        text = path.read_text(encoding="utf-8-sig")
        rows.extend(_consume_spp_price(text, keep))
    return rows


def _consume_spp_price(text: str, keep: set[str]) -> list[PriceRow]:
    reader = csv.DictReader(text.splitlines())
    if reader.fieldnames is None:
        return []
    fields = {name.strip(): name for name in reader.fieldnames}
    needed = ("GMTIntervalEnd", "Settlement Location", "LMP", "MLC", "MCC", "MEC")
    if any(name not in fields for name in needed):
        return []
    rows: list[PriceRow] = []
    for record in reader:
        location = record[fields["Settlement Location"]].strip()
        if location not in keep:
            continue
        hour = _gmt_hour_start(record[fields["GMTIntervalEnd"]])
        if hour is None:
            continue
        rows.append(
            PriceRow(
                "SPP",
                location,
                hour,
                _money(record[fields["LMP"]]),
                _money(record[fields["MEC"]]),
                _money(record[fields["MCC"]]),
                _money(record[fields["MLC"]]),
                False,
            )
        )
    return rows


def _spp_loads(raw: Path, keep: set[str]) -> list[LoadRow]:
    rows: list[LoadRow] = []
    for path in _files(raw):
        if path.name != "DAILY_HOURLY_LOAD-2025.csv":
            continue
        text = path.read_text(encoding="utf-8-sig")
        rows.extend(_consume_spp_load(text, keep))
    return rows


def _consume_spp_load(text: str, keep: set[str]) -> list[LoadRow]:
    reader = csv.DictReader(text.splitlines())
    if reader.fieldnames is None:
        return []
    fields = {name.strip(): name for name in reader.fieldnames}
    if "MarketHour" not in fields:
        return []
    rows: list[LoadRow] = []
    for record in reader:
        hour = _gmt_hour_start(record[fields["MarketHour"]])
        if hour is None:
            continue
        for area in keep:
            key = fields.get(area)
            if key is None:
                continue
            cell = record[key].strip()
            if cell == "":
                continue
            rows.append(LoadRow("SPP", area, hour, _money(cell)))
    return rows


def _miso_prices(raw: Path, keep: set[str]) -> list[PriceRow]:
    grouped: dict[tuple[str, datetime], dict[str, Decimal]] = defaultdict(dict)
    for path in _files(raw):
        for name, text in _csv_members(path):
            _consume_miso_price(name, text, keep, grouped)
    rows: list[PriceRow] = []
    for (node, hour), parts in grouped.items():
        if not {"lmp", "mcc", "mlc"} <= set(parts):
            continue
        lmp = parts["lmp"]
        congestion = parts["mcc"]
        loss = parts["mlc"]
        rows.append(
            PriceRow(
                "MISO",
                node,
                hour,
                lmp,
                lmp - congestion - loss,
                congestion,
                loss,
                True,
            )
        )
    return rows


def _consume_miso_price(
    name: str,
    text: str,
    keep: set[str],
    grouped: dict[tuple[str, datetime], dict[str, Decimal]],
) -> None:
    rows = list(csv.reader(text.splitlines()))
    header_at = None
    header: dict[str, int] = {}
    for index, row in enumerate(rows):
        cells = _header_map(row)
        if _pick(cells, ("Node", "CPNODE", "Location")) is None:
            continue
        if any(_he_number(cell) is not None for cell in cells) or _pick(
            cells, ("LMP", "MCC", "MLC")
        ):
            header_at = index
            header = cells
            break
    if header_at is None:
        return
    node_index = _pick(header, ("Node", "CPNODE", "Location"))
    value_index = _pick(header, ("Value",))
    lmp_index = _pick(header, ("LMP",))
    mcc_index = _pick(header, ("MCC",))
    mlc_index = _pick(header, ("MLC",))
    day_index = _pick(header, ("Market Day", "MarketDay", "MARKET_DAY", "Date"))
    he_index = _pick(header, ("HourEnding", "Hour Ending", "HE"))
    he_columns = [
        (index, number)
        for label, index in header.items()
        if (number := _he_number(label)) is not None
    ]
    file_day = _day_from_name(name)
    for row in rows[header_at + 1 :]:
        node = _cell(row, node_index)
        if node not in keep:
            continue
        if he_columns and value_index is not None:
            kind = _cell(row, value_index).upper()
            if kind not in {"LMP", "MCC", "MLC"}:
                continue
            market_day = (
                _parse_day(_cell(row, day_index)) if day_index is not None else file_day
            )
            if market_day is None or market_day.year != 2025:
                continue
            for index, number in he_columns:
                value = _cell(row, index)
                if value == "":
                    continue
                hour = _miso_hour(market_day, number)
                grouped[(node, hour)][kind.lower()] = _money(value)
            continue
        if None in {lmp_index, mcc_index, mlc_index, he_index}:
            continue
        market_day = _parse_day(_cell(row, day_index)) if day_index is not None else file_day
        if market_day is None or market_day.year != 2025:
            continue
        number = _he_number(_cell(row, he_index))
        if number is None:
            continue
        hour = _miso_hour(market_day, number)
        bucket = grouped[(node, hour)]
        bucket["lmp"] = _money(_cell(row, lmp_index))
        bucket["mcc"] = _money(_cell(row, mcc_index))
        bucket["mlc"] = _money(_cell(row, mlc_index))


def _miso_loads(raw: Path, keep: set[str]) -> list[LoadRow]:
    import xlrd

    rows: list[LoadRow] = []
    for path in _files(raw):
        if path.suffix.lower() != ".xls":
            continue
        span = _miso_span(path.name)
        book = xlrd.open_workbook(path)
        for sheet in book.sheets():
            rows.extend(_miso_sheet(book, sheet, keep, span))
    return rows


def _miso_span(name: str) -> tuple[date, date]:
    if "20260101" in name:
        day = date(2025, 12, 31)
        return day, day
    return date(2025, 1, 1), date(2025, 12, 30)


def _miso_sheet(book, sheet, keep: set[str], span: tuple[date, date]) -> list[LoadRow]:
    header_at = None
    headers: list[str] = []
    for index in range(min(sheet.nrows, 40)):
        headers = [_text_cell(sheet.cell(index, column)) for column in range(sheet.ncols)]
        if any(cell.strip() in {"Market Day", "MarketDay"} for cell in headers):
            header_at = index
            break
        if any(cell.strip() == "ActualLoad (MWh)" for cell in headers):
            header_at = index
            break
    if header_at is None:
        return []
    zone_columns = {
        column: zone
        for column, label in enumerate(headers)
        if (zone := _zone_in_header(label)) is not None and zone in keep
    }
    if zone_columns:
        return _miso_wide(book, sheet, headers, header_at, zone_columns, span)
    return _miso_long(book, sheet, headers, header_at, keep, span)


def _miso_wide(book, sheet, headers, header_at, zone_columns, span) -> list[LoadRow]:
    header = _header_map(headers)
    day_index = _pick(header, ("Market Day", "MarketDay"))
    he_index = _pick(header, ("HourEnding", "Hour Ending"))
    if day_index is None or he_index is None:
        return []
    rows: list[LoadRow] = []
    for index in range(header_at + 1, sheet.nrows):
        market_day = _xl_date(book, sheet.cell(index, day_index))
        number = _xl_he(sheet.cell(index, he_index))
        if market_day is None or number is None or not _in_span(market_day, span):
            continue
        hour = _miso_hour(market_day, number)
        for column, zone in zone_columns.items():
            value = _xl_decimal(sheet.cell(index, column))
            if value is None:
                continue
            rows.append(LoadRow("MISO", zone, hour, value))
    return rows


def _miso_long(book, sheet, headers, header_at, keep, span) -> list[LoadRow]:
    header = _header_map(headers)
    day_index = _pick(header, ("MarketDay", "Market Day"))
    he_index = _pick(header, ("HourEnding", "Hour Ending"))
    zone_index = _pick(header, ("LoadResource Zone", "Load Resource Zone", "Zone"))
    value_index = _pick(header, ("ActualLoad (MWh)", "ActualLoad"))
    if None in {day_index, he_index, zone_index, value_index}:
        return []
    rows: list[LoadRow] = []
    for index in range(header_at + 1, sheet.nrows):
        market_day = _xl_date(book, sheet.cell(index, day_index))
        number = _xl_he(sheet.cell(index, he_index))
        zone = _canon_zone(_text_cell(sheet.cell(index, zone_index)))
        if (
            market_day is None
            or number is None
            or zone is None
            or zone not in keep
            or not _in_span(market_day, span)
        ):
            continue
        value = _xl_decimal(sheet.cell(index, value_index))
        if value is None:
            continue
        rows.append(LoadRow("MISO", zone, _miso_hour(market_day, number), value))
    return rows


def _zone_in_header(label: str) -> str | None:
    compact = label.replace(" ", "").replace("(MWh)", "")
    if "ActualLoad" not in compact:
        return None
    for zone in _MISO_ZONES:
        if zone in compact:
            return zone
    return None


def _canon_zone(text: str) -> str | None:
    compact = text.strip().replace(" ", "_").replace("-", "_")
    if compact in set(_MISO_ZONES):
        return compact
    return None


def _in_span(day: date, span: tuple[date, date]) -> bool:
    return span[0] <= day <= span[1]


def _text_cell(cell) -> str:
    if cell.ctype == 1:
        return str(cell.value).strip()
    if cell.ctype == 2:
        return str(cell.value).strip()
    return ""


def _xl_decimal(cell) -> Decimal | None:
    if cell.ctype == 0 or cell.ctype == 6:
        return None
    if cell.ctype == 1:
        text = cell.value.strip()
        if text == "":
            return None
        return Decimal(text)
    if cell.ctype == 2:
        return Decimal(str(cell.value))
    return None


def _xl_he(cell) -> int | None:
    if cell.ctype == 2:
        return int(cell.value)
    if cell.ctype == 1 and cell.value.strip().isdigit():
        return int(cell.value.strip())
    return None


def _xl_date(book, cell) -> date | None:
    import xlrd

    if cell.ctype == xlrd.XL_CELL_DATE or (cell.ctype == 2 and cell.value > 20000):
        year, month, day, _hour, _minute, _second = xlrd.xldate_as_tuple(
            cell.value, book.datemode
        )
        return date(year, month, day)
    if cell.ctype == 1:
        # Workbooks carry titles, section labels and a disclaimer in the day
        # column. Those rows are not data; the hour gate catches any real gap.
        if not _DATE_TEXT.fullmatch(cell.value.strip()):
            return None
        return _parse_day(cell.value)
    return None


def _he_number(label: str) -> int | None:
    text = label.strip().upper()
    if text.startswith("HE"):
        text = text[2:].strip()
    if text.isdigit():
        number = int(text)
        if 1 <= number <= 24:
            return number
    return None


def _miso_hour(day: date, he: int) -> datetime:
    local = datetime(day.year, day.month, day.day, he - 1, tzinfo=_EST)
    return local.astimezone(_UTC)


def _interval_start(text: str, occurrence: int) -> datetime:
    cleaned = text.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    parsed = datetime.fromisoformat(cleaned.replace(" ", "T", 1) if _needs_tee(cleaned) else cleaned)
    if parsed.tzinfo is not None:
        return parsed.astimezone(_UTC)
    if (
        parsed.date() == date(2025, 11, 2)
        and parsed.hour == 1
        and parsed.minute == 0
    ):
        offset = _EDT if occurrence == 0 else _EST
        return parsed.replace(tzinfo=offset).astimezone(_UTC)
    return parsed.replace(tzinfo=_EASTERN).astimezone(_UTC)


def _needs_tee(text: str) -> bool:
    return " " in text and "T" not in text and "+" not in text and "-" in text[10:]


def _parse_day(text: str) -> date:
    cleaned = text.strip()
    if "/" in cleaned:
        month_text, day_text, year_text = cleaned.split()[0].split("/")
        return date(int(year_text), int(month_text), int(day_text))
    if "-" in cleaned:
        year_text, month_text, day_text = cleaned.split()[0].split("T")[0].split("-")
        return date(int(year_text), int(month_text), int(day_text))
    serial = int(Decimal(cleaned))
    return date(1899, 12, 30) + timedelta(days=serial)


def _hr_token(text: str) -> str:
    cleaned = text.strip()
    if cleaned.upper().endswith("X"):
        return "02X"
    return f"{int(Decimal(cleaned)):02d}"


def _isone_start(day: date, token: str) -> datetime:
    if day == date(2025, 11, 2) and token == "02":
        return datetime(2025, 11, 2, 1, tzinfo=_EDT).astimezone(_UTC)
    if day == date(2025, 11, 2) and token == "02X":
        return datetime(2025, 11, 2, 1, tzinfo=_EST).astimezone(_UTC)
    if day == date(2025, 3, 9) and token == "03":
        return datetime(2025, 3, 9, 1, tzinfo=_EST).astimezone(_UTC)
    local = datetime(day.year, day.month, day.day, int(token) - 1, tzinfo=_EASTERN)
    return local.astimezone(_UTC)


def _xlsx_table(path: Path, sheet_name: str) -> list[dict[str, str]] | None:
    grid = _xlsx_grid(path, sheet_name)
    if grid is None:
        return None
    header_at = None
    for index, row in enumerate(grid):
        if "Hr_End" in row.values() and "RT_Demand" in row.values():
            header_at = index
            break
    if header_at is None:
        return []
    header = grid[header_at]
    records: list[dict[str, str]] = []
    for row in grid[header_at + 1 :]:
        record = {header[column]: text for column, text in row.items() if column in header}
        if record.get("Date") or record.get("Hr_End"):
            records.append(record)
    return records


def _xlsx_grid(path: Path, sheet_name: str) -> list[dict[int, str]] | None:
    with zipfile.ZipFile(path) as archive:
        shared = _shared_strings(archive)
        target = _sheet_target(archive, sheet_name)
        if target is None:
            return None
        root = ElementTree.fromstring(archive.read(target))
    rows: list[dict[int, str]] = []
    for row in root.iter():
        if _local(row.tag) != "row":
            continue
        values: dict[int, str] = {}
        for cell in list(row):
            if _local(cell.tag) != "c":
                continue
            letters = "".join(ch for ch in cell.attrib.get("r", "A1") if ch.isalpha())
            index = 0
            for ch in letters:
                index = index * 26 + (ord(ch) - 64)
            text = _xlsx_value(cell, shared)
            if text is not None:
                values[index] = text
        rows.append(values)
    return rows


def _xlsx_value(cell, shared: list[str]) -> str | None:
    kind = cell.attrib.get("t")
    for child in list(cell):
        if _local(child.tag) == "v" and child.text is not None:
            if kind == "s":
                return shared[int(child.text)]
            return child.text
        if _local(child.tag) == "is":
            parts = [
                node.text or ""
                for node in child.iter()
                if _local(node.tag) == "t"
            ]
            return "".join(parts)
    return None


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root.iter():
        if _local(item.tag) != "si":
            continue
        values.append(
            "".join(node.text or "" for node in item.iter() if _local(node.tag) == "t")
        )
    return values


def _sheet_target(archive: zipfile.ZipFile, sheet_name: str) -> str | None:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        node.attrib["Id"]: node.attrib["Target"]
        for node in rels.iter()
        if _local(node.tag) == "Relationship"
    }
    for sheet in workbook.iter():
        if _local(sheet.tag) != "sheet" or sheet.attrib.get("name") != sheet_name:
            continue
        relation = next(
            value for key, value in sheet.attrib.items() if key.endswith("}id") or key == "id"
        )
        target = targets[relation]
        return target if target.startswith("xl/") else f"xl/{target}"
    return None


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def main() -> None:
    data_root = Path(os.environ["FORGE_PRICE_DATA"])
    zones_path = Path(__file__).resolve().parents[1] / "app" / "data" / "price_zones.csv"
    replace_archive(data_root, zones_path)


if __name__ == "__main__":
    main()
