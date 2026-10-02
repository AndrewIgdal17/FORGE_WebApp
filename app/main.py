"""FastAPI application that accepts calculator-relative changes, runs FORGE calculations, and returns JSON."""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime
from pathlib import Path

import forge
import jwt
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from forge.errors import UnknownInputPath
from jwt import PyJWKClient
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware

from .models import CalculateRequest, sanitize_for_json

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
LANDING_FILE = STATIC_DIR / "landing.html"
SIGNUP_FILE = STATIC_DIR / "signup.html"
LOGIN_FILE = STATIC_DIR / "login.html"
HOME_FILE = STATIC_DIR / "home.html"
WORKSPACE_FILE = STATIC_DIR / "workspace.html"
SCENARIOS_FILE = STATIC_DIR / "scenarios-manager.html"

app = FastAPI(title="FORGE API Server")

# Computed once at import time; the calculator defaults never change at runtime.
_CALCULATOR_INFO = forge.calculator_info()
_DEFAULTS_TEMPLATE = forge.get_defaults_template()
_DEFAULTS_ID = forge.get_defaults_id()

# --- Supabase JWT auth ---
_SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
_security = HTTPBearer(auto_error=False)
_jwks_client: PyJWKClient | None = None

def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client
    if _jwks_client is None and _SUPABASE_URL:
        _jwks_client = PyJWKClient(
            f"{_SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            cache_keys=True, lifespan=3600,
        )
    return _jwks_client

async def require_auth(
    cred: HTTPAuthorizationCredentials | None = Depends(_security),
) -> dict:
    """Verify Supabase JWT. Returns decoded token payload or raises 401."""
    if not _SUPABASE_URL:
        return {}  # auth disabled when SUPABASE_URL is not set (local dev)
    if cred is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    client = _get_jwks_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Auth not configured")
    try:
        signing_key = client.get_signing_key_from_jwt(cred.credentials)
        return jwt.decode(
            cred.credentials,
            signing_key.key,
            algorithms=[signing_key.algorithm_name],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
            leeway=30,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))


@app.on_event("startup")
async def _log_calculator_info() -> None:
    logger.info("FORGE calculator: %s", _CALCULATOR_INFO)


# Allow frontend apps to reach the API locally or across origins.
app.add_middleware(GZipMiddleware, minimum_size=500)


class CacheBustMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/static/") and request.url.path.endswith(
            (".js", ".css")
        ):
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response


app.add_middleware(CacheBustMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=FileResponse)
async def serve_landing() -> FileResponse:
    """Serve the landing page."""
    return FileResponse(LANDING_FILE)


@app.get("/signup", response_class=FileResponse)
async def serve_signup() -> FileResponse:
    """Serve the standalone signup page."""
    return FileResponse(SIGNUP_FILE)


@app.get("/login", response_class=FileResponse)
async def serve_login() -> FileResponse:
    """Serve the login page."""
    return FileResponse(LOGIN_FILE)


@app.get("/app", response_class=FileResponse)
async def serve_home() -> FileResponse:
    """Serve the FORGE home page."""
    return FileResponse(HOME_FILE)


@app.get("/app/workspace", response_class=FileResponse)
async def serve_workspace() -> FileResponse:
    """Serve the FORGE workspace (inputs + results)."""
    return FileResponse(WORKSPACE_FILE)


@app.get("/app/scenarios-manager", response_class=FileResponse)
async def serve_scenarios_manager() -> FileResponse:
    """Serve the scenario manager."""
    return FileResponse(SCENARIOS_FILE)


@app.get("/api/calculator", response_class=JSONResponse)
async def get_calculator() -> JSONResponse:
    """Return the deployed calculator's identity (package, version, commit, defaults_id)."""
    return JSONResponse(sanitize_for_json(_CALCULATOR_INFO))


@app.get("/api/defaults", response_class=JSONResponse)
async def get_defaults() -> JSONResponse:
    """Return the deployed calculator's identity plus its full defaults template."""
    return JSONResponse(sanitize_for_json({
        "calculator": _CALCULATOR_INFO,
        "defaults": _DEFAULTS_TEMPLATE,
    }))


@app.get("/api/presets/grid_mix", response_class=JSONResponse)
async def get_grid_mix_presets() -> JSONResponse:
    """Return the calculator's bundled grid-mix presets."""
    return JSONResponse(sanitize_for_json(forge.get_grid_mix_presets()))


@app.get("/api/taxonomy", response_class=JSONResponse)
async def get_taxonomy() -> JSONResponse:
    """Return the FORGE cost/benefit taxonomy (reference data, static)."""
    from forge.scripts.io.taxonomy import taxonomy_to_dict
    return JSONResponse(sanitize_for_json(taxonomy_to_dict()))


@app.get("/api/input_metadata", response_class=JSONResponse)
async def get_input_metadata() -> JSONResponse:
    """Return input field metadata for taxonomy-driven form generation."""
    from forge.scripts.io.input_metadata import input_metadata_to_dict
    return JSONResponse(sanitize_for_json(input_metadata_to_dict()))


@app.post("/api/forge/calculate", response_class=JSONResponse)
async def calculate_forge(
    payload: CalculateRequest,
    _user: dict = Depends(require_auth),
) -> JSONResponse:
    """
    Resolve a change map against the deployed defaults and run the calculator.

    The client must send the `defaults_id` it last fetched; if the deployed
    calculator's defaults have since changed, this returns 409 along with the
    currently deployed `calculator_info()` so the client can refetch. Unknown
    or non-scalar change paths return 422 with the offending paths.
    """
    if payload.defaults_id != _DEFAULTS_ID:
        return JSONResponse(status_code=409, content=sanitize_for_json(_CALCULATOR_INFO))

    try:
        resolved_inputs = forge.resolve_inputs(payload.changes)
    except UnknownInputPath as exc:
        return JSONResponse(status_code=422, content={"paths": exc.paths})

    scenario_id = payload.scenario_id or datetime.now().strftime("%b %d %Y %H.%M.%S")

    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        None,
        lambda: forge.run_calculation(resolved_inputs, scenario_id=scenario_id, quiet=True),
    )

    return JSONResponse(sanitize_for_json({
        "success": True,
        "scenario_id": scenario_id,
        "timestamp": results.get("timestamp", datetime.now().isoformat()),
        "results": results,
        "error": None,
    }))


if __name__ == "__main__":
    try:
        import uvicorn
    except ModuleNotFoundError as exc:  # pragma: no cover - convenience only
        raise SystemExit("Install uvicorn to run with `python -m app.main`.") from exc

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
