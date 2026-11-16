"""Acceptance gates for the 2025 price-archive loader."""

import ast
import csv
import os
import zipfile
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import pytest

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "app" / "data" / "price_zones.csv"
MODULE_PATH = ROOT / "scripts" / "load_price_archive.py"

HUBS = [
    "MINN.HUB",
    "ILLINOIS.HUB",
    "INDIANA.HUB",
    "MICHIGAN.HUB",
    "ARKANSAS.HUB",
    "LOUISIANA.HUB",
]
_EASTERN = ZoneInfo("America/New_York")
_UTC = UTC


def _loader():
    from scripts import load_price_archive as loader

    return loader


def _zero_row(loader, iso: str, location: str, hour: datetime):
    return loader.PriceRow(
        iso,
        location,
        hour,
        Decimal(0),
        Decimal(0),
        Decimal(0),
        Decimal(0),
        False,
    )


def test_acceptance_loader_gates_8760_and_iso_counts():
    loader = _loader()
    caiso_hours = loader.expected_hours("CAISO")
    nyiso_hours = loader.expected_hours("NYISO")
    assert len(caiso_hours) == 8760
    assert len(nyiso_hours) == 8760
    assert len(set(caiso_hours)) == 8760
    assert len(set(nyiso_hours)) == 8760
    rows = []
    for location in ("DLAP_PGAE-APND", "DLAP_SCE-APND"):
        rows.extend(_zero_row(loader, "CAISO", location, hour) for hour in caiso_hours)
    for location in ("WEST", "N.Y.C."):
        rows.extend(_zero_row(loader, "NYISO", location, hour) for hour in nyiso_hours)
    loader.gate_hours(rows)

    zones = loader.load_zones(CSV_PATH)
    priced = [zone for zone in zones if zone.price_location is not None]
    counts: dict[str, int] = defaultdict(int)
    for zone in priced:
        counts[zone.iso] += 1
    assert counts["CAISO"] == 4
    assert counts["ISONE"] == 8
    assert counts["NYISO"] == 11
    assert counts["MISO"] == 6
    assert counts["SPP"] == 17
    spp_prices = {
        zone.zone: zone.price_location
        for zone in zones
        if zone.iso == "SPP"
    }
    assert spp_prices["OKGE"] == "OKGE_OKGE"
    assert spp_prices["CSWS"] == "AEPM_CSWS"
    assert spp_prices["WAUE"] == "WAUE_UGPM"
    assert spp_prices["WR"] == "WR_WR"
    hubs = [zone.price_location for zone in zones if zone.iso == "MISO" and zone.price_location]
    assert hubs == HUBS


def test_acceptance_real_tree_does_not_open_database(monkeypatch):
    data_root = os.environ.get("FORGE_PRICE_DATA")
    if not data_root:
        pytest.skip("FORGE_PRICE_DATA is unset")
    loader = _loader()
    import asyncpg

    def _refuse_connection(*_args, **_kwargs):
        raise AssertionError("database opened")

    monkeypatch.setattr(asyncpg, "connect", _refuse_connection)
    # FORGE_PRICE_DATA is a copy of /srv/forge/gis-data, not the live tree.
    loader.check_tree(Path(data_root))


def test_missing_load_series_rejects_before_connection(monkeypatch, tmp_path):
    loader = _loader()
    zones_path = tmp_path / "zones.csv"
    zones_path.write_text(
        "iso,zone,polygon_source,polygon_rto_iso,polygon_loc_type,"
        "polygon_loc_abbrev,price_location,load_location\n"
        "MISO,LRZ3,rto_subzones,MISO,REG,LRZ3,,LRZ3_5\n",
        encoding="utf-8",
    )
    data_root = tmp_path / "data"
    data_root.mkdir()
    monkeypatch.setattr(loader, "check_tree", lambda _root: {})
    monkeypatch.setattr(loader, "read_prices", lambda _root, _zones: [])
    monkeypatch.setattr(loader, "read_loads", lambda _root, _zones: [])
    monkeypatch.setenv("FORGE_LOADER_DATABASE_URL", "postgresql://refused")

    import asyncpg

    def _refuse_connection(*_args, **_kwargs):
        raise AssertionError("database opened")

    monkeypatch.setattr(asyncpg, "connect", _refuse_connection)
    with pytest.raises(loader.ArchiveRejected) as rejected:
        loader.replace_archive(data_root, zones_path)
    assert rejected.value.location == "LRZ3_5"
    assert len(rejected.value.hours) == 8760


def _nyiso_rows(loader, hour: datetime, energies: list[Decimal], congestions: list[Decimal]):
    names = ("WEST", "GENESE", "CENTRL")
    rows = []
    for name, energy, congestion in zip(names, energies, congestions, strict=True):
        loss = Decimal(1)
        rows.append(
            loader.PriceRow(
                "NYISO",
                name,
                hour,
                energy + congestion + loss,
                energy,
                congestion,
                loss,
                True,
            )
        )
    return rows


def test_acceptance_equal_energy_and_flipped_nyiso_sign():
    loader = _loader()
    hour = loader.expected_hours("NYISO")[0]
    published = Decimal(5)
    stored = -published
    rows = _nyiso_rows(
        loader,
        hour,
        [Decimal(44), Decimal(44), Decimal(44)],
        [stored, stored, stored],
    )
    assert max(row.energy for row in rows) - min(row.energy for row in rows) == Decimal(0)
    loader.gate_equal_energy(rows)

    flipped = list(rows)
    victim = flipped[2]
    publisher_congestion = -victim.congestion
    flipped_energy = victim.lmp - publisher_congestion - victim.loss
    flipped[2] = loader.PriceRow(
        victim.iso,
        victim.price_location,
        victim.hour_utc,
        victim.lmp,
        flipped_energy,
        publisher_congestion,
        victim.loss,
        True,
    )
    with pytest.raises(loader.ArchiveRejected) as rejected:
        loader.gate_equal_energy(flipped)
    assert "NYISO" in f"{rejected.value.file} {rejected.value.location}"
    assert any(hour.isoformat() in item for item in rejected.value.hours)

    close = _nyiso_rows(
        loader,
        hour,
        [Decimal(10), Decimal(10), Decimal("10.02")],
        [Decimal(0), Decimal(0), Decimal(0)],
    )
    loader.gate_equal_energy(close)
    wide = _nyiso_rows(
        loader,
        hour,
        [Decimal(10), Decimal(10), Decimal("10.03")],
        [Decimal(0), Decimal(0), Decimal(0)],
    )
    with pytest.raises(loader.ArchiveRejected):
        loader.gate_equal_energy(wide)


def _pair_rows(loader, iso: str, location: str, hours: list[datetime], congestion: list[Decimal]):
    rows = []
    for hour, value in zip(hours, congestion, strict=True):
        rows.append(
            loader.PriceRow(
                iso,
                location,
                hour,
                value,
                Decimal(0),
                value,
                Decimal(0),
                False,
            )
        )
    return rows


def _pair_map(pairs):
    return {(pair.zone_snd, pair.zone_rcv): pair for pair in pairs}


def test_acceptance_pair_symmetry_and_same_zone_zeros():
    loader = _loader()
    hours = [
        datetime(2025, 1, 1, 5, tzinfo=_UTC),
        datetime(2025, 1, 1, 6, tzinfo=_UTC),
        datetime(2025, 1, 1, 7, tzinfo=_UTC),
    ]
    zones = [
        loader.Zone("NYISO", "A", "A", "A"),
        loader.Zone("NYISO", "B", "B", "B"),
    ]
    prices = _pair_rows(
        loader,
        "NYISO",
        "A",
        hours,
        [Decimal(0), Decimal("1.5"), Decimal("-0.165")],
    )
    prices.extend(
        _pair_rows(
            loader,
            "NYISO",
            "B",
            hours,
            [Decimal(0), Decimal("-1.5"), Decimal("-0.165")],
        )
    )
    found = _pair_map(loader.market_pairs(zones, prices))
    forward = found[("A", "B")]
    reverse = found[("B", "A")]
    same = found[("A", "A")]
    assert forward.spread_per_mwh == reverse.spread_per_mwh
    assert forward.hours_fwd == reverse.hours_rev
    assert forward.hours_fwd + forward.hours_rev <= 3
    assert forward.spread_per_mwh == Decimal(3) / Decimal(8760)
    assert same.spread_per_mwh == Decimal(0)
    assert same.hours_fwd == 0
    assert same.hours_rev == 0

    full_hours = loader.expected_hours("NYISO")
    assert len(full_hours) == 8760
    full_zones = [
        loader.Zone("NYISO", "WEST", "WEST", "WEST"),
        loader.Zone("NYISO", "N.Y.C.", "N.Y.C.", "N.Y.C."),
    ]
    full_prices = _pair_rows(loader, "NYISO", "WEST", full_hours, [Decimal(1)] * 8760)
    full_prices.extend(
        _pair_rows(loader, "NYISO", "N.Y.C.", full_hours, [Decimal(0)] * 8760)
    )
    full = _pair_map(loader.market_pairs(full_zones, full_prices))
    year = full[("WEST", "N.Y.C.")]
    assert year.spread_per_mwh == Decimal(8760) / Decimal(8760)

    source = MODULE_PATH.read_text()
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Name) and func.id == "round":
            raise AssertionError(func.id)
        if isinstance(func, ast.Attribute) and func.attr in {"round", "quantize"}:
            raise AssertionError(func.attr)


def test_acceptance_spread_matches_independent_sum():
    root = os.environ.get("FORGE_PRICE_DATA")
    if not root:
        pytest.skip("FORGE_PRICE_DATA is unset")
    loader = _loader()
    data_root = Path(root)
    zones = loader.load_zones(CSV_PATH)
    prices = loader.read_prices(data_root, zones)
    pairs = _pair_map(loader.market_pairs(zones, prices))
    measured = pairs[("WEST", "N.Y.C.")]
    nyc: dict[datetime, Decimal] = {}
    west: dict[datetime, Decimal] = {}
    for hour, name, published in _independent_nyiso_congestion(data_root):
        stored = -published
        if name == "N.Y.C.":
            nyc[hour] = stored
        elif name == "WEST":
            west[hour] = stored
    total = Decimal(0)
    hours_fwd = 0
    hours_rev = 0
    for hour, congestion_nyc in nyc.items():
        congestion_west = west[hour]
        total += abs(congestion_nyc - congestion_west)
        if congestion_nyc > congestion_west:
            hours_fwd += 1
        elif congestion_west > congestion_nyc:
            hours_rev += 1
    spread = total / Decimal(8760)
    assert abs(measured.spread_per_mwh - spread) < Decimal("1e-9")
    assert measured.hours_fwd == hours_fwd
    assert measured.hours_rev == hours_rev


def test_acceptance_energy_value_matches_load_weighted_mean():
    root = os.environ.get("FORGE_PRICE_DATA")
    if not root:
        pytest.skip("FORGE_PRICE_DATA is unset")
    loader = _loader()
    data_root = Path(root)
    zones = loader.load_zones(CSV_PATH)
    prices = loader.read_prices(data_root, zones)
    loads = loader.read_loads(data_root, zones)
    values = {
        (item.iso, item.zone): item.energy_value_per_mwh
        for item in loader.zone_energy_values(zones, prices, loads)
    }
    energy = _independent_isone_energy(data_root / "lmp-da" / "2025" / "ISO-NE" / "raw")
    load = _independent_nema_load(data_root / "load-hourly" / "2025" / "ISO-NE" / "raw")
    numer = Decimal(0)
    denom = Decimal(0)
    for hour, megawatts in load.items():
        numer += megawatts * energy[hour]
        denom += megawatts
    assert abs(values[("ISONE", ".Z.NEMASSBOST")] - (numer / denom)) < Decimal("1e-9")


def _independent_nyiso_congestion(root: Path):
    raw = root / "lmp-da" / "2025" / "NYISO" / "raw"
    seen: dict[tuple[str, str], int] = defaultdict(int)
    for path in sorted(raw.iterdir()):
        if path.name == "nyiso_dam_lbmp_zone_2025.csv":
            continue
        members = _csv_members(path)
        for _name, text in members:
            reader = csv.DictReader(text.splitlines())
            for record in reader:
                name = (record.get("Name") or "").strip()
                if name not in {"WEST", "N.Y.C."}:
                    continue
                stamp = (record.get("Time Stamp") or "").strip()
                key = (name, stamp)
                occurrence = seen[key]
                seen[key] += 1
                published = Decimal(record["Marginal Cost Congestion ($/MWHr)"].strip())
                yield _nyiso_hour(stamp, occurrence), name, published


def _nyiso_hour(stamp: str, occurrence: int) -> datetime:
    date_text, time_text = stamp.split()
    month_text, day_text, year_text = date_text.split("/")
    hour_text, minute_text = time_text.split(":")[:2]
    day = date(int(year_text), int(month_text), int(day_text))
    hour = int(hour_text)
    minute = int(minute_text)
    if day == date(2025, 11, 2) and hour == 1 and minute == 0:
        offset = timezone(timedelta(hours=-4 if occurrence == 0 else -5))
    else:
        offset = _EASTERN
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=offset).astimezone(
        _UTC
    )


def _csv_members(path: Path):
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist():
                if info.is_dir() or not info.filename.lower().endswith(".csv"):
                    continue
                yield info.filename, archive.read(info).decode("utf-8-sig")
        return
    if path.suffix.lower() == ".csv":
        yield path.name, path.read_text(encoding="utf-8-sig")


def _independent_isone_energy(raw: Path) -> dict[datetime, Decimal]:
    energy: dict[datetime, Decimal] = {}
    for path in sorted(raw.iterdir()):
        if path.suffix.lower() != ".csv":
            continue
        with path.open(newline="", encoding="utf-8-sig") as handle:
            for record in csv.DictReader(handle):
                location = (record.get("Location") or record.get("Location Name") or "").strip()
                if location != ".Z.NEMASSBOST":
                    continue
                hour = datetime.fromisoformat(record["Interval Start"].strip()).astimezone(_UTC)
                text = record.get("Energy") or record["Energy Component"]
                energy[hour] = Decimal(text.strip())
    return energy


def _independent_nema_load(raw: Path) -> dict[datetime, Decimal]:
    workbook = next(path for path in raw.iterdir() if path.suffix.lower() == ".xlsx")
    sheet = _sheet_rows(workbook, "NEMA")
    header_index = next(
        index
        for index, row in enumerate(sheet)
        if "Hr_End" in row.values() and "RT_Demand" in row.values()
    )
    header = {name: column for column, name in sheet[header_index].items()}
    load: dict[datetime, Decimal] = {}
    for row in sheet[header_index + 1 :]:
        if header["Date"] not in row or header["Hr_End"] not in row:
            continue
        day = _excel_day(row[header["Date"]])
        token = _hr_token(row[header["Hr_End"]])
        if header["RT_Demand"] not in row or row[header["RT_Demand"]] == "":
            continue
        load[_isone_start(day, token)] = Decimal(row[header["RT_Demand"]])
    return load


def _excel_day(text: str) -> date:
    if "/" in text:
        month_text, day_text, year_text = text.split()[0].split("/")
        return date(int(year_text), int(month_text), int(day_text))
    if "-" in text and not text.replace(".", "", 1).isdigit():
        year_text, month_text, day_text = text.split()[0].split("T")[0].split("-")
        return date(int(year_text), int(month_text), int(day_text))
    serial = int(Decimal(text))
    return date(1899, 12, 30) + timedelta(days=serial)


def _hr_token(text: str) -> str:
    cleaned = text.strip()
    if cleaned.upper().endswith("X"):
        return "02X"
    return f"{int(Decimal(cleaned)):02d}"


def _isone_start(day: date, token: str) -> datetime:
    if day == date(2025, 11, 2) and token == "02":
        return datetime(2025, 11, 2, 1, tzinfo=timezone(timedelta(hours=-4))).astimezone(_UTC)
    if day == date(2025, 11, 2) and token == "02X":
        return datetime(2025, 11, 2, 1, tzinfo=timezone(timedelta(hours=-5))).astimezone(_UTC)
    if day == date(2025, 3, 9) and token == "03":
        return datetime(2025, 3, 9, 1, tzinfo=timezone(timedelta(hours=-5))).astimezone(_UTC)
    local = datetime(day.year, day.month, day.day, int(token) - 1, tzinfo=_EASTERN)
    return local.astimezone(_UTC)


def _sheet_rows(path: Path, sheet_name: str) -> list[dict[int, str]]:
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(path) as archive:
        shared = _shared_strings(archive, ns)
        target = _sheet_target(archive, ns, sheet_name)
        root = ElementTree.fromstring(archive.read(target))
    rows: list[dict[int, str]] = []
    for row in root.iter(f"{ns}row"):
        values: dict[int, str] = {}
        for cell in row.findall(f"{ns}c"):
            ref = cell.attrib.get("r", "A1")
            letters = "".join(ch for ch in ref if ch.isalpha())
            index = 0
            for ch in letters:
                index = index * 26 + (ord(ch) - 64)
            node = cell.find(f"{ns}v")
            if node is None or node.text is None:
                continue
            text = shared[int(node.text)] if cell.attrib.get("t") == "s" else node.text
            values[index] = text
        rows.append(values)
    return rows


def _shared_strings(archive: zipfile.ZipFile, ns: str) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall(f"{ns}si"):
        values.append("".join(node.text or "" for node in item.iter(f"{ns}t")))
    return values


def _sheet_target(archive: zipfile.ZipFile, ns: str, sheet_name: str) -> str:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_ns = "{http://schemas.openxmlformats.org/package/2006/relationships}"
    targets = {
        node.attrib["Id"]: node.attrib["Target"]
        for node in rels.findall(f"{rel_ns}Relationship")
    }
    office = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    for sheet in workbook.findall(f"{ns}sheets/{ns}sheet"):
        if sheet.attrib.get("name") != sheet_name:
            continue
        target = targets[sheet.attrib[f"{office}id"]]
        return target if target.startswith("xl/") else f"xl/{target}"
    raise AssertionError(sheet_name)


def test_bare_sha_line_takes_name_from_list_item_above():
    loader = _loader()
    csv_hash = "d" * 64
    zip_hash = "a" * 64
    text = (
        "## Files\n"
        "\n"
        "- `raw/series_2025.csv`\n"
        "- bytes: 100\n"
        "- SHA-256: " + csv_hash + "\n"
        "\n"
        "Files, bytes, and SHA-256:\n"
        "\n"
        "- `raw/month01.zip` — 10 bytes — `" + zip_hash + "`\n"
    )
    found = loader._hash_lines(text, ["month01.zip", "series_2025.csv"])
    assert found == {"series_2025.csv": csv_hash, "month01.zip": zip_hash}


def test_bare_sha_line_after_blank_line_names_nothing():
    loader = _loader()
    text = "- `raw/a.csv`\n\n- SHA-256: " + "e" * 64 + "\n"
    assert loader._hash_lines(text, ["a.csv", "b.zip"]) == {}


def test_single_file_bare_sha_list_item():
    loader = _loader()
    digest = "2" * 64
    text = "- Download date: 2026-11-09\n- SHA-256: " + digest + "\n- Account: none\n"
    assert loader._hash_lines(text, ["2025_smd_hourly.xlsx"]) == {
        "2025_smd_hourly.xlsx": digest
    }


def test_bold_sha_line_takes_name_from_source_url_above():
    loader = _loader()
    first = "5" * 64
    second = "6" * 64
    text = (
        "- **Source URL:** https://example.org/reports/20251231_dfal_HIST.xls\n"
        "- **SHA-256:** " + first + "\n"
        "- **Bytes:** 6706688\n"
        "\n"
        "Method mentions 202512_dfal_HIST_xls.zip, which is not a raw file.\n"
        "\n"
        "- **Source URL:** https://example.org/reports/20260101_df_al.xls\n"
        "- **SHA-256:** " + second + "\n"
    )
    found = loader._hash_lines(text, ["20251231_dfal_HIST.xls", "20260101_df_al.xls"])
    assert found == {"20251231_dfal_HIST.xls": first, "20260101_df_al.xls": second}


def test_xl_date_skips_label_and_disclaimer_text():
    import xlrd

    loader = _loader()

    class Cell:
        def __init__(self, ctype, value):
            self.ctype = ctype
            self.value = value

    text = xlrd.XL_CELL_TEXT
    assert loader._xl_date(None, Cell(text, "December 31, 2025")) is None
    assert loader._xl_date(None, Cell(text, "MISO MAKES NO REPRESENTATIONS")) is None
    assert loader._xl_date(None, Cell(text, "12/31/2025")) == date(2025, 12, 31)
    assert loader._xl_date(None, Cell(text, "2025-01-02")) == date(2025, 1, 2)
    assert loader._xl_date(None, Cell(text, "45658")) == date(2025, 1, 1)


def test_miso_wide_csv_takes_day_from_market_day_column():
    loader = _loader()
    hours = ",".join(f'"HE{n}"' for n in range(1, 25))
    values = ",".join(['"1"'] * 24)
    text = (
        f'"MARKET_DAY","NODE","TYPE","VALUE",{hours}\n'
        f'"1/1/2025","MINN.HUB","Hub","LMP",{values.replace("1", "30")}\n'
        f'"1/1/2025","MINN.HUB","Hub","MCC",{values.replace("1", "2")}\n'
        f'"1/1/2025","MINN.HUB","Hub","MLC",{values}\n'
        f'"1/1/2025","OTHER","Hub","LMP",{values}\n'
    )
    grouped = defaultdict(dict)
    loader._consume_miso_price("DA.csv", text, {"MINN.HUB"}, grouped)
    assert len(grouped) == 24
    first = grouped[("MINN.HUB", datetime(2025, 1, 1, 5, tzinfo=_UTC))]
    assert first == {"lmp": Decimal(30), "mcc": Decimal(2), "mlc": Decimal(1)}


def test_missing_price_series_is_named_by_hour_gate():
    loader = _loader()
    zones = loader.load_zones(CSV_PATH)
    required = loader._required_price_keys(zones)
    assert ("MISO", "MINN.HUB") in required
    with pytest.raises(loader.ArchiveRejected) as caught:
        loader.gate_hours([], required)
    assert caught.value.location


def test_spp_expected_hours_are_the_central_window():
    loader = _loader()
    hours = loader.expected_hours("SPP")
    assert len(hours) == 8760
    assert len(set(hours)) == 8760
    assert hours[0] == datetime(2025, 1, 1, 6, tzinfo=UTC)
    assert hours[-1] == datetime(2026, 1, 1, 5, tzinfo=UTC)
    assert loader.expected_hours("CAISO")[0] == datetime(2025, 1, 1, 8, tzinfo=UTC)
    assert loader.expected_hours("MISO")[0] == datetime(2025, 1, 1, 5, tzinfo=UTC)


def test_spp_settlement_location_uses_published_mec(tmp_path):
    loader = _loader()
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "DA-LMP-SL-202506150100.csv").write_text(
        "Interval,GMTIntervalEnd,Settlement Location,Pnode,LMP,MLC,MCC,MEC\n"
        "06/15/2025 01:00:00,06/15/2025 06:00:00,OKGE_OKGE,OKGE_LA,12.8450,-0.2079,-0.7031,13.7560\n"
        "06/15/2025 01:00:00,06/15/2025 06:00:00,WR_WR,WR_LA,8.0262,-0.6665,-5.0633,13.7560\n"
        "06/15/2025 01:00:00,06/15/2025 06:00:00,AEPM_CSWS,CSWS_LA,18.9322,0.1620,5.0143,13.7559\n"
        "06/15/2025 01:00:00,06/15/2025 06:00:00,WAUE_UGPM,WAUE_UGPM_LA,11.3786,0.3356,-2.7129,13.7559\n"
        "06/15/2025 01:00:00,06/15/2025 06:00:00,SPPNORTH_HUB,SPPNORTH_H,20,0,0,20\n",
        encoding="utf-8",
    )
    (raw / "spp_da_lmp_hourly_hub_2025.csv").write_text(
        "Time,Interval Start,Location,LMP,Energy,Congestion,Loss\n"
        "2025-01-01 00:00:00-06:00,2025-01-01 00:00:00-06:00,SPPNORTH_HUB,1,1,0,0\n",
        encoding="utf-8",
    )
    keep = {"OKGE_OKGE", "WR_WR", "AEPM_CSWS", "WAUE_UGPM"}
    rows = loader._spp_prices(raw, keep)
    by_location = {row.price_location: row for row in rows}
    assert set(by_location) == keep
    okge = by_location["OKGE_OKGE"]
    assert okge.iso == "SPP"
    assert okge.energy_derived is False
    assert okge.hour_utc == datetime(2025, 6, 15, 5, tzinfo=UTC)
    assert okge.lmp == Decimal("12.8450")
    assert okge.energy == Decimal("13.7560")
    assert okge.congestion == Decimal("-0.7031")
    assert okge.loss == Decimal("-0.2079")
    assert abs(okge.lmp - (okge.energy + okge.congestion + okge.loss)) <= Decimal("0.01")
    loader.gate_identity(rows)
    loader.gate_equal_energy(rows)


def test_spp_fixture_passes_identity_and_8760():
    loader = _loader()
    hours = loader.expected_hours("SPP")
    rows = []
    for location in ("OKGE_OKGE", "WR_WR"):
        for hour in hours:
            rows.append(
                loader.PriceRow(
                    "SPP",
                    location,
                    hour,
                    Decimal("30.00"),
                    Decimal("28.00"),
                    Decimal("1.50"),
                    Decimal("0.50"),
                    False,
                )
            )
    loader.gate_hours(rows, (("SPP", "OKGE_OKGE"), ("SPP", "WR_WR")))
    loader.gate_identity(rows)
    loader.gate_equal_energy(rows)
    assert all(row.energy_derived is False for row in rows)


def test_spp_blank_load_cell_is_omitted(tmp_path):
    loader = _loader()
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "DAILY_HOURLY_LOAD-2025.csv").write_text(
        "MarketHour, CSWS, OKGE, WR\n"
        "01/01/2025 07:00:00,4944.996,2100.5,1800\n"
        "01/23/2025 02:00:00,, ,171.377\n",
        encoding="utf-8",
    )
    rows = loader._spp_loads(raw, {"CSWS", "OKGE", "WR"})
    assert rows
    assert all(row.load_mw != Decimal(0) for row in rows)
    present = {(row.load_location, row.hour_utc) for row in rows}
    start = datetime(2025, 1, 1, 6, tzinfo=UTC)
    blank = datetime(2025, 1, 23, 1, tzinfo=UTC)
    assert ("CSWS", start) in present
    assert ("OKGE", start) in present
    assert ("WR", start) in present
    assert ("CSWS", blank) not in present
    assert ("OKGE", blank) not in present
    assert ("WR", blank) in present
    assert next(row for row in rows if row.load_location == "WR" and row.hour_utc == blank).load_mw == Decimal("171.377")


def test_spp_load_gate_allows_only_the_named_blank_hour():
    loader = _loader()
    hours = loader.expected_hours("SPP")
    gap = datetime(2025, 1, 23, 1, tzinfo=UTC)
    assert gap == loader._SPP_LOAD_GAP
    okge = [
        loader.LoadRow("SPP", "OKGE", hour, Decimal("1"))
        for hour in hours
        if hour != gap
    ]
    loader.gate_hours(okge, (("SPP", "OKGE"),))
    other = next(hour for hour in hours if hour != gap)
    short = [row for row in okge if row.hour_utc != other]
    with pytest.raises(loader.ArchiveRejected) as rejected:
        loader.gate_hours(short, (("SPP", "OKGE"),))
    assert gap.isoformat() in rejected.value.hours
    assert other.isoformat() in rejected.value.hours
    nppd = [
        loader.LoadRow("SPP", "NPPD", hour, Decimal("1"))
        for hour in hours
        if hour != gap
    ]
    with pytest.raises(loader.ArchiveRejected):
        loader.gate_hours(nppd, (("SPP", "NPPD"),))
    prices = [
        loader.PriceRow(
            "SPP",
            "OKGE_OKGE",
            hour,
            Decimal("1"),
            Decimal("1"),
            Decimal("0"),
            Decimal("0"),
            False,
        )
        for hour in hours
        if hour != gap
    ]
    with pytest.raises(loader.ArchiveRejected):
        loader.gate_hours(prices, (("SPP", "OKGE_OKGE"),))
