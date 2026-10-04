"""Tests for app.auth: fail-closed startup, token verification, and rate limiting."""

from __future__ import annotations

import importlib
import sys
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app import auth

# --- assert_startup_credentials -----------------------------------------------


def test_server_refuses_without_credentials():
    """Without SUPABASE_URL and FORGE_DATABASE_URL, the server must not start
    unless FORGE_AUTH_DISABLED=true."""
    with pytest.raises(RuntimeError):
        auth.assert_startup_credentials(env={})

    with pytest.raises(RuntimeError):
        auth.assert_startup_credentials(env={"SUPABASE_URL": "https://example.supabase.co"})

    with pytest.raises(RuntimeError):
        auth.assert_startup_credentials(env={"FORGE_DATABASE_URL": "postgresql://x/y"})


def test_server_starts_with_both_credentials():
    auth.assert_startup_credentials(
        env={
            "SUPABASE_URL": "https://example.supabase.co",
            "FORGE_DATABASE_URL": "postgresql://x/y",
        }
    )


def test_server_starts_with_auth_disabled_flag(caplog):
    """FORGE_AUTH_DISABLED=true allows starting with no credentials, with a warning."""
    with caplog.at_level("WARNING"):
        auth.assert_startup_credentials(env={"FORGE_AUTH_DISABLED": "true"})
    assert any("FORGE_AUTH_DISABLED" in record.message for record in caplog.records)


def test_auth_disabled_flag_is_case_insensitive_and_requires_exact_value():
    auth.assert_startup_credentials(env={"FORGE_AUTH_DISABLED": "True"})
    with pytest.raises(RuntimeError):
        auth.assert_startup_credentials(env={"FORGE_AUTH_DISABLED": "yes"})


def test_importing_app_main_refuses_to_start_without_credentials(monkeypatch):
    """End-to-end: importing app.main itself enforces the same fail-closed check."""
    for var in ("SUPABASE_URL", "FORGE_DATABASE_URL", "FORGE_AUTH_DISABLED"):
        monkeypatch.delenv(var, raising=False)

    original_module = sys.modules.pop("app.main", None)
    try:
        with pytest.raises(RuntimeError):
            importlib.import_module("app.main")
    finally:
        sys.modules.pop("app.main", None)
        if original_module is not None:
            sys.modules["app.main"] = original_module


# --- verify_token --------------------------------------------------------------

SUPABASE_URL = "http://127.0.0.1:54321"
ISSUER = f"{SUPABASE_URL}/auth/v1"


class _FakeJWKClient:
    """Stand-in for jwt.PyJWKClient that always hands back one fixed key.

    Lets tests exercise verify_token's issuer/audience/role/exp/alg checks
    without depending on a live Supabase JWKS endpoint.
    """

    def __init__(self, key) -> None:
        self._key = key

    def get_signing_key_from_jwt(self, token):
        class _Key:
            pass

        wrapper = _Key()
        wrapper.key = self._key
        return wrapper


@pytest.fixture
def ec_key():
    return ec.generate_private_key(ec.SECP256R1())


def _claims(**overrides):
    now = int(time.time())
    base = {
        "sub": "11111111-1111-1111-1111-111111111111",
        "iss": ISSUER,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": now + 3600,
        "iat": now,
    }
    base.update(overrides)
    return base


def test_valid_token_is_accepted(ec_key):
    token = jwt.encode(_claims(), ec_key, algorithm="ES256")
    client = _FakeJWKClient(ec_key.public_key())
    payload = auth.verify_token(f"Bearer {token}", supabase_url=SUPABASE_URL, jwks_client=client)
    assert payload["sub"] == "11111111-1111-1111-1111-111111111111"


def test_token_with_wrong_issuer_is_rejected(ec_key):
    token = jwt.encode(_claims(iss="https://not-this-project.supabase.co/auth/v1"), ec_key, algorithm="ES256")
    client = _FakeJWKClient(ec_key.public_key())
    with pytest.raises(jwt.PyJWTError):
        auth.verify_token(f"Bearer {token}", supabase_url=SUPABASE_URL, jwks_client=client)


def test_expired_token_is_rejected(ec_key):
    now = int(time.time())
    token = jwt.encode(_claims(exp=now - 3600, iat=now - 7200), ec_key, algorithm="ES256")
    client = _FakeJWKClient(ec_key.public_key())
    with pytest.raises(jwt.ExpiredSignatureError):
        auth.verify_token(f"Bearer {token}", supabase_url=SUPABASE_URL, jwks_client=client)


def test_hs256_signed_token_is_rejected_even_with_valid_claims(ec_key):
    """Only ES256/RS256 are accepted; a token signed with a shared secret must fail
    even if its claims look otherwise valid (defends against alg-confusion)."""
    token = jwt.encode(_claims(), "some-shared-secret", algorithm="HS256")
    client = _FakeJWKClient(ec_key.public_key())
    with pytest.raises(jwt.InvalidAlgorithmError):
        auth.verify_token(f"Bearer {token}", supabase_url=SUPABASE_URL, jwks_client=client)


def test_token_with_wrong_role_claim_is_rejected(ec_key):
    token = jwt.encode(_claims(role="service_role"), ec_key, algorithm="ES256")
    client = _FakeJWKClient(ec_key.public_key())
    with pytest.raises(jwt.PyJWTError):
        auth.verify_token(f"Bearer {token}", supabase_url=SUPABASE_URL, jwks_client=client)


def test_token_missing_sub_is_rejected(ec_key):
    claims = _claims()
    del claims["sub"]
    token = jwt.encode(claims, ec_key, algorithm="ES256")
    client = _FakeJWKClient(ec_key.public_key())
    with pytest.raises(jwt.PyJWTError):
        auth.verify_token(f"Bearer {token}", supabase_url=SUPABASE_URL, jwks_client=client)


def test_missing_authorization_header_is_rejected():
    with pytest.raises(jwt.PyJWTError):
        auth.verify_token(None, supabase_url=SUPABASE_URL)


def test_malformed_authorization_header_is_rejected():
    with pytest.raises(jwt.PyJWTError):
        auth.verify_token("not-a-bearer-token", supabase_url=SUPABASE_URL)


# --- RateLimiter -----------------------------------------------------------------


def test_rate_limiter_blocks_after_threshold():
    limiter = auth.RateLimiter(calculation_limit=30, write_limit=60, window_seconds=60.0)
    now = 1_000.0

    for _ in range(30):
        assert limiter.allow_calculation("user-a", now=now) is True

    assert limiter.allow_calculation("user-a", now=now) is False
    # A different user has an independent budget.
    assert limiter.allow_calculation("user-b", now=now) is True


def test_rate_limiter_resets_after_window_elapses():
    limiter = auth.RateLimiter(calculation_limit=2, write_limit=60, window_seconds=60.0)
    now = 1_000.0

    assert limiter.allow_calculation("user-a", now=now) is True
    assert limiter.allow_calculation("user-a", now=now) is True
    assert limiter.allow_calculation("user-a", now=now) is False

    # 61 seconds later, the earlier hits have fallen out of the window.
    assert limiter.allow_calculation("user-a", now=now + 61) is True


def test_rate_limiter_tracks_calculations_and_writes_independently():
    limiter = auth.RateLimiter(calculation_limit=1, write_limit=1, window_seconds=60.0)
    now = 1_000.0

    assert limiter.allow_calculation("user-a", now=now) is True
    assert limiter.allow_calculation("user-a", now=now) is False
    # The write budget for the same user is untouched by calculation calls.
    assert limiter.allow_write("user-a", now=now) is True
    assert limiter.allow_write("user-a", now=now) is False
