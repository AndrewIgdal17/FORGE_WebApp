from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _create_body(schema: str, table: str) -> str:
    qualified = f"CREATE TABLE IF NOT EXISTS {table}"
    plain = f"CREATE TABLE {table}"
    marker = qualified if qualified in schema else plain
    assert marker in schema, table
    return schema.split(marker, 1)[1].split(");", 1)[0]


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
    assert "GEOMETRY_NAME=geom" in script
    assert any(
        "TRUNCATE" in line and "ref.nwi_wetlands" in line
        for line in script.splitlines()
    )
    provenance = _create_body(schema, "ref.nwi_provenance")
    assert "state" in provenance
    assert "release_label" in provenance
    assert "downloaded_on" in provenance
    assert "CHECK (id = 1)" not in schema
    assert (
        "GRANT SELECT ON ref.nwi_wetlands, ref.nwi_provenance TO forge_api" in schema
    )
    loop = script.split("for zip in", 1)[1].split("\ndone", 1)[0]
    assert (
        "INSERT INTO ref.nwi_provenance (state, release_label, downloaded_on)" in loop
    )
    after_loop = script.split("\ndone", 1)[1]
    assert "INSERT INTO ref.nwi_provenance" not in after_loop
