"""Pydantic models for request/response payloads."""

from __future__ import annotations

import math
from typing import Any

from pydantic import BaseModel, model_validator


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
    changes: dict[str, Any]
    route: dict[str, Any] | None = None
    row_width_ft: float | None = None
    scenario_id: str | None = None


class RequiredRequest(BaseModel):
    changes: dict[str, Any]


class ScenarioCreate(BaseModel):
    name: str
    source: str
    defaults_id: str
    changes: dict[str, Any]
    route: dict[str, Any] | None = None  # GeoJSON MultiLineString
    segments: list[dict[str, Any]] | None = None
    row_width_ft: float | None = None
    project_id: str | None = None


class ScenarioUpdate(BaseModel):
    revision: int
    name: str | None = None
    defaults_id: str | None = None
    changes: dict[str, Any] | None = None
    route: dict[str, Any] | None = None
    segments: list[dict[str, Any]] | None = None
    row_width_ft: float | None = None


class TerminalIn(BaseModel):
    """One project end: a substation gid or a lon/lat point, never both."""

    substation_gid: int | None = None
    point: tuple[float, float] | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> TerminalIn:
        has_gid = self.substation_gid is not None
        has_point = self.point is not None
        if has_gid == has_point:
            raise ValueError("Set exactly one of substation_gid or point.")
        return self


class ProjectCreate(BaseModel):
    """A project and the first scenario that connects its terminals.

    ``scenario`` is a scenario create body. ``scenario.project_id`` is
    ignored; the server assigns the new project.
    """

    name: str | None = None
    sending: TerminalIn
    receiving: TerminalIn
    scenario: ScenarioCreate


class ProjectUpdate(BaseModel):
    revision: int
    name: str | None = None
    base_scenario_id: str | None = None


class LineAssembleRequest(BaseModel):
    gids: list[int]
    sending: tuple[float, float]
    receiving: tuple[float, float]
    sending_gid: int | None = None
    receiving_gid: int | None = None
    stretch_end: tuple[float, float] | None = None

    @model_validator(mode="after")
    def _gids_valid(self) -> LineAssembleRequest:
        if not (1 <= len(self.gids) <= 200):
            raise ValueError("gids must contain between 1 and 200 items.")
        if len(self.gids) != len(set(self.gids)):
            raise ValueError("gids must be unique.")
        return self
