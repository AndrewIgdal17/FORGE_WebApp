"""FastAPI application that accepts JSON, runs FORGE calculations, and returns JSON."""

from __future__ import annotations

import asyncio
import json
import os
import yaml
from json import JSONDecodeError
from pathlib import Path
from typing import Any, Dict

import jwt
from jwt import PyJWKClient
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware

from .forge_processor import run_forge_calculation
from .models import (
    FORGEInputPayload,
    FORGEOutputPayload,
    sanitize_for_json,
)
from .fuel_mix_presets import load_fuel_mix_presets

from forge.data import get_yamls_path

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
JSON_DIR = BASE_DIR / "json"
OUTPUTS_DIR = BASE_DIR / "outputs"
YAMLS_DIR = get_yamls_path()
LANDING_FILE = STATIC_DIR / "landing.html"
SIGNUP_FILE = STATIC_DIR / "signup.html"
LOGIN_FILE = STATIC_DIR / "login.html"
HOME_FILE = STATIC_DIR / "home.html"
WORKSPACE_FILE = STATIC_DIR / "workspace.html"
SCENARIOS_FILE = STATIC_DIR / "scenarios-manager.html"
FINAL_COMBINED_FILE = JSON_DIR / "final_combined.json"
PRESERVED_JSON_NAMES = frozenset(
    {FINAL_COMBINED_FILE.name, "fuel_mix_presets.json"}
)
SKIP_BASENAME = "project_category_template"

app = FastAPI(title="FORGE API Server")

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


def _refresh_final_combined() -> None:
    """Regenerate final_combined.json from current YAML inputs."""
    if not YAMLS_DIR.exists():
        return

    JSON_DIR.mkdir(parents=True, exist_ok=True)
    combined: Dict[str, Any] = {}

    yaml_files = sorted(list(YAMLS_DIR.glob("*.yaml")) + list(YAMLS_DIR.glob("*.yml")))
    yaml_stems = {yaml_file.stem for yaml_file in yaml_files}

    # Remove stale JSON files that no longer have YAML sources.
    for json_file in JSON_DIR.glob("*.json"):
        if json_file.name in PRESERVED_JSON_NAMES:
            continue
        if json_file.stem not in yaml_stems:
            json_file.unlink()

    for yaml_file in yaml_files:
        with yaml_file.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)

        json_path = JSON_DIR / f"{yaml_file.stem}.json"
        with json_path.open("w", encoding="utf-8") as json_handle:
            json.dump(data, json_handle, indent=2)
            json_handle.write("\n")

        if yaml_file.stem != SKIP_BASENAME:
            combined[yaml_file.stem] = data

    with FINAL_COMBINED_FILE.open("w", encoding="utf-8") as handle:
        json.dump(combined, handle, separators=(",", ":"))
        handle.write("\n")


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


_final_combined_cache: dict | None = None
_final_combined_mtime: float = 0.0


def _get_yaml_max_mtime() -> float:
    """Return the newest mtime across all YAML files in YAMLS_DIR."""
    if not YAMLS_DIR.exists():
        return 0.0
    mtimes = [f.stat().st_mtime for f in YAMLS_DIR.iterdir()
              if f.suffix in (".yaml", ".yml")]
    return max(mtimes) if mtimes else 0.0


def _get_final_combined_cached() -> dict:
    """Return cached final_combined data, refreshing only when YAML files change."""
    global _final_combined_cache, _final_combined_mtime
    current_mtime = _get_yaml_max_mtime()
    if _final_combined_cache is None or current_mtime > _final_combined_mtime:
        try:
            _refresh_final_combined()
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to regenerate final_combined.json: {exc}",
            ) from exc
        if not FINAL_COMBINED_FILE.exists():
            raise HTTPException(status_code=404, detail="final_combined.json not found")
        try:
            _final_combined_cache = sanitize_for_json(
                json.loads(FINAL_COMBINED_FILE.read_text(encoding="utf-8")))
            _final_combined_mtime = current_mtime
        except JSONDecodeError as exc:
            raise HTTPException(
                status_code=500, detail="final_combined.json is invalid JSON"
            ) from exc
    return _final_combined_cache


@app.get("/api/final_combined", response_class=JSONResponse)
async def get_final_combined() -> JSONResponse:
    """Return the combined JSON payload generated from YAML files."""
    return JSONResponse(_get_final_combined_cached())


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


@app.get("/api/fuel_mix_presets", response_class=JSONResponse)
async def get_fuel_mix_presets() -> JSONResponse:
    """Reference grid_mix presets for the web UI (file-backed catalog)."""
    data = load_fuel_mix_presets()
    return JSONResponse(sanitize_for_json(data))


@app.post("/api/forge/calculate", response_model=FORGEOutputPayload)
async def calculate_forge(
    payload: FORGEInputPayload,
    _user: dict = Depends(require_auth),
) -> FORGEOutputPayload:
    """
    Run FORGE calculations with JSON input and output.

    Accepts a JSON payload, runs the calculator in-process,
    and returns the calculation results as JSON.
    """
    payload_dict = payload.model_dump()
    if payload_dict.get("input_mode") == "json" and not payload_dict.get("combined_data"):
        payload_dict["combined_data"] = _get_final_combined_cached()

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, run_forge_calculation, payload_dict)
    return FORGEOutputPayload.model_validate(result)


@app.get("/api/outputs/{filename}")
async def get_output_file(filename: str, download: bool = False):
    """
    Serve CSV output files from the outputs directory.

    Args:
        filename: Name of the CSV file to retrieve
        download: If True, forces download; if False, displays inline (default)

    Returns:
        FileResponse with CSV content
    """
    # Security: only allow CSV files and prevent directory traversal
    if not filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")

    if '/' in filename or '\\' in filename or '..' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = OUTPUTS_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Invalid file")

    # Return file with appropriate headers
    # When download=True, browser will download the file
    # When download=False, browser will display inline (for preview)
    headers = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'

    return FileResponse(
        path=file_path,
        media_type="text/csv",
        filename=filename,
        headers=headers
    )


if __name__ == "__main__":
    try:
        import uvicorn
    except ModuleNotFoundError as exc:  # pragma: no cover - convenience only
        raise SystemExit("Install uvicorn to run with `python -m app.main`.") from exc

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
