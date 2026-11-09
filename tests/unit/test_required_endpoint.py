"""POST /api/forge/required returns the calculator's missing fields, split by stage."""

from __future__ import annotations

import forge
import pytest
from fastapi.testclient import TestClient

from app.main import app, require_auth

client = TestClient(app)

CAPACITY = "01_project_technical_details.project.capacity_mw"


def _split(missing: list[dict]) -> dict[str, list[dict]]:
    return {
        "before_route": [item for item in missing if item["stage"] == "before_route"],
        "after_route": [item for item in missing if item["stage"] == "after_route"],
    }


@pytest.fixture
def as_user():
    app.dependency_overrides[require_auth] = lambda: {"sub": "u"}
    yield
    app.dependency_overrides.pop(require_auth, None)


def test_empty_changes_match_the_calculator(as_user):
    response = client.post("/api/forge/required", json={"changes": {}})
    assert response.status_code == 200, response.text
    missing = forge.missing_required_inputs({})
    body = response.json()
    assert [item["path"] for item in body["before_route"]] == [
        item["path"] for item in missing if item["stage"] == "before_route"
    ]
    assert [item["path"] for item in body["after_route"]] == [
        item["path"] for item in missing if item["stage"] == "after_route"
    ]
    assert body == _split(missing)


def test_changes_are_forwarded_to_the_calculator(as_user):
    changes = {CAPACITY: 500}
    response = client.post("/api/forge/required", json={"changes": changes})
    assert response.status_code == 200, response.text
    missing = forge.missing_required_inputs(changes)
    assert response.json() == _split(missing)
    assert [item["path"] for item in missing] != [
        item["path"] for item in forge.missing_required_inputs({})
    ]


def test_invalid_changes_shape_keeps_the_validation_body(as_user):
    response = client.post("/api/forge/required", json={"changes": "nope"})
    assert response.status_code == 422
    assert response.json() == {
        "detail": [
            {
                "type": "dict_type",
                "loc": ["body", "changes"],
                "msg": "Input should be a valid dictionary",
                "input": "nope",
            }
        ]
    }


def test_missing_token_is_unauthorized(monkeypatch):
    monkeypatch.setattr("app.main._SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr("app.main._AUTH_DISABLED", False)
    response = client.post("/api/forge/required", json={"changes": {}})
    assert response.status_code == 401
    assert response.json() == {"detail": "Missing token"}
