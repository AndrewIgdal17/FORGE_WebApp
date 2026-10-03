"""Pydantic models for request/response payloads."""

from __future__ import annotations

import math
from typing import Any, Dict, Optional

from pydantic import BaseModel


def _sanitize_floats_for_json(obj: Any) -> Any:
    """Recursively convert float inf/nan to JSON-safe strings. Used by sanitize_for_json."""
    if isinstance(obj, dict):
        return {k: _sanitize_floats_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_floats_for_json(item) for item in obj]
    if isinstance(obj, float):
        if math.isinf(obj):
            return "Infinity" if obj > 0 else "-Infinity"
        if math.isnan(obj):
            return "NaN"
    return obj


def sanitize_for_json(obj: Any) -> Any:
    """Public alias for _sanitize_floats_for_json; use when serializing arbitrary dicts to JSON."""
    return _sanitize_floats_for_json(obj)


class CalculateRequest(BaseModel):
    defaults_id: str
    changes: Dict[str, Any]
    scenario_id: Optional[str] = None


class ScenarioCreate(BaseModel):
    name: str
    source: str
    defaults_id: str
    changes: Dict[str, Any]


class ScenarioUpdate(BaseModel):
    revision: int
    name: Optional[str] = None
    defaults_id: Optional[str] = None
    changes: Optional[Dict[str, Any]] = None
