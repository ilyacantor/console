"""Tests for pipeline endpoints."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def _mock_farm_response():
    return httpx.Response(200, json={
        "run_id": "test-run-123",
        "status": "completed",
        "entity_count": 1,
        "entities": ["meridian"],
    })


def _mock_farm_status_idle():
    return httpx.Response(200, json={
        "status": "idle",
        "run_id": "test-run-123",
        "error": None,
        "push_result": {"total_triples": 9350},
    })


def _mock_dcl_overview():
    return httpx.Response(200, json={
        "total_triples": 9350,
        "count": 9350,
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
    """SE pipeline calls Farm generate then DCL verify."""

    async def mock_post(url, **kwargs):
        if "generate-multi-entity-triples" in url:
            return _mock_farm_response()
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        if "generation-status" in url:
            return _mock_farm_status_idle()
        if "triples/overview" in url:
            return _mock_dcl_overview()
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_run = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["meridian"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["mode"] == "SE"
    assert data["status"] == "pass"
    assert len(data["steps"]) == 2

    assert data["steps"][0]["name"] == "farm_gen"
    assert data["steps"][0]["status"] == "success"
    assert data["steps"][1]["name"] == "dcl_verify"
    assert data["steps"][1]["status"] == "success"

    for step in data["steps"]:
        assert step["duration_s"] is not None
        assert step["duration_s"] >= 0

    assert data["total_duration_s"] is not None
    assert data["total_triples"] is not None


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_run_me_pipeline(mock_client_cls, mock_db):
    """ME pipeline has Farm gen + DCL verify + COFA steps."""

    async def mock_post(url, **kwargs):
        if "generate-multi-entity-triples" in url:
            return _mock_farm_response()
        if "cofa-chat" in url:
            return httpx.Response(200, json={"response": "COFA complete"})
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        if "generation-status" in url:
            return _mock_farm_status_idle()
        if "triples/overview" in url:
            return _mock_dcl_overview()
        if "engagements" in url:
            return httpx.Response(200, json={
                "engagements": [{"engagement_id": "eng-1", "state": "active"}]
            })
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_run = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "mode": "ME",
        "entities": ["meridian", "cascadia"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["mode"] == "ME"
    assert data["status"] == "pass"
    assert len(data["steps"]) == 3

    assert data["steps"][0]["name"] == "farm_gen"
    assert data["steps"][1]["name"] == "dcl_verify"
    assert data["steps"][2]["name"] == "cofa_unification"


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_pipeline_stops_on_failure(mock_client_cls, mock_db):
    """When Farm fails, pipeline stops and returns partial result."""

    async def mock_post(url, **kwargs):
        if "generate-multi-entity-triples" in url:
            return httpx.Response(500, json={"detail": "Internal server error"})
        return httpx.Response(200, json={})

    async def mock_get(url, **kwargs):
        return httpx.Response(200, json={})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_run = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["meridian"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "fail"
    assert data["steps"][0]["status"] == "failed"
    assert data["steps"][0]["error"] is not None
    assert data["steps"][1]["status"] == "pending"


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_pipeline_farm_connection_error(mock_client_cls, mock_db):
    """When Farm is unreachable, step shows connection error."""

    async def mock_post(url, **kwargs):
        raise httpx.ConnectError("Connection refused")

    mock_client = _make_mock_client(mock_post, AsyncMock())
    mock_client_cls.return_value = mock_client
    mock_db.save_run = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["meridian"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "fail"
    assert data["steps"][0]["status"] == "failed"
    assert "connection refused" in data["steps"][0]["error"].lower()


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


@patch("backend.app.db.get_runs")
def test_get_runs(mock_get_runs):
    """GET /runs returns recent pipeline runs."""
    mock_get_runs.return_value = [
        {
            "run_id": "abc-123",
            "mode": "SE",
            "entity_ids": ["meridian"],
            "steps": [],
            "total_duration_s": 3.2,
            "total_triples": 9350,
            "status": "pass",
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
