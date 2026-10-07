"""FastAPI application that accepts calculator-relative changes, runs FORGE calculations, and returns JSON."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import time
import uuid
import weakref
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import UTC, datetime
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
_CALC_ACQUIRE_TIMEOUT = 30.0
_SLOW_CALC_SECONDS = 10.0
_calc_pool = ThreadPoolExecutor(max_workers=FORGE_CALC_WORKERS)
# One semaphore per running loop. A module-level Semaphore binds to the first
# loop that acquires it, and this process serves both TestClient and anyio.
_calc_semaphores: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
    weakref.WeakKeyDictionary()
)


def _calc_semaphore() -> asyncio.Semaphore:
    """Gate of FORGE_CALC_WORKERS slots on the current event loop."""
    loop = asyncio.get_running_loop()
    try:
        return _calc_semaphores[loop]
    except KeyError:
        sem = asyncio.Semaphore(FORGE_CALC_WORKERS)
        _calc_semaphores[loop] = sem
        return sem


BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
LANDING_FILE = STATIC_DIR / "landing.html"
SIGNUP_FILE = STATIC_DIR / "signup.html"
LOGIN_FILE = STATIC_DIR / "login.html"
HOME_FILE = STATIC_DIR / "home.html"
WORKSPACE_FILE = STATIC_DIR / "workspace.html"
SCENARIOS_FILE = STATIC_DIR / "scenarios-manager.html"

# React frontend (all page routes: /, /signup, /login, /app, /app/workspace, /app/scenarios-manager)
REACT_DIST = BASE_DIR / "frontend" / "dist"
REACT_INDEX = REACT_DIST / "index.html"

# Fail closed: refuse to start without SUPABASE_URL + FORGE_DATABASE_URL,
# unless FORGE_AUTH_DISABLED=true is set explicitly for local dev.
auth_module.assert_startup_credentials()

_health_ready = False
_RENDER_GIT_COMMIT = os.environ.get("RENDER_GIT_COMMIT")


def _load_self_test_scenario() -> dict:
    """Load the Laredo case study used by the startup self-test."""
    scenarios_dir = forge.get_scenarios_path()
    laredo_path = scenarios_dir / "AEP_LRGV_Laredo_NewBuild.forge"
    with open(laredo_path) as f:
        return json.load(f)


async def _startup_self_test() -> None:
    """Run one case study and optionally ping the database. Sets _health_ready."""
    global _health_ready
    try:
        doc = _load_self_test_scenario()
        changes = forge.diff_changes(doc["inputs"])
        resolved = forge.resolve_inputs(changes)
        results = forge.run_calculation(resolved, scenario_id="self-test")
        assert results.get("provenance"), "Self-test: missing provenance"
        bcr = results.get("bcr", {})
        assert any(
            k.startswith("bcr_") and isinstance(v, (int, float)) and math.isfinite(v)
            for k, v in bcr.items()
        ), "Self-test: no finite BCR"

        if _FORGE_DATABASE_URL:
            pool = db_module.get_db_pool()
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            logger.info("Self-test: database OK")

        _health_ready = True
        logger.info("Self-test: passed")
    except Exception:
        logger.exception("Self-test: FAILED — /api/health will return 503")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    logger.info("FORGE calculator: %s", _CALCULATOR_INFO)
    if _FORGE_DATABASE_URL:
        await db_module.init_db_pool(_FORGE_DATABASE_URL)
    elif not _AUTH_DISABLED:
        # assert_startup_credentials() already enforced this at import time;
        # this branch should be unreachable outside of FORGE_AUTH_DISABLED=true.
        raise RuntimeError("FORGE_DATABASE_URL is not set.")
    await _startup_self_test()
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


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Emit one JSON log line per request; set X-Request-ID on every response."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:12]
        request.state.request_id = request_id
        t0 = time.monotonic()

        response = await call_next(request)

        elapsed_ms = (time.monotonic() - t0) * 1000
        user_id = getattr(request.state, "user_id", None)
        inputs_id = getattr(request.state, "inputs_id", None)
        log_entry = {
            "time": datetime.now(UTC).isoformat(),
            "level": "INFO",
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round(elapsed_ms, 1),
        }
        if user_id:
            log_entry["user_id"] = user_id
        if inputs_id:
            log_entry["inputs_id"] = inputs_id

        logger.info(json.dumps(log_entry))
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestLoggingMiddleware)
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
# Phase 1 note: if the React frontend is served from a different origin,
# add CORSMiddleware with allow_origins=[<react_app_url>],
# allow_methods=["GET","POST","PATCH","DELETE"],
# allow_headers=["Authorization","Content-Type"].

app.include_router(scenarios_module.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# React built assets (JS/CSS bundles from Vite)
if REACT_DIST.exists() and (REACT_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(REACT_DIST / "assets")), name="react-assets")


@app.exception_handler(scenarios_module.ScenarioAuthError)
async def _scenario_auth_error_handler(_request: Request, exc: scenarios_module.ScenarioAuthError) -> JSONResponse:
    """Format scenario-route auth failures in the `{"error": {...}}` envelope."""
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"error": {"code": "unauthenticated", "message": exc.message}},
    )


# Phase 1: replaced by VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# environment variables at React build time.
@app.get("/client-config.js")
async def client_config() -> Response:
    """Serve the browser's Supabase URL and publishable key from server env."""
    body = (
        f"window.FORGE_SUPABASE_URL = {json.dumps(_SUPABASE_URL)};\n"
        f"window.FORGE_SUPABASE_KEY = {json.dumps(_SUPABASE_ANON_KEY)};\n"
    )
    return Response(content=body, media_type="application/javascript")


# --- Page-serving routes (Phase 1: replaced by React static hosting) --------
# These routes serve static HTML files and will be removed when the React
# frontend is deployed. The React app will be served as static files.
@app.get("/", response_class=FileResponse)
async def serve_landing() -> FileResponse:
    """Serve the landing page (React if built, vanilla fallback)."""
    if REACT_INDEX.exists():
        return FileResponse(REACT_INDEX)
    return FileResponse(LANDING_FILE)


@app.get("/signup", response_class=FileResponse)
async def serve_signup() -> FileResponse:
    """Serve the signup page (React if built, vanilla fallback)."""
    if REACT_INDEX.exists():
        return FileResponse(REACT_INDEX)
    return FileResponse(SIGNUP_FILE)


@app.get("/login", response_class=FileResponse)
async def serve_login() -> FileResponse:
    """Serve the login page (React if built, vanilla fallback)."""
    if REACT_INDEX.exists():
        return FileResponse(REACT_INDEX)
    return FileResponse(LOGIN_FILE)


@app.get("/app", response_class=FileResponse)
async def serve_home() -> FileResponse:
    """Serve the FORGE home page (React if built, vanilla fallback)."""
    if REACT_INDEX.exists():
        return FileResponse(REACT_INDEX)
    return FileResponse(HOME_FILE)


@app.get("/app/workspace", response_class=FileResponse)
async def serve_workspace() -> FileResponse:
    """Serve the FORGE workspace (React if built, vanilla fallback)."""
    if REACT_INDEX.exists():
        return FileResponse(REACT_INDEX)
    return FileResponse(WORKSPACE_FILE)


@app.get("/app/scenarios-manager", response_class=FileResponse)
async def serve_scenarios_manager() -> FileResponse:
    """Serve the scenario manager (React if built, vanilla fallback)."""
    if REACT_INDEX.exists():
        return FileResponse(REACT_INDEX)
    return FileResponse(SCENARIOS_FILE)


@app.get("/api/health", response_class=JSONResponse)
async def health() -> JSONResponse:
    """Health check for Render. 503 until the self-test passes."""
    body = {
        "status": "ok" if _health_ready else "starting",
        "app_commit": _RENDER_GIT_COMMIT,
        "calculator": _CALCULATOR_INFO,
    }
    if not _health_ready:
        return JSONResponse(status_code=503, content=sanitize_for_json(body))
    return JSONResponse(content=sanitize_for_json(body))


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
    A 503 means every worker stayed busy for 30 seconds. A calculation that
    has taken a slot runs to completion.
    """
    request_id = request.state.request_id
    user_id = _user.get("sub")
    if user_id:
        request.state.user_id = user_id
    logger.debug("calculate %s %s", request_id, request.url.path)

    if payload.defaults_id != _DEFAULTS_ID:
        return JSONResponse(status_code=409, content=sanitize_for_json(_CALCULATOR_INFO))

    try:
        resolved_inputs = forge.resolve_inputs(payload.changes)
    except UnknownInputPath as exc:
        return JSONResponse(status_code=422, content={"paths": exc.paths})

    scenario_id = payload.scenario_id or datetime.now(UTC).strftime("%b %d %Y %H.%M.%S")

    sem = _calc_semaphore()
    try:
        await asyncio.wait_for(sem.acquire(), timeout=_CALC_ACQUIRE_TIMEOUT)
    except TimeoutError:
        return JSONResponse(
            status_code=503,
            content={"error": {"code": "busy", "message": "All calculator workers are busy."}},
            headers={"Retry-After": "10"},
        )

    try:
        loop = asyncio.get_running_loop()
        t0 = time.monotonic()
        try:
            results = await loop.run_in_executor(
                _calc_pool,
                lambda: forge.run_calculation(resolved_inputs, scenario_id=scenario_id),
            )
        finally:
            elapsed = time.monotonic() - t0
            if elapsed > _SLOW_CALC_SECONDS:
                logger.warning("Calculation took %.1fs [%s]", elapsed, request_id)
    except forge.InvalidInputs as exc:
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "invalid_inputs", "message": str(exc)}},
        )
    except forge.CalculationError:
        logger.exception("CalculationError [%s]", request_id)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "calculation_failed", "message": f"Calculation failed (ref: {request_id})."}},
        )
    finally:
        sem.release()

    inputs_id = (results.get("provenance") or {}).get("inputs_id")
    if inputs_id:
        request.state.inputs_id = inputs_id

    return JSONResponse(sanitize_for_json({
        "success": True,
        "scenario_id": scenario_id,
        "timestamp": results.get("timestamp", datetime.now(UTC).isoformat()),
        "results": results,
        "error": None,
    }))


if __name__ == "__main__":
    try:
        import uvicorn
    except ModuleNotFoundError as exc:  # pragma: no cover - convenience only
        raise SystemExit("Install uvicorn to run with `python -m app.main`.") from exc

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
