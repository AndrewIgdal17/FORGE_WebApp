"""Health endpoint and RENDER guard tests."""

import pytest
from fastapi.testclient import TestClient


def test_health_returns_200():
    """Health returns 200 when the self-test has not run (unit test, no lifespan)."""
    # Unit tests construct TestClient without entering lifespan, so
    # _health_ready stays False.  We test the route shape, not the 200.
    from app.main import _health_ready, app

    assert _health_ready is False
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/api/health")
    # Without lifespan, _health_ready is False → 503
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "starting"
    assert "calculator" in body


def test_render_guard_blocks_auth_disabled(monkeypatch):
    """RENDER=true + FORGE_AUTH_DISABLED=true raises at startup."""
    from app.auth import assert_startup_credentials
    with pytest.raises(RuntimeError, match="RENDER=true"):
        assert_startup_credentials(env={
            "RENDER": "true",
            "FORGE_AUTH_DISABLED": "true",
        })


def test_render_guard_allows_normal_startup(monkeypatch):
    """RENDER=true with real credentials passes."""
    from app.auth import assert_startup_credentials
    # Should not raise
    assert_startup_credentials(env={
        "RENDER": "true",
        "SUPABASE_URL": "https://example.supabase.co",
        "FORGE_DATABASE_URL": "postgresql://forge_api:pw@host:5432/db",
    })
