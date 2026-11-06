"""The PAD-US grant is schema usage plus one table SELECT."""

from pathlib import Path


def test_padus_grant_is_usage_and_select_on_the_gap_table_only():
    text = Path("scripts/padus_grant.sql").read_text().strip()
    assert text == (
        "GRANT USAGE ON SCHEMA habitat TO forge_api;\n"
        "GRANT SELECT ON habitat.padus_gap123 TO forge_api;"
    )
    assert "padus_sub" not in text
    assert "critical_habitat" not in text
    assert "ch_5070" not in text
    assert "ch_sub" not in text
    assert "DROP" not in text.upper()
    assert "CREATE" not in text.upper()
