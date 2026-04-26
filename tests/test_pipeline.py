"""Tests for pipeline endpoints (SE-only)."""

from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def _farm_manifest_response(rows: int = 9350):
    return httpx.Response(200, json={
        "status": "completed",
        "rows_generated": rows,
        "push_result": {"rows_accepted": rows, "batch_count": (rows + 999) // 1000},
    })


def _make_mock_client(post_fn, get_fn):
    """Create a properly configured async mock httpx client."""
    mock_client = AsyncMock()
    mock_client.post = post_fn
    mock_client.get = get_fn
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


def _json_response(url: str, method: str, status: int, payload) -> httpx.Response:
    """Build a mock httpx.Response with a bound request so raise_for_status() works."""
    return httpx.Response(
        status,
        json=payload,
        request=httpx.Request(method, url),
    )


def _verify_nlq_get_mock(url: str):
    """Success response for NLQ verify step GETs. Returns None if no match."""
    if "/api/v1/pipeline/status" in url:
        return _json_response(url, "GET", 200, {
            "dcl_connected": True,
            "metric_count": 12,
            "last_dcl_ingest_id": "dcl-ingest-001",
        })
    if "/api/v1/schema" in url:
        return _json_response(url, "GET", 200, {
            "metrics": ["revenue", "ebitda", "net_income"],
            "periods": ["2025-Q1", "2025-Q2"],
        })
    return None


def _verify_nlq_post_mock(url: str):
    """Success response for NLQ verify step POST /query. Returns None if no match."""
    if "/api/v1/query" in url:
        return _json_response(url, "POST", 200, {
            "success": True,
            "data_source": "dcl",
            "value": 1_234_567.89,
            "answer": "$1.23M",
        })
    return None


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_run_se_pipeline(mock_client_cls, mock_db):
    """SE pipeline runs 7 steps: snapshot → AOD discovery → handoff → AAM → financials → nlq_data_visible → complete."""

    async def mock_post(url, **kwargs):
        if "/api/snapshots" in url:
            return httpx.Response(200, json={
                "farm_manifest_id": "snap-123", "tenant_id": "test-tenant",
                "entity_id": "test-entity",
            })
        if "/api/runs/from-farm" in url:
            return httpx.Response(200, json={
                "aod_discovery_id": "aod-123", "counts": {"assets_admitted": 5}
            })
        if "/api/handoff/aam/export" in url:
            return httpx.Response(200, json={
                "candidates_sent": 3, "handoff_id": "handoff-123",
            })
        if "/api/aam/infer" in url:
            return httpx.Response(200, json={
                "pipes_created": 3, "aam_inference_id": "aam-123",
            })
        if "/api/farm/manifest-intake" in url:
            return _farm_manifest_response()
        if (m := _verify_nlq_post_mock(url)) is not None:
            return m
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        if (m := _verify_nlq_get_mock(url)) is not None:
            return m
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()

    resp = client.post("/api/pipeline/run", json={})
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "completed"
    assert len(data["steps"]) == 7

    # Verify pipeline_run_id is a full UUID (36 chars with hyphens)
    assert len(data["pipeline_run_id"]) == 36
    assert "-" in data["pipeline_run_id"]

    # Verify run_name is present
    assert data["run_name"]

    assert data["steps"][0]["name"] == "farm_snapshot"
    assert data["steps"][0]["status"] == "success"
    assert data["steps"][1]["name"] == "aod_discovery"
    assert data["steps"][1]["status"] == "success"
    assert data["steps"][4]["name"] == "farm_financials"
    assert data["steps"][4]["status"] == "success"
    assert data["steps"][5]["name"] == "nlq_data_visible"
    assert data["steps"][5]["status"] == "success"
    assert data["steps"][6]["name"] == "complete"
    assert data["steps"][6]["status"] == "success"

    # Verify step.data carries provenance (I2: identity pair required)
    verify_step = data["steps"][5]
    assert verify_step["data"]["tenant_id"]
    assert verify_step["data"]["entity_id"]
    assert verify_step["data"]["run_name"]
    assert len(verify_step["data"]["checks"]) == 3

    for step in data["steps"]:
        assert step["duration_ms"] is not None
        assert step["duration_ms"] >= 0


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_pipeline_stops_on_failure(mock_client_cls, mock_db):
    """When Farm Snapshot fails, pipeline stops and returns completed_with_errors."""

    async def mock_post(url, **kwargs):
        if "/api/snapshots" in url:
            return httpx.Response(500, json={"detail": "Internal server error"})
        return httpx.Response(200, json={})

    async def mock_get(url, **kwargs):
        return httpx.Response(200, json={})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()

    resp = client.post("/api/pipeline/run", json={})
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "completed_with_errors"
    assert data["steps"][0]["status"] == "failed"
    assert data["steps"][0]["message"] is not None
    assert data["steps"][1]["status"] == "pending"


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_pipeline_farm_connection_error(mock_client_cls, mock_db):
    """When Farm is unreachable, Farm Snapshot step shows connection error."""

    async def mock_post(url, **kwargs):
        raise httpx.ConnectError("Connection refused")

    mock_client = _make_mock_client(mock_post, AsyncMock())
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()

    resp = client.post("/api/pipeline/run", json={})
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "completed_with_errors"
    assert data["steps"][0]["status"] == "failed"
    assert "connection refused" in data["steps"][0]["message"].lower()


@patch("backend.app.db.get_pipeline_jobs")
def test_get_runs(mock_get_pipeline_jobs):
    """GET /runs returns recent pipeline runs."""
    mock_get_pipeline_jobs.return_value = [
        {
            "pipeline_run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "run_name": "TestEntity-a1b2",
            "steps": [],
            "status": "completed",
            "created_at": "2026-03-25T00:00:00",
        }
    ]

    resp = client.get("/api/pipeline/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert "runs" in data
    assert len(data["runs"]) == 1
    assert data["runs"][0]["pipeline_run_id"] == "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    assert data["runs"][0]["run_name"] == "TestEntity-a1b2"


def test_pipeline_reset():
    """POST /reset returns ok."""
    resp = client.post("/api/pipeline/reset")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@patch("backend.app.db.get_config")
def test_get_baselines(mock_get_config):
    """GET /config/baselines returns baseline values."""
    mock_get_config.return_value = {"farm_gen": 2, "dcl_verify": 2}

    resp = client.get("/api/pipeline/config/baselines")
    assert resp.status_code == 200
    data = resp.json()
    assert "baselines" in data
    assert data["baselines"]["farm_gen"] == 2


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_se_pipeline_threads_namespaced_ids(mock_client_cls, mock_db):
    """SE pipeline threads namespaced IDs: farm_manifest_id → aod_discovery_id → handoff_id → aam_inference_id."""

    captured_bodies: dict[str, dict] = {}

    async def mock_post(url, **kwargs):
        body = kwargs.get("json", {})
        if "/api/snapshots" in url:
            captured_bodies["snapshot"] = body
            return httpx.Response(200, json={
                "farm_manifest_id": "farm-snap-001",
                "entity_id": "test-entity",
                "tenant_id": "test-tenant",
            })
        if "/api/runs/from-farm" in url:
            captured_bodies["discovery"] = body
            return httpx.Response(200, json={
                "aod_discovery_id": "aod-disc-001",
                "counts": {"assets_admitted": 5},
            })
        if "/api/handoff/aam/export" in url:
            captured_bodies["handoff"] = kwargs.get("params", {})
            return httpx.Response(200, json={
                "handoff_id": "handoff-001",
                "candidates_sent": 3,
            })
        if "/api/aam/infer" in url:
            captured_bodies["aam"] = body
            return httpx.Response(200, json={
                "aam_inference_id": "aam-inf-001",
                "source_handoff_id": "handoff-001",
                "pipes_created": 3,
            })
        if "/api/farm/manifest-intake" in url:
            captured_bodies["financials"] = body
            return _farm_manifest_response()
        if (m := _verify_nlq_post_mock(url)) is not None:
            return m
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        if (m := _verify_nlq_get_mock(url)) is not None:
            return m
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "config": {"entity_id": "test-entity"},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"

    # Verify farm_manifest_id threaded to AOD discovery
    assert captured_bodies["discovery"]["snapshot_id"] == "farm-snap-001"
    assert captured_bodies["discovery"]["tenant_id"] is not None
    assert captured_bodies["discovery"]["entity_id"] == "test-entity"

    # Verify aod_discovery_id threaded to handoff
    assert captured_bodies["handoff"]["aod_discovery_id"] == "aod-disc-001"

    # Verify handoff_id threaded to AAM
    assert captured_bodies["aam"]["handoff_id"] == "handoff-001"

    # Verify farm_manifest_id threaded to financials + triples_id present
    assert captured_bodies["financials"]["farm_manifest_id"] == "farm-snap-001"
    assert "triples_id" in captured_bodies["financials"]["target"]
