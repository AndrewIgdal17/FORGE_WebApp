"""Load reference grid_mix presets for the web UI (file-backed; DB later)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Set

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
FUEL_MIX_PRESETS_FILE = BASE_DIR / "json" / "fuel_mix_presets.json"

EXPECTED_SOURCES: Set[str] = {
    "coal",
    "oil",
    "natural_gas",
    "solar",
    "wind",
    "hydro",
    "nuclear",
    "other",
}

GRID_MIX_GROUPS = ("initial", "rate_pre_cod", "rate_post_cod")


def _validate_grid_mix_group(block: Dict[str, Any], pid: str, group: str) -> bool:
    for src in EXPECTED_SOURCES:
        val = block.get(src)
        if not isinstance(val, (int, float)):
            logger.warning(
                "fuel_mix_presets: preset %r grid_mix.%s.%s invalid", pid, group, src
            )
            return False
    extras = set(block.keys()) - EXPECTED_SOURCES
    if extras:
        logger.warning(
            "fuel_mix_presets: preset %r grid_mix.%s has unknown sources %s", pid, group, extras
        )
        return False
    return True


def _validate_preset(entry: Dict[str, Any], index: int) -> bool:
    if not isinstance(entry, dict):
        logger.warning("fuel_mix_presets: preset[%s] is not an object", index)
        return False
    pid = entry.get("id")
    label = entry.get("label")
    grid_mix = entry.get("grid_mix")
    if not isinstance(pid, str) or not pid.strip():
        logger.warning("fuel_mix_presets: preset[%s] missing id", index)
        return False
    if not isinstance(label, str) or not label.strip():
        logger.warning("fuel_mix_presets: preset[%s] missing label", index)
        return False
    if not isinstance(grid_mix, dict):
        logger.warning("fuel_mix_presets: preset %r missing grid_mix object", pid)
        return False
    for group in GRID_MIX_GROUPS:
        block = grid_mix.get(group)
        if not isinstance(block, dict):
            logger.warning("fuel_mix_presets: preset %r missing grid_mix.%s object", pid, group)
            return False
        if not _validate_grid_mix_group(block, pid, group):
            return False
    extras = set(grid_mix.keys()) - set(GRID_MIX_GROUPS)
    if extras:
        logger.warning("fuel_mix_presets: preset %r grid_mix has unknown keys %s", pid, extras)
        return False
    return True


_presets_cache: Dict[str, Any] | None = None
_presets_mtime: float = 0.0


def load_fuel_mix_presets() -> Dict[str, Any]:
    """
    Return { "presets": [ ... ] } from server/json/fuel_mix_presets.json.
    Invalid entries are skipped; if the file is missing or invalid, returns { "presets": [] }.
    Cached with mtime-based invalidation.
    """
    global _presets_cache, _presets_mtime

    if not FUEL_MIX_PRESETS_FILE.is_file():
        logger.warning("fuel_mix_presets: file missing at %s", FUEL_MIX_PRESETS_FILE)
        return {"presets": []}

    current_mtime = FUEL_MIX_PRESETS_FILE.stat().st_mtime
    if _presets_cache is not None and current_mtime <= _presets_mtime:
        return _presets_cache

    try:
        raw = json.loads(FUEL_MIX_PRESETS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("fuel_mix_presets: failed to read JSON: %s", exc)
        return {"presets": []}

    if not isinstance(raw, dict):
        logger.warning("fuel_mix_presets: root must be an object")
        return {"presets": []}

    presets_list = raw.get("presets")
    if not isinstance(presets_list, list):
        logger.warning("fuel_mix_presets: presets must be an array")
        return {"presets": []}

    valid: List[Dict[str, Any]] = []
    for i, entry in enumerate(presets_list):
        if _validate_preset(entry, i):
            valid.append(entry)

    _presets_cache = {"presets": valid}
    _presets_mtime = current_mtime
    return _presets_cache
