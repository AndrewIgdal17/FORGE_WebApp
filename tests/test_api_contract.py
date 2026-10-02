import json
from pathlib import Path

import forge
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_static_holds_no_parameter_tables():
    static = Path(__file__).resolve().parents[1] / "static"
    json_files = sorted(path.name for path in static.glob("*.json"))
    assert json_files == ["_function-map.json"]

SCENARIO_FILES = sorted(Path(forge.get_scenarios_path()).glob("*.forge"))


def _assert_api_matches_calculator(scenario_id: str, document: dict) -> None:
    """Shared assertion for one .forge fixture: resolve its diff, call the API,
    and check both halves of the contract against direct calculator calls.

    `inputs_id` hashes the dict `run_calculation` actually receives. The API
    receives `resolve_inputs(diff_changes(document["inputs"]))`, which fills
    template-only nulls and drops keys the calculator does not read
    (`project.name`, `habitat_credit_cost_per_acre.farmland`). That dict is not
    byte-identical to the raw `.forge` `inputs`, so its hash is compared
    against `run_calculation(resolved, ...)`, not against the raw document.
    The calculation result itself (`bcr_ratepayer`) is compared against
    `run_calculation` on the raw document, since the dropped/filled keys do
    not affect the computed results.
    """
    changes = forge.diff_changes(document["inputs"])
    resolved = forge.resolve_inputs(changes)

    response = client.post(
        "/api/forge/calculate",
        json={
            "defaults_id": forge.get_defaults_id(),
            "changes": changes,
            "scenario_id": scenario_id,
        },
    )
    assert response.status_code == 200, (scenario_id, response.text)
    body = response.json()

    direct_resolved = forge.run_calculation(resolved, scenario_id=scenario_id)
    assert (
        body["results"]["provenance"]["inputs_id"]
        == direct_resolved["provenance"]["inputs_id"]
    ), scenario_id

    direct_raw = forge.run_calculation(document["inputs"], scenario_id=scenario_id)
    assert (
        body["results"]["bcr"]["bcr_ratepayer"] == direct_raw["bcr"]["bcr_ratepayer"]
    ), scenario_id


def test_defaults_and_laredo_match_the_calculator():
    info = client.get("/api/calculator")
    assert info.status_code == 200
    assert info.json()["defaults_id"] == forge.get_defaults_id()

    document = json.loads(
        Path(forge.get_scenarios_path(), "AEP_LRGV_Laredo_NewBuild.forge").read_text()
    )
    _assert_api_matches_calculator("AEP_LRGV_Laredo_NewBuild", document)


def test_all_scenarios_match_the_calculator():
    assert len(SCENARIO_FILES) == 8
    for scenario_file in SCENARIO_FILES:
        document = json.loads(scenario_file.read_text())
        _assert_api_matches_calculator(scenario_file.stem, document)


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
    assert "no.such" in unknown.text


def test_removed_routes_are_gone():
    assert client.get("/api/final_combined").status_code == 404
    assert client.get("/api/outputs/anything.csv").status_code == 404
    assert client.get("/api/fuel_mix_presets").status_code == 404
