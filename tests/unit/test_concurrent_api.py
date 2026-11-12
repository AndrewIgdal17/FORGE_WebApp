"""Concurrent calculate requests all return correct results."""
import asyncio
import json
import logging
import threading
import time

import forge
import pytest
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from app.layer_releases import layer_releases
from app.main import FORGE_CALC_WORKERS, app

SCENARIOS_DIR = forge.get_scenarios_path()

# Austin to Dallas. RouteGeometry accepts it; analysis is stubbed below.
COVERED_ROUTE = {
    "type": "MultiLineString",
    "coordinates": [[[-97.74, 30.27], [-97.10, 31.50], [-96.80, 32.78]]],
}

ACRE_PATHS = (
    "02_project_physical_details.terrain.protected_area_acres.forested",
    "02_project_physical_details.terrain.protected_area_acres.scrubbed_flat",
    "02_project_physical_details.terrain.protected_area_acres.desert_barren",
    "02_project_physical_details.terrain.protected_area_acres.rolling_hills",
    "02_project_physical_details.terrain.protected_area_acres.mountain",
)


def _with_acres(changes: dict) -> dict:
    """Explicit zeros so a case study can run. The bundled files omit acres."""
    runnable = dict(changes)
    runnable.update({path: 0.0 for path in ACRE_PATHS})
    return runnable


def _scenario_changes():
    """Load case-study diffs outside the async test so file IO stays synchronous."""
    cases = []
    for forge_file in sorted(SCENARIOS_DIR.glob("*.forge")):
        doc = json.loads(forge_file.read_text())
        cases.append((forge_file.stem, _with_acres(forge.diff_changes(doc["inputs"]))))
    return cases


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def stub_route_analysis(monkeypatch):
    """Return empty measured changes so the request acres reach the workers."""

    async def fake_analysis(route, row_width_ft):
        return JSONResponse(
            status_code=200,
            content={
                "changes": {},
                "layer_releases": layer_releases([]),
            },
        )

    monkeypatch.setattr("app.route.run_route_analysis", fake_analysis)


@pytest.mark.anyio
async def test_concurrent_calculations():
    """One simultaneous request per case study, all succeed."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        tasks = []
        for name, changes in _scenario_changes():

            async def do_request(ch=changes, name=name):
                resp = await client.post("/api/forge/calculate", json={
                    "defaults_id": forge.get_defaults_id(),
                    "changes": ch,
                    "scenario_id": name,
                    "route": COVERED_ROUTE,
                    "row_width_ft": 100,
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


# v4.0.0 requires these before resolve_inputs will return a document.
REQUIRED_TO_CALCULATE = {
    "01_project_technical_details.project.capacity_mw": 500,
    "01_project_technical_details.project.value_of_load_per_mwh": 40,
    "01_project_technical_details.terminals.sending.gea": "CAISO",
    "01_project_technical_details.terminals.sending.egrid_subregion": "AZNM",
    "01_project_technical_details.terminals.sending.state": "AZ",
    "01_project_technical_details.terminals.receiving.gea": "CAISO",
    "01_project_technical_details.terminals.receiving.egrid_subregion": "AZNM",
    "01_project_technical_details.terminals.receiving.state": "AZ",
    "17_congestion_reductions.greenfield_congestion_reductions.constraints.flow_factor": 0.5,
    "17_congestion_reductions.greenfield_congestion_reductions.prices.average_congestion_price": 10,
}


def _payload(scenario_id: str) -> dict:
    changes = {path: 0.0 for path in ACRE_PATHS}
    changes.update(REQUIRED_TO_CALCULATE)
    return {
        "defaults_id": forge.get_defaults_id(),
        "changes": changes,
        "scenario_id": scenario_id,
        "route": COVERED_ROUTE,
        "row_width_ft": 100,
    }


@pytest.mark.anyio
async def test_slow_calculation_is_not_cancelled(monkeypatch, caplog):
    """The 30s limit is the wait for a free worker, not the run itself."""
    from app import main as main_mod

    monkeypatch.setattr(main_mod, "_CALC_ACQUIRE_TIMEOUT", 0.2)
    monkeypatch.setattr(main_mod, "_SLOW_CALC_SECONDS", 0.1)

    def slow(resolved, scenario_id=None):
        time.sleep(0.5)
        return {"timestamp": "t", "provenance": {"inputs_id": "slow"}}

    monkeypatch.setattr(forge, "run_calculation", slow)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=3.0) as client:
        with caplog.at_level(logging.WARNING, logger="app.main"):
            resp = await client.post("/api/forge/calculate", json=_payload("slow"))
    assert resp.status_code == 200, resp.text
    assert any("Calculation took" in record.message for record in caplog.records)


@pytest.mark.anyio
async def test_busy_is_the_wait_for_a_worker(monkeypatch):
    """503 when every slot stays taken. A running calculation still finishes."""
    from app import main as main_mod

    monkeypatch.setattr(main_mod, "_CALC_ACQUIRE_TIMEOUT", 0.4)
    release = threading.Event()
    entered = threading.Event()
    lock = threading.Lock()
    running = {"n": 0}

    def blocking(resolved, scenario_id=None):
        with lock:
            running["n"] += 1
            if running["n"] >= FORGE_CALC_WORKERS:
                entered.set()
        assert release.wait(timeout=5), "running calculation was abandoned"
        return {"timestamp": "t", "provenance": {"inputs_id": "held"}}

    monkeypatch.setattr(forge, "run_calculation", blocking)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=3.0) as client:
        holders = [
            asyncio.create_task(client.post("/api/forge/calculate", json=_payload(f"hold-{i}")))
            for i in range(FORGE_CALC_WORKERS)
        ]
        try:
            started = await asyncio.to_thread(entered.wait, 5)
            assert started, "workers never filled"
            busy = await client.post("/api/forge/calculate", json=_payload("overflow"))
            assert busy.status_code == 503, busy.text
            body = busy.json()
            assert body["error"]["code"] == "busy"
            assert body["error"]["message"]
            assert busy.headers["retry-after"] == "10"
        finally:
            release.set()
        held = await asyncio.gather(*holders)
    for resp in held:
        assert resp.status_code == 200, resp.text
