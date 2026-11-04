from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_nwi_schema_records_provenance_and_clips_to_counties():
    schema = (ROOT / "scripts" / "nwi_schema.sql").read_text()
    script = (ROOT / "scripts" / "load_nwi.sh").read_text()
    assert "ref.nwi_wetlands" in schema
    assert "ref.nwi_provenance" in schema
    assert "release_label" in schema
    assert "downloaded_on" in schema
    assert "ST_Intersection" in script
    assert "ref.counties_tiger" in script
    assert "NWI_RELEASE" in script
    assert "NWI_DOWNLOADED_ON" in script
    assert "ATTRIBUTE" in script
