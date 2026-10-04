"""Request logging middleware tests."""

from fastapi.testclient import TestClient


def test_every_response_has_request_id():
    from app.main import app
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/api/health")
    assert "X-Request-ID" in resp.headers
    assert len(resp.headers["X-Request-ID"]) == 12


def test_request_id_passthrough():
    from app.main import app
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/api/health", headers={"X-Request-ID": "custom123456"})
    assert resp.headers["X-Request-ID"] == "custom123456"
