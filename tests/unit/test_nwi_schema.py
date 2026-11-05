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
    repair = (ROOT / "scripts" / "nwi_repair.sql").read_text()
    clip = (ROOT / "scripts" / "nwi_clip.sql").read_text()
    finish = (ROOT / "scripts" / "nwi_finish.sql").read_text()
    assert "ref.nwi_wetlands" in schema
    assert "ref.nwi_provenance" in schema
    assert "release_label" in schema
    assert "downloaded_on" in schema
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
    assert "nwi_repair.sql" in loop
    assert "nwi_clip.sql" in loop
    assert "nwi_finish.sql" in loop
    assert "--single-transaction" in loop
    assert "TRUNCATE" not in loop
    assert "max_parallel_workers_per_gather = 4" in loop
    after_loop = script.split("\ndone", 1)[1]
    assert "INSERT INTO ref.nwi_provenance" not in after_loop
    assert repair.count("ST_MakeValid") == 1
    assert "method=structure" in repair
    assert "CREATE UNLOGGED TABLE ref.nwi_fixed" in repair
    assert "TRUNCATE" not in repair
    assert clip.count("ST_Intersection") == 1
    assert "ST_Intersects" in clip
    assert "ref.counties_tiger" in clip
    assert "ref.nwi_fixed" in clip
    assert "ST_MakeValid" not in clip
    assert "TRUNCATE" not in clip
    assert "Texas clip inserted no polygons" in finish
    assert (
        "INSERT INTO ref.nwi_provenance (state, release_label, downloaded_on)"
        in finish
    )
    assert "TRUNCATE" not in finish
