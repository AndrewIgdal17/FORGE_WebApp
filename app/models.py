"""Pydantic models for request/response payloads."""

from __future__ import annotations

import math
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, model_serializer


def _sanitize_floats_for_json(obj: Any) -> Any:
    """Recursively convert float inf/nan to JSON-safe strings. Used by FORGEOutputPayload serializer and get_final_combined."""
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
    """Public alias for _sanitize_floats_for_json; use when serializing arbitrary dicts to JSON (e.g. get_final_combined)."""
    return _sanitize_floats_for_json(obj)


class FORGEInputPayload(BaseModel):
    mode: Literal["calculate"] = "calculate"
    input_mode: Literal["json"] = "json"
    output_mode: Literal["json"] = "json"
    combined_data: Optional[Dict[str, Any]] = None
    scenario_id: Optional[str] = None


# User merge input: simplified payload shape that merge_user_data_with_template reads
class UserMergeScenario(BaseModel):
    scenario_name: str = ""


class UserMergeProject(BaseModel):
    project_name: Optional[str] = None
    line_miles: Optional[float] = None
    voltage_kv: Optional[float] = None
    capacity_mw: Optional[float] = None
    project_type: Optional[str] = None


class UserMergeProjectCosts(BaseModel):
    build_costs_per_mile: Optional[float] = None


class UserMergeFinancial(BaseModel):
    discount_rate: Optional[float] = None
    analysis_period_years: Optional[int] = None


class UserMergeInput(BaseModel):
    """Simplified user payload for merge_user_data_with_template; validated at API boundary."""

    model_config = ConfigDict(extra="ignore")

    scenario: Optional[UserMergeScenario] = None
    project: Optional[UserMergeProject] = None
    project_costs: Optional[UserMergeProjectCosts] = None
    financial: Optional[UserMergeFinancial] = None


class FORGEResults(BaseModel):
    """Top-level shape of forge_results_*.json (API response results)."""

    model_config = ConfigDict(extra="ignore")

    scenario_id: str = ""
    timestamp: str = ""
    input_mode: str = "json"
    technical_parameters: Optional[Dict[str, Any]] = None
    costs: Optional[Dict[str, Any]] = None
    benefits: Optional[Dict[str, Any]] = None
    summary: Optional[Dict[str, Any]] = None
    bcr: Optional[Dict[str, Any]] = None


class FORGEOutputPayload(BaseModel):
    success: bool
    scenario_id: str
    timestamp: str
    input_mode: str
    error: Optional[str] = None
    results: Optional[FORGEResults] = None

    @model_serializer(mode="wrap")
    def _serialize_json_safe(self, handler: Any) -> Any:
        """Ensure model_dump() output is JSON-safe (no inf/nan)."""
        return _sanitize_floats_for_json(handler(self))
