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
    parallel = (ROOT / "scripts" / "nwi_parallel.sql").read_text()
    county = (ROOT / "scripts" / "nwi_county.sql").read_text()
    insert_sql = (ROOT / "scripts" / "nwi_insert.sql").read_text()
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
    assert "nwi_parallel.sql" in loop
    assert "nwi_county.sql" in loop
    assert "nwi_clip.sql" in loop
    assert "nwi_insert.sql" in loop
    assert "nwi_finish.sql" in loop
    assert "ANALYZE ref.nwi_county" in loop
    assert "--single-transaction" in loop
    assert "TRUNCATE" not in loop
    after_loop = script.split("\ndone", 1)[1]
    assert "INSERT INTO ref.nwi_provenance" not in after_loop
    assert repair.count("ST_MakeValid") == 1
    assert "method=structure" in repair
    assert "CREATE UNLOGGED TABLE ref.nwi_fixed" in repair
    assert "TRUNCATE" not in repair
    assert parallel.count("max_parallel_workers_per_gather = 4") == 1
    assert "parallel_setup_cost = 0" in parallel
    assert "parallel_tuple_cost = 0" in parallel
    assert "min_parallel_table_scan_size = '8MB'" in parallel
    assert "enable_indexscan = off" in parallel
    assert "enable_bitmapscan = off" in parallel
    assert county.startswith("CREATE UNLOGGED TABLE ref.nwi_county AS")
    assert "ST_Union" in county
    assert "statefp = :'fips'" in county
    assert clip.startswith("CREATE UNLOGGED TABLE ref.nwi_clipped AS")
    assert clip.count("ST_Intersection") == 1
    assert clip.count("ST_Intersects") == 1
    assert "ref.nwi_fixed" in clip
    assert "ref.nwi_county" in clip
    assert "INSERT" not in clip
    assert "ST_MakeValid" not in clip
    assert "TRUNCATE" not in clip
    assert "INSERT INTO ref.nwi_wetlands (state, attribute, geom)" in insert_sql
    assert "FROM ref.nwi_clipped" in insert_sql
    assert insert_sql.count("ST_Intersection") == 0
    assert "Texas clip inserted no polygons" in finish
    assert (
        "INSERT INTO ref.nwi_provenance (state, release_label, downloaded_on)"
        in finish
    )
    assert "TRUNCATE" not in finish
