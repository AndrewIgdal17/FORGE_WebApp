"""Gates for the NERC regions loader: name mapping, source hash, provenance text.

These tests do not need the parquet file or geopandas.
"""

import hashlib
import sys
from pathlib import Path

import pytest

from scripts import load_nerc_regions as loader


@pytest.mark.parametrize(
    ("name", "code"),
    [
        ("WESTERN ELECTRICITY COORDINATING COUNCIL (WECC)", "WECC"),
        ("TEXAS RELIABILITY ENTITY (TRE)", "TRE"),
        ("MIDWEST RELIABILITY ORGANIZATION (MRO)", "MRO"),
        ("SOUTHWEST POWER POOL, RE (SPP)", "MRO"),
        ("NORTHEAST POWER COORDINATING COUNCIL (NPCC)", "NPCC"),
        ("RELIABILITYFIRST CORPORATION (RFC)", "RF"),
        ("SERC RELIABILITY CORPORATION (SERC)", "SERC"),
        ("FLORIDA RELIABILITY COORDINATING COUNCIL (FRCC)", "SERC"),
    ],
)
def test_region_code_maps_every_file_name(name, code):
    assert loader.region_code(name) == code


def test_frcc_folds_into_serc():
    assert loader.region_code("FLORIDA RELIABILITY COORDINATING COUNCIL (FRCC)") == "SERC"


def test_spp_re_folds_into_mro():
    assert loader.region_code("SOUTHWEST POWER POOL, RE (SPP)") == "MRO"


def test_unknown_name_raises():
    with pytest.raises(loader.UnmappedName):
        loader.region_code("ALASKA INTERTIE (AK)")


def test_wrong_hash_is_rejected_before_any_reading(monkeypatch, tmp_path):
    payload = b"not the real parquet"
    source = tmp_path / "nerc.parquet"
    source.write_bytes(payload)
    # Make geopandas unimportable: a rejection must come before any read.
    monkeypatch.setitem(sys.modules, "geopandas", None)
    with pytest.raises(loader.SourceRejected):
        loader.verify_source(source, sha256=hashlib.sha256(b"other").hexdigest(), size=len(payload))


def test_matching_hash_and_size_pass(tmp_path):
    payload = b"fixture bytes"
    source = tmp_path / "nerc.parquet"
    source.write_bytes(payload)
    loader.verify_source(
        source,
        sha256=hashlib.sha256(payload).hexdigest(),
        size=len(payload),
    )


def test_wrong_size_is_rejected(tmp_path):
    payload = b"fixture bytes"
    source = tmp_path / "nerc.parquet"
    source.write_bytes(payload)
    with pytest.raises(loader.SourceRejected):
        loader.verify_source(
            source,
            sha256=hashlib.sha256(payload).hexdigest(),
            size=len(payload) + 1,
        )


def test_provenance_carries_hash_mapping_and_known_limit():
    text = loader.provenance_text()
    assert loader.SOURCE_SHA256 in text
    assert "FRCC" in text and "SERC" in text
    assert "SPP" in text and "MRO" in text
    assert "Western–Eastern 41" in text


def test_source_constants_match_the_brief():
    assert loader.SOURCE_SHA256 == "c22b00bee13835653362ffbf7b2404ee13022747371462ba176adc004b3f7506"
    assert loader.SOURCE_SIZE == 11_165_413
    assert Path(loader.__file__).name == "load_nerc_regions.py"


def test_main_rejects_bad_file_before_reading(monkeypatch, tmp_path):
    source = tmp_path / "x.parquet"
    source.write_bytes(b"junk")
    # The entrypoint must hash before build_shapes imports or reads anything.
    monkeypatch.setitem(sys.modules, "geopandas", None)
    with pytest.raises(loader.SourceRejected):
        loader.main(["--file", str(source), "--dry-run"])
