from app.corridor import SLICE_FROM, wetland_filter_sql
from app.terrain_rules import load_classification


def test_filter_keeps_a_code_only_when_every_part_matches():
    sql = wetland_filter_sql(load_classification().wetland)
    assert "LIKE 'PEM%'" in sql
    assert "LIKE 'E2EM%'" in sql
    assert "regexp_split_to_table" in sql
    assert "position('/'" not in sql


def test_slice_sql_partitions_with_bisector_blades():
    assert "ST_Buffer" in SLICE_FROM
    assert "ST_Split" in SLICE_FROM
    assert "endcap=flat join=mitre" in SLICE_FROM
    assert "/ 30.0" in SLICE_FROM
