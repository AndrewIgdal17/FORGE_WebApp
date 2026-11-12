"""Calculate requires a covered route; measured miles and regions overwrite typed changes."""

from __future__ import annotations

import forge
import pytest
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.layer_releases import layer_releases
from app.main import app
from app.route import ROUTE_REQUIRED

client = TestClient(app)

AUSTIN_DALLAS_ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[[-97.74, 30.27], [-97.10, 31.50], [-96.80, 32.78]]],
}

FORESTED = "02_project_physical_details.terrain.terrain_miles.forested"
RECEIVING_GEA = "01_project_technical_details.terminals.receiving.gea"
OTHER_TERMINALS = (
    "01_project_technical_details.terminals.sending.gea",
    "01_project_technical_details.terminals.sending.egrid_subregion",
    "01_project_technical_details.terminals.sending.state",
    "01_project_technical_details.terminals.receiving.egrid_subregion",
    "01_project_technical_details.terminals.receiving.state",
)
# The calculator still rejects a document with no protected-area acres.
# Measured changes include explicit zeros so a successful calculate is reachable.
ACRE_ZEROS = {
    "02_project_physical_details.terrain.protected_area_acres.forested": 0.0,
    "02_project_physical_details.terrain.protected_area_acres.scrubbed_flat": 0.0,
    "02_project_physical_details.terrain.protected_area_acres.desert_barren": 0.0,
    "02_project_physical_details.terrain.protected_area_acres.rolling_hills": 0.0,
    "02_project_physical_details.terrain.protected_area_acres.mountain": 0.0,
}
# v4.0.0 requires these before resolve_inputs will return a document.
REQUIRED_TO_CALCULATE = {
    "01_project_technical_details.project.capacity_mw": 500,
    "01_project_technical_details.project.value_of_load_per_mwh": 40,
    "01_project_technical_details.terminals.sending.gea": "CAISO",
    "01_project_technical_details.terminals.sending.egrid_subregion": "AZNM",
    "01_project_technical_details.terminals.sending.state": "AZ",
    "01_project_technical_details.terminals.receiving.gea": "CAISO",
    "01_project_technical_details.terminals.receiving.egrid_subregion": "AZNM",
    "01_project_technical_details.terminals.receiving.state": "AZ",
    "17_congestion_reductions.greenfield_congestion_reductions.constraints.flow_factor": 0.5,
    "17_congestion_reductions.greenfield_congestion_reductions.prices.average_congestion_price": 10,
}


def _live(**extra) -> dict:
    body = {"defaults_id": forge.get_defaults_id(), "changes": {}}
    body.update(extra)
    return body


def _skip_shared_calculation_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    """Do not record a hit on the process-wide 30-per-minute anonymous bucket."""
    from app.auth import rate_limiter

    monkeypatch.setattr(
        rate_limiter, "allow_calculation", lambda user_id, now=None: True
    )


def _forbid_calculation(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*args, **kwargs):
        raise AssertionError("run_calculation must not be called")

    monkeypatch.setattr(forge, "run_calculation", fail)


def _leaf(document: dict, path: str):
    node = document
    for part in path.split("."):
        node = node[part]
    return node


def test_missing_route_is_required_and_skips_calculation(monkeypatch):
    _forbid_calculation(monkeypatch)
    response = client.post("/api/forge/calculate", json=_live())
    assert response.status_code == 422
    assert response.json() == {"detail": ROUTE_REQUIRED}


def test_linestring_route_is_rejected_and_skips_calculation(monkeypatch):
    _forbid_calculation(monkeypatch)
    response = client.post(
        "/api/forge/calculate",
        json=_live(
            route={
                "type": "LineString",
                "coordinates": [[-97.74, 30.27], [-96.80, 32.78]],
            },
            row_width_ft=100,
        ),
    )
    assert response.status_code == 422
    assert response.json() == {"detail": ROUTE_REQUIRED}


def test_zero_row_width_is_rejected_and_skips_calculation(monkeypatch):
    _forbid_calculation(monkeypatch)
    response = client.post(
        "/api/forge/calculate",
        json=_live(route=AUSTIN_DALLAS_ROUTE, row_width_ft=0),
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "row_width_ft must be positive"


def test_measured_miles_overwrite_typed_changes(monkeypatch):
    releases = layer_releases(["file dates 2026-10-09"])
    seen: dict = {}
    recorded: dict = {}

    async def fake_analysis(route, row_width_ft):
        return JSONResponse(
            content={
                "changes": {FORESTED: 10, **ACRE_ZEROS},
                "layer_releases": releases,
            }
        )

    def spy_resolve(changes):
        seen["changes"] = dict(changes)
        return original_resolve(changes)

    def fake_run(resolved, scenario_id="", **kwargs):
        recorded["document"] = resolved
        return {"results": {"ok": True}, "provenance": {}}

    original_resolve = forge.resolve_inputs
    monkeypatch.setattr("app.route.run_route_analysis", fake_analysis)
    monkeypatch.setattr(forge, "resolve_inputs", spy_resolve)
    monkeypatch.setattr(forge, "run_calculation", fake_run)

    response = client.post(
        "/api/forge/calculate",
        json=_live(
            changes={FORESTED: 99, **REQUIRED_TO_CALCULATE},
            route=AUSTIN_DALLAS_ROUTE,
            row_width_ft=100,
        ),
    )
    assert response.status_code == 200, response.text
    assert seen["changes"][FORESTED] == 10
    assert _leaf(recorded["document"], FORESTED) == 10
    assert response.json()["layer_releases"] == releases


def test_measured_receiving_gea_overwrites_typed_value(monkeypatch):
    _skip_shared_calculation_limit(monkeypatch)
    releases = layer_releases(["file dates 2026-10-09"])
    seen: dict = {}
    recorded: dict = {}

    async def fake_analysis(route, row_width_ft):
        return JSONResponse(
            content={
                "changes": {FORESTED: 10, **ACRE_ZEROS, RECEIVING_GEA: "CAISO"},
                "layer_releases": releases,
            }
        )

    def spy_resolve(changes):
        seen["changes"] = dict(changes)
        return original_resolve(changes)

    def fake_run(resolved, scenario_id="", **kwargs):
        recorded["document"] = resolved
        return {"results": {"ok": True}, "provenance": {}}

    original_resolve = forge.resolve_inputs
    monkeypatch.setattr("app.route.run_route_analysis", fake_analysis)
    monkeypatch.setattr(forge, "resolve_inputs", spy_resolve)
    monkeypatch.setattr(forge, "run_calculation", fake_run)

    response = client.post(
        "/api/forge/calculate",
        json=_live(
            changes={FORESTED: 99, **REQUIRED_TO_CALCULATE, RECEIVING_GEA: "TYPED"},
            route=AUSTIN_DALLAS_ROUTE,
            row_width_ft=100,
        ),
    )
    assert response.status_code == 200, response.text
    assert seen["changes"][RECEIVING_GEA] == "CAISO"
    for path in OTHER_TERMINALS:
        assert seen["changes"][path] == REQUIRED_TO_CALCULATE[path]
    assert _leaf(recorded["document"], RECEIVING_GEA) == "CAISO"
    assert response.json()["layer_releases"] == releases


def test_measured_null_receiving_gea_replaces_typed_value(monkeypatch):
    _skip_shared_calculation_limit(monkeypatch)
    seen: dict = {}

    async def fake_analysis(route, row_width_ft):
        return JSONResponse(
            content={
                "changes": {**ACRE_ZEROS, RECEIVING_GEA: None},
                "layer_releases": layer_releases(["file dates 2026-10-09"]),
            }
        )

    def spy_resolve(changes):
        seen["changes"] = dict(changes)
        return original_resolve(changes)

    original_resolve = forge.resolve_inputs
    monkeypatch.setattr("app.route.run_route_analysis", fake_analysis)
    monkeypatch.setattr(forge, "resolve_inputs", spy_resolve)

    response = client.post(
        "/api/forge/calculate",
        json=_live(
            changes=dict(REQUIRED_TO_CALCULATE),
            route=AUSTIN_DALLAS_ROUTE,
            row_width_ft=100,
        ),
    )
    assert seen["changes"][RECEIVING_GEA] is None
    for path in OTHER_TERMINALS:
        assert seen["changes"][path] == REQUIRED_TO_CALCULATE[path]
    assert response.status_code == 422, response.text
    assert response.json()["error"] == {
        "code": "invalid_inputs",
        "message": (
            "01_project_technical_details.terminals.receiving.gea: "
            "Receiving terminal GEA region is required."
        ),
    }


def test_coverage_rejection_is_returned_without_calculating(monkeypatch):
    _forbid_calculation(monkeypatch)
    called = {"n": 0}

    async def coverage(route, row_width_ft):
        called["n"] += 1
        return JSONResponse(status_code=422, content={"detail": ROUTE_REQUIRED})

    monkeypatch.setattr("app.route.run_route_analysis", coverage)
    response = client.post(
        "/api/forge/calculate",
        json=_live(route=AUSTIN_DALLAS_ROUTE, row_width_ft=100),
    )
    assert called["n"] == 1
    assert response.status_code == 422
    assert response.json() == {"detail": ROUTE_REQUIRED}
