"""Concurrent calculate requests all return correct results."""
import asyncio
import json

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

import forge

SCENARIOS_DIR = forge.get_scenarios_path()


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_concurrent_calculations():
    """8 simultaneous requests, one per case study, all succeed."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        tasks = []
        for forge_file in sorted(SCENARIOS_DIR.glob("*.forge")):
            with open(forge_file) as f:
                doc = json.load(f)
            changes = forge.diff_changes(doc["inputs"])

            async def do_request(ch=changes, name=forge_file.stem):
                resp = await client.post("/api/forge/calculate", json={
                    "defaults_id": forge.get_defaults_id(),
                    "changes": ch,
                    "scenario_id": name,
                })
                return name, resp

            tasks.append(do_request())

        results = await asyncio.gather(*tasks)
        for name, resp in results:
            assert resp.status_code == 200, f"{name}: {resp.text}"
            body = resp.json()
            assert body["success"] is True
            assert body["results"]["provenance"]["inputs_id"]
            assert resp.headers["x-request-id"]
