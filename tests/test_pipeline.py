"""Tests for pipeline endpoints."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def _farm_manifest_response(rows: int = 9350):
    return httpx.Response(200, json={
        "status": "completed",
        "rows_generated": rows,
        "push_result": {"rows_accepted": rows, "batch_count": (rows + 999) // 1000},
    })


def _dcl_overview_response(total: int = 9350):
    return httpx.Response(200, json={
        "total_triples": total,
        "count": total,
    })


def _make_mock_client(post_fn, get_fn):
    """Create a properly configured async mock httpx client."""
    mock_client = AsyncMock()
    mock_client.post = post_fn
    mock_client.get = get_fn
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_run_se_pipeline(mock_client_cls, mock_db):
    """SE pipeline runs 6 steps: snapshot → AOD discovery → handoff → AAM → financials → complete."""

    async def mock_post(url, **kwargs):
        if "/api/snapshots" in url:
            return httpx.Response(200, json={
                "snapshot_id": "snap-123", "tenant_id": "meridian"
            })
        if "/api/runs/from-farm" in url:
            return httpx.Response(200, json={
                "run_id": "run-123", "counts": {"assets_admitted": 5}
            })
        if "/api/handoff/aam/export" in url:
            return httpx.Response(200, json={"candidates_sent": 3})
        if "/api/aam/infer" in url:
            return httpx.Response(200, json={"pipes_created": 3})
        if "/api/farm/manifest-intake" in url:
            return _farm_manifest_response()
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["meridian"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["pipeline_mode"] == "se"
    assert data["status"] == "completed"
    assert len(data["steps"]) == 6

    assert data["steps"][0]["name"] == "farm_snapshot"
    assert data["steps"][0]["status"] == "success"
    assert data["steps"][1]["name"] == "aod_discovery"
    assert data["steps"][1]["status"] == "success"
    assert data["steps"][4]["name"] == "farm_financials"
    assert data["steps"][4]["status"] == "success"
    assert data["steps"][5]["name"] == "complete"
    assert data["steps"][5]["status"] == "success"

    for step in data["steps"]:
        assert step["duration_ms"] is not None
        assert step["duration_ms"] >= 0


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_run_me_pipeline(mock_client_cls, mock_db):
    """ME pipeline runs 5 steps: financials A∥B → DCL verify → COFA → complete."""

    async def mock_post(url, **kwargs):
        if "/api/farm/manifest-intake" in url:
            return _farm_manifest_response()
        if "/api/maestra/cofa-chat" in url:
            return httpx.Response(200, json={"response": "COFA complete"})
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        if "/api/dcl/triples/overview" in url:
            return _dcl_overview_response()
        if "/api/maestra/engagements" in url:
            return httpx.Response(200, json={
                "engagements": [{"engagement_id": "eng-1", "state": "active"}]
            })
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "mode": "ME",
        "entities": ["meridian", "cascadia"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["pipeline_mode"] == "me"
    assert data["status"] == "completed"
    assert len(data["steps"]) == 5

    assert data["steps"][0]["name"] == "farm_financials_a"
    assert data["steps"][1]["name"] == "farm_financials_b"
    assert data["steps"][2]["name"] == "dcl_ingest"
    assert data["steps"][3]["name"] == "cofa_unification"
    assert data["steps"][4]["name"] == "complete"

    for step in data["steps"]:
        assert step["status"] == "success"


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

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["meridian"],
    })
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

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["meridian"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "completed_with_errors"
    assert data["steps"][0]["status"] == "failed"
    assert "connection refused" in data["steps"][0]["message"].lower()


def test_me_requires_two_entities():
    """ME mode requires at least 2 entities."""
    resp = client.post("/api/pipeline/run", json={
        "mode": "ME",
        "entities": ["meridian"],
    })
    assert resp.status_code == 400


def test_invalid_mode():
    """Invalid mode returns validation error."""
    resp = client.post("/api/pipeline/run", json={
        "mode": "INVALID",
        "entities": ["meridian"],
    })
    assert resp.status_code == 422


@patch("backend.app.db.get_pipeline_jobs")
def test_get_runs(mock_get_pipeline_jobs):
    """GET /runs returns recent pipeline runs."""
    mock_get_pipeline_jobs.return_value = [
        {
            "run_id": "abc-123",
            "pipeline_mode": "se",
            "entity_ids": ["meridian"],
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
    assert data["runs"][0]["run_id"] == "abc-123"


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
