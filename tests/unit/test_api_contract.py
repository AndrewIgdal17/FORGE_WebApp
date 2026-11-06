import json
from pathlib import Path

import forge
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.route import ROUTE_REQUIRED

client = TestClient(app)


def test_static_holds_no_parameter_tables():
    """The vanilla static/ tree is gone, so it cannot ship parameter tables."""
    static = Path(__file__).resolve().parents[2] / "static"
    assert not static.exists()

SCENARIO_FILES = sorted(Path(forge.get_scenarios_path()).glob("*.forge"))


def _assert_unmodified_scenario_is_rejected(scenario_id: str, document: dict) -> None:
    changes = forge.diff_changes(document["inputs"])
    with pytest.raises(forge.InvalidInputs, match="protected_area_acres are required"):
        forge.resolve_inputs(changes)
    response = client.post(
        "/api/forge/calculate",
        json={
            "defaults_id": forge.get_defaults_id(),
            "changes": changes,
            "scenario_id": scenario_id,
        },
    )
    assert response.status_code == 422, (scenario_id, response.text)
    assert response.json()["detail"] == ROUTE_REQUIRED


def test_defaults_and_laredo_match_the_calculator():
    info = client.get("/api/calculator")
    assert info.status_code == 200
    assert info.json()["defaults_id"] == forge.get_defaults_id()

    document = json.loads(
        Path(forge.get_scenarios_path(), "AEP_LRGV_Laredo_NewBuild.forge").read_text()
    )
    _assert_unmodified_scenario_is_rejected("AEP_LRGV_Laredo_NewBuild", document)


def test_all_scenarios_match_the_calculator():
    assert len(SCENARIO_FILES) == 7
    for scenario_file in SCENARIO_FILES:
        document = json.loads(scenario_file.read_text())
        _assert_unmodified_scenario_is_rejected(scenario_file.stem, document)


def test_invalid_inputs_returns_message():
    response = client.post(
        "/api/forge/calculate",
        json={"defaults_id": forge.get_defaults_id(), "changes": {}},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == ROUTE_REQUIRED
    assert response.headers["x-request-id"]


def test_stale_defaults_and_unknown_paths():
    stale = client.post(
        "/api/forge/calculate", json={"defaults_id": "sha256:0", "changes": {}}
    )
    assert stale.status_code == 409
    unknown = client.post(
        "/api/forge/calculate",
        json={
            "defaults_id": forge.get_defaults_id(),
            "changes": {"no.such": 1},
        },
    )
    assert unknown.status_code == 422
    assert unknown.json()["detail"] == ROUTE_REQUIRED


def test_removed_routes_are_gone():
    assert client.get("/api/final_combined").status_code == 404
    assert client.get("/api/outputs/anything.csv").status_code == 404
    assert client.get("/api/fuel_mix_presets").status_code == 404
