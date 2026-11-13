import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "app/data/price_zones.csv"
SQL = ROOT / "supabase/migrations/20261113150000_price_archive.sql"

def test_price_zones_csv_matches_the_partition():
    with CSV.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 55
    by_iso: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        by_iso.setdefault(row["iso"], []).append(row)
        assert row["polygon_source"] == "rto_subzones"
        assert row["polygon_rto_iso"] == row["iso"]
        assert row["iso"] != "ISO-NE"
    assert set(by_iso) == {"CAISO", "ISONE", "NYISO", "MISO", "PJM"}
    assert {r["zone"] for r in by_iso["CAISO"]} == {"PGE", "SCE", "SDGE", "VEA"}
    sce = next(r for r in by_iso["CAISO"] if r["zone"] == "SCE")
    assert sce["polygon_loc_abbrev"] == "SCE"
    assert sce["price_location"] == "DLAP_SCE-APND"
    assert sce["load_location"] == "SCE-TAC"
    nema = next(r for r in by_iso["ISONE"] if r["zone"] == ".Z.NEMASSBOST")
    assert nema["polygon_loc_abbrev"] == "NE MA"
    assert nema["load_location"] == "NEMA"
    nyc = next(r for r in by_iso["NYISO"] if r["zone"] == "N.Y.C.")
    assert nyc["polygon_loc_abbrev"] == "NYC"
    assert nyc["price_location"] == "N.Y.C."
    priced = [r["zone"] for r in by_iso["MISO"] if r["price_location"]]
    assert priced == ["LRZ1", "LRZ4", "LRZ6", "LRZ7", "LRZ8", "LRZ9"]
    lrz9 = next(r for r in by_iso["MISO"] if r["zone"] == "LRZ9")
    assert lrz9["price_location"] == "LOUISIANA.HUB"
    assert lrz9["load_location"] == "LRZ8_9_10"
    for zone in ("LRZ2", "LRZ3", "LRZ5", "LRZ10"):
        row = next(r for r in by_iso["MISO"] if r["zone"] == zone)
        assert row["price_location"] == ""
    assert all(r["price_location"] == "" and r["load_location"] == "" for r in by_iso["PJM"])
    assert len(by_iso["PJM"]) == 22
    text = "\n".join(r["price_location"] for r in rows)
    assert "MS.HUB" not in text
    assert "TEXAS.HUB" not in text
    sql = SQL.read_text()
    for name in (
        "ref.price_zone",
        "ref.da_price_hourly",
        "ref.load_hourly",
        "ref.market_pair",
        "ref.zone_energy_value",
        "ref.price_archive_release",
    ):
        assert f"CREATE TABLE {name}" in sql
    assert "GRANT SELECT" in sql
    assert "forge_api" in sql
    assert "ENABLE ROW LEVEL SECURITY" not in sql
    assert "INSERT INTO ref.price_zone" not in sql
    assert "numeric" in sql
    assert "to_regclass('ref.rto_subzones')" in sql
