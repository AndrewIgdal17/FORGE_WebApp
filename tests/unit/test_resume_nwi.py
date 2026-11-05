import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_resume_script_never_truncates_and_reuses_texas_staging():
    script = (ROOT / "scripts" / "resume_nwi.sh").read_text()
    assert "TRUNCATE" not in script
    assert "DROP TABLE ref.nwi_wetlands" not in script
    assert "nwi_schema.sql" not in script
    assert "load_nwi.sh" not in script
    assert "nwi_repair.sql" in script
    assert "nwi_parallel.sql" in script
    assert "nwi_county.sql" in script
    assert "nwi_clip.sql" in script
    assert "nwi_insert.sql" in script
    assert "nwi_finish.sql" in script
    assert "ANALYZE ref.nwi_county" in script
    assert '[[ "$state" == "TX" && "$gate" == "bad" ]]' in script
    assert "clip plan has no Gather; refusing to run" in script
    assert "ref.nwi_fixed was kept" in script
    assert "objectid = 864514" in script
    assert script.count("ST_MakeValid") == 1
    assert "_geodatabase_wetlands.zip" in script
    assert "existing staging is only valid for TX" in script
    assert "NWI_SKIP_REPAIR applies to one state" in script


def test_existing_staging_flag_rejects_a_non_texas_list():
    env = os.environ.copy()
    env["NWI_STATES"] = "UT"
    env["NWI_USE_EXISTING_STAGING"] = "1"
    env.pop("DATABASE_URL", None)
    result = subprocess.run(
        ["bash", "scripts/resume_nwi.sh"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert "existing staging is only valid for TX" in result.stderr


FINISHED = (
    "AL AR AZ CA CO CT DC DE FL GA IA ID IL IN KS KY LA MA MD ME "
    "MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN"
).split()


def test_provenance_migration_records_finished_states_only():
    sql = (ROOT / "scripts" / "nwi_provenance_migrate.sql").read_text()
    assert len(FINISHED) == 41
    for code in FINISHED:
        assert f"('{code}')" in sql
    for code in ("TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"):
        assert f"('{code}')" not in sql
    assert "BEGIN;" in sql
    assert "COMMIT;" in sql
    assert "WHERE p.id = 1" in sql
    assert "DROP TABLE ref.nwi_provenance;" in sql
    assert "ALTER TABLE ref.nwi_provenance_state RENAME TO nwi_provenance;" in sql
    assert "GRANT SELECT ON ref.nwi_provenance TO forge_api;" in sql
    assert "TRUNCATE" not in sql
    assert "DELETE FROM ref.nwi_wetlands" not in sql
    assert "DROP TABLE ref.nwi_wetlands" not in sql
    assert "ref.nwi_provenance has no id column; refusing to migrate" in sql
    assert "ref.nwi_wetlands has a state outside the finished load" in sql
