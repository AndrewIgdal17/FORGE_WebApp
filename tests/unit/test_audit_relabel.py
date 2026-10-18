"""Relabel stores a typed name and trains as a fourth decision class."""

from __future__ import annotations

import pytest

from app.audit import (
    _INSERT_SQL,
    _MAX_CUSTOM_NAME,
    _RELABEL_CORRIDOR_SQL,
    _RELABEL_SUBSTATION_SQL,
    _TRAINING_SQL,
    custom_name_for_decision,
)
from app.audit_models import CANONICAL_LABELS


def test_relabel_is_a_canonical_label():
    assert "relabel" in CANONICAL_LABELS
    assert "same_facility" in CANONICAL_LABELS
    assert "different_facility" in CANONICAL_LABELS


def test_relabel_keeps_the_typed_name():
    assert custom_name_for_decision("relabel", "  West Substation  ") == "West Substation"


def test_other_decisions_drop_a_typed_name():
    assert custom_name_for_decision("accept", "West Substation") is None
    assert custom_name_for_decision("keep", "West Substation") is None
    assert custom_name_for_decision("skip", "West Substation") is None


def test_relabel_rejects_a_blank_name():
    with pytest.raises(ValueError, match="real name"):
        custom_name_for_decision("relabel", "   ")
    with pytest.raises(ValueError, match="real name"):
        custom_name_for_decision("relabel", None)


def test_relabel_rejects_a_name_past_the_cap():
    with pytest.raises(ValueError, match="too long"):
        custom_name_for_decision("relabel", "A" * (_MAX_CUSTOM_NAME + 1))


def test_relabel_sql_writes_the_name_and_trains_on_the_snapshot():
    assert "custom_name" in _INSERT_SQL
    assert "SET name = $1" in _RELABEL_SUBSTATION_SQL
    assert "sub_1 = CASE WHEN $2 = 'a'" in _RELABEL_CORRIDOR_SQL
    assert "sub_2 = CASE WHEN $2 = 'b'" in _RELABEL_CORRIDOR_SQL
    assert "d.hifld_name" in _TRAINING_SQL
    assert "d.matched_name" in _TRAINING_SQL
    assert "c.sub_1" not in _TRAINING_SQL
    assert "s.name" not in _TRAINING_SQL
