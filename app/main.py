"""FastAPI application that accepts calculator-relative changes, runs FORGE calculations, and returns JSON."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import forge
import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from forge.errors import UnknownInputPath
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware

from . import auth as auth_module
from . import db as db_module
from . import scenarios as scenarios_module
from .models import CalculateRequest, sanitize_for_json

logger = logging.getLogger(__name__)

FORGE_CALC_WORKERS = int(os.environ.get("FORGE_CALC_WORKERS", "4"))
_calc_pool = ThreadPoolExecutor(max_workers=FORGE_CALC_WORKERS)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
LANDING_FILE = STATIC_DIR / "landing.html"
SIGNUP_FILE = STATIC_DIR / "signup.html"
LOGIN_FILE = STATIC_DIR / "login.html"
HOME_FILE = STATIC_DIR / "home.html"
WORKSPACE_FILE = STATIC_DIR / "workspace.html"
SCENARIOS_FILE = STATIC_DIR / "scenarios-manager.html"

# Fail closed: refuse to start without SUPABASE_URL + FORGE_DATABASE_URL,
# unless FORGE_AUTH_DISABLED=true is set explicitly for local dev.
auth_module.assert_startup_credentials()


@asynccontextmanager
async def _lifespan(app: FastAPI):
    logger.info("FORGE calculator: %s", _CALCULATOR_INFO)
    if _FORGE_DATABASE_URL:
        await db_module.init_db_pool(_FORGE_DATABASE_URL)
    elif not _AUTH_DISABLED:
        # assert_startup_credentials() already enforced this at import time;
        # this branch should be unreachable outside of FORGE_AUTH_DISABLED=true.
        raise RuntimeError("FORGE_DATABASE_URL is not set.")
    yield
    await db_module.close_db_pool()


app = FastAPI(title="FORGE API Server", lifespan=_lifespan)

# Computed once at import time; the calculator defaults never change at runtime.
_CALCULATOR_INFO = forge.calculator_info()
_DEFAULTS_TEMPLATE = forge.get_defaults_template()
_DEFAULTS_ID = forge.get_defaults_id()

# --- Supabase JWT auth ---
_SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
_SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
_FORGE_DATABASE_URL = os.environ.get("FORGE_DATABASE_URL", "")
_AUTH_DISABLED = os.environ.get("FORGE_AUTH_DISABLED", "").strip().lower() == "true"
_security = HTTPBearer(auto_error=False)


async def require_auth(
    cred: HTTPAuthorizationCredentials | None = Depends(_security),
) -> dict:
    """Verify a Supabase JWT via `app.auth.verify_token`.

    Returns the decoded payload, or `{}` when auth is explicitly disabled
    for local dev (`FORGE_AUTH_DISABLED=true` and no `SUPABASE_URL`).
    """
    if not _SUPABASE_URL:
        if _AUTH_DISABLED:
            logger.warning("FORGE_AUTH_DISABLED=true: request served without auth.")
            return {}
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Auth not configured")
    if cred is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        return auth_module.verify_token(f"Bearer {cred.credentials}", supabase_url=_SUPABASE_URL)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))


def rate_limit_calculation(user: dict = Depends(require_auth)) -> dict:
    """Enforce the 30-calculations-a-minute limit for the authenticated user."""
    user_id = user.get("sub", "anonymous")
    if not auth_module.rate_limiter.allow_calculation(user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate_limited",
            headers={"Retry-After": "60"},
        )
    return user


app.add_middleware(GZipMiddleware, minimum_size=500)


class CacheBustMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/static/") and request.url.path.endswith(
            (".js", ".css")
        ):
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response


MAX_BODY_BYTES = 1 * 1024 * 1024  # 1 MB


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Rejects requests whose body exceeds MAX_BODY_BYTES with 413 `too_large`.

    Checks `Content-Length` first as a cheap fast path, then enforces the
    same limit while streaming the body, so a request without a
    `Content-Length` header can't bypass the check. The buffered body is
    cached back onto the request so downstream handlers reading it again
    (`await request.body()` / `.json()`) see the same bytes.
    """

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_BODY_BYTES:
                    return JSONResponse(status_code=413, content={"error": "too_large"})
            except ValueError:
                pass

        chunks: list[bytes] = []
        total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > MAX_BODY_BYTES:
                return JSONResponse(status_code=413, content={"error": "too_large"})
            chunks.append(chunk)
        request._body = b"".join(chunks)

        return await call_next(request)


app.add_middleware(CacheBustMiddleware)
app.add_middleware(BodySizeLimitMiddleware)

# No CORS middleware: the browser and the API are served from the same origin.

app.include_router(scenarios_module.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.exception_handler(scenarios_module.ScenarioAuthError)
async def _scenario_auth_error_handler(_request: Request, exc: scenarios_module.ScenarioAuthError) -> JSONResponse:
    """Format scenario-route auth failures in the `{"error": {...}}` envelope."""
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"error": {"code": "unauthenticated", "message": exc.message}},
    )


@app.get("/client-config.js")
async def client_config() -> Response:
    """Serve the browser's Supabase URL and publishable key from server env."""
    body = (
        f"window.FORGE_SUPABASE_URL = {json.dumps(_SUPABASE_URL)};\n"
        f"window.FORGE_SUPABASE_KEY = {json.dumps(_SUPABASE_ANON_KEY)};\n"
    )
    return Response(content=body, media_type="application/javascript")


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
    request: Request,
    payload: CalculateRequest,
    _user: dict = Depends(rate_limit_calculation),
) -> JSONResponse:
    """
    Resolve a change map against the deployed defaults and run the calculator.

    The client must send the `defaults_id` it last fetched; if the deployed
    calculator's defaults have since changed, this returns 409 along with the
    currently deployed `calculator_info()` so the client can refetch. Unknown
    or non-scalar change paths return 422 with the offending paths. User-fixable
    calculator errors return 422; internal failures return 500 with a request id.
    """
    request_id = str(uuid.uuid4())[:12]
    logger.debug("calculate %s %s", request_id, request.url.path)

    def _tagged(response: JSONResponse) -> JSONResponse:
        response.headers["X-Request-ID"] = request_id
        return response

    if payload.defaults_id != _DEFAULTS_ID:
        return _tagged(JSONResponse(status_code=409, content=sanitize_for_json(_CALCULATOR_INFO)))

    try:
        resolved_inputs = forge.resolve_inputs(payload.changes)
    except UnknownInputPath as exc:
        return _tagged(JSONResponse(status_code=422, content={"paths": exc.paths}))

    scenario_id = payload.scenario_id or datetime.now().strftime("%b %d %Y %H.%M.%S")

    loop = asyncio.get_event_loop()
    try:
        results = await asyncio.wait_for(
            loop.run_in_executor(
                _calc_pool,
                lambda: forge.run_calculation(resolved_inputs, scenario_id=scenario_id),
            ),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        return _tagged(JSONResponse(
            status_code=503,
            content={"error": {"code": "busy", "message": "All calculator workers are busy."}},
            headers={"Retry-After": "10"},
        ))
    except forge.InvalidInputs as exc:
        return _tagged(JSONResponse(
            status_code=422,
            content={"error": {"code": "invalid_inputs", "message": str(exc)}},
        ))
    except forge.CalculationError as exc:
        logger.error("CalculationError [%s]: %s", request_id, exc, exc_info=True)
        return _tagged(JSONResponse(
            status_code=500,
            content={"error": {"code": "calculation_failed", "message": f"Calculation failed (ref: {request_id})."}},
        ))

    response = JSONResponse(sanitize_for_json({
        "success": True,
        "scenario_id": scenario_id,
        "timestamp": results.get("timestamp", datetime.now().isoformat()),
        "results": results,
        "error": None,
    }))
    response.headers["X-Request-ID"] = request_id
    return response


if __name__ == "__main__":
    try:
        import uvicorn
    except ModuleNotFoundError as exc:  # pragma: no cover - convenience only
        raise SystemExit("Install uvicorn to run with `python -m app.main`.") from exc

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
