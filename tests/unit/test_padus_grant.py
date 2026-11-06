"""The PAD-US grant is one SELECT, on the GAP table only."""

from pathlib import Path


def test_padus_grant_is_select_on_the_gap_table_only():
    text = Path("scripts/padus_grant.sql").read_text()
    assert text.strip() == "GRANT SELECT ON habitat.padus_gap123 TO forge_api;"
    assert "padus_sub" not in text
    assert "critical_habitat" not in text
    assert "DROP" not in text.upper()
    assert "CREATE" not in text.upper()
