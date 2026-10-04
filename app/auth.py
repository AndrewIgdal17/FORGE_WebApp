"""Startup credential checks, Supabase JWT verification, and in-memory rate limiting."""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from collections.abc import Mapping

import jwt
from jwt import PyJWKClient

logger = logging.getLogger(__name__)

# Only accept asymmetric signatures from the project's published JWKS. This
# also blocks the classic "alg confusion" attack where a token is re-signed
# with HS256 using a public key as the HMAC secret.
ALLOWED_ALGORITHMS = ["ES256", "RS256"]
REQUIRED_AUDIENCE = "authenticated"
REQUIRED_ROLE = "authenticated"


# --- Fail-closed startup check -----------------------------------------------


def assert_startup_credentials(env: Mapping[str, str] | None = None) -> None:
    """Raise `RuntimeError` unless the server has what it needs to run safely.

    The server refuses to start without both `SUPABASE_URL` and
    `FORGE_DATABASE_URL`, unless `FORGE_AUTH_DISABLED=true` is set explicitly
    for local dev — in which case it logs a warning and allows the caller to
    proceed with auth disabled and no database access.
    """
    env = env if env is not None else os.environ
    auth_disabled = env.get("FORGE_AUTH_DISABLED", "").strip().lower() == "true"
    on_render = env.get("RENDER", "").strip().lower() == "true"

    if on_render and auth_disabled:
        raise RuntimeError(
            "FORGE_AUTH_DISABLED=true is forbidden when RENDER=true. "
            "Set SUPABASE_URL and FORGE_DATABASE_URL instead."
        )

    supabase_url = (env.get("SUPABASE_URL") or "").strip()
    database_url = (env.get("FORGE_DATABASE_URL") or "").strip()

    if supabase_url and database_url:
        return

    if auth_disabled:
        logger.warning(
            "FORGE_AUTH_DISABLED=true: starting without SUPABASE_URL and/or "
            "FORGE_DATABASE_URL. Auth is disabled and database access is "
            "unavailable. Do not run this configuration in production."
        )
        return

    missing = [
        name
        for name, value in (("SUPABASE_URL", supabase_url), ("FORGE_DATABASE_URL", database_url))
        if not value
    ]
    raise RuntimeError(
        f"Refusing to start: missing required environment variable(s): "
        f"{', '.join(missing)}. Set them, or set FORGE_AUTH_DISABLED=true "
        f"explicitly to run locally without auth or persistence."
    )


# --- Token verification -------------------------------------------------------

_jwks_client: PyJWKClient | None = None
_jwks_client_url: str | None = None


def _get_jwks_client(supabase_url: str) -> PyJWKClient:
    global _jwks_client, _jwks_client_url
    if _jwks_client is None or _jwks_client_url != supabase_url:
        _jwks_client = PyJWKClient(
            f"{supabase_url}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            lifespan=3600,
        )
        _jwks_client_url = supabase_url
    return _jwks_client


def verify_token(
    authorization: str | None,
    *,
    supabase_url: str,
    jwks_client: PyJWKClient | None = None,
) -> dict:
    """Verify a Supabase access token from an `Authorization: Bearer <token>` header.

    Checks, in order: the header is well-formed; the signature verifies
    against the project's JWKS using ES256 or RS256 only; the issuer equals
    `{supabase_url}/auth/v1`; the audience is `authenticated`; `exp` and
    `sub` are present; and the token's `role` claim is `authenticated`.

    Raises `jwt.PyJWTError` (or a subclass) on any failure. Callers translate
    that into an HTTP 401. `jwks_client` is an injection point for tests;
    production callers omit it and get the module-level cached client.
    """
    if not authorization:
        raise jwt.InvalidTokenError("Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise jwt.InvalidTokenError("Authorization header must be 'Bearer <token>'")

    client = jwks_client if jwks_client is not None else _get_jwks_client(supabase_url)
    signing_key = client.get_signing_key_from_jwt(token)

    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=ALLOWED_ALGORITHMS,
        audience=REQUIRED_AUDIENCE,
        issuer=f"{supabase_url}/auth/v1",
        options={"require": ["exp", "sub"]},
        leeway=30,
    )

    if payload.get("role") != REQUIRED_ROLE:
        raise jwt.InvalidTokenError("Token 'role' claim must be 'authenticated'")

    return payload


# --- In-memory rate limiting --------------------------------------------------


class RateLimiter:
    """Per-user, in-memory sliding-window rate limiter.

    Counts calculations and writes separately in plain dicts of timestamps.
    Not shared across processes — fine for a single server instance (see
    the design doc's assumption that one Render instance is sufficient).
    """

    def __init__(
        self,
        calculation_limit: int = 30,
        write_limit: int = 60,
        window_seconds: float = 60.0,
    ) -> None:
        self._calculation_limit = calculation_limit
        self._write_limit = write_limit
        self._window_seconds = window_seconds
        self._calculation_hits: dict[str, list[float]] = defaultdict(list)
        self._write_hits: dict[str, list[float]] = defaultdict(list)

    def _check(self, hits: dict[str, list[float]], user_id: str, limit: int, now: float) -> bool:
        timestamps = hits[user_id]
        cutoff = now - self._window_seconds
        while timestamps and timestamps[0] <= cutoff:
            timestamps.pop(0)
        if len(timestamps) >= limit:
            return False
        timestamps.append(now)
        return True

    def allow_calculation(self, user_id: str, now: float | None = None) -> bool:
        """Record and allow a calculation for `user_id`, or return False if over the limit."""
        return self._check(
            self._calculation_hits, user_id, self._calculation_limit, now if now is not None else time.monotonic()
        )

    def allow_write(self, user_id: str, now: float | None = None) -> bool:
        """Record and allow a write for `user_id`, or return False if over the limit."""
        return self._check(
            self._write_hits, user_id, self._write_limit, now if now is not None else time.monotonic()
        )


# Module-level singleton shared by all requests in this process.
rate_limiter = RateLimiter()
