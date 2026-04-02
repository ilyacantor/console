"""Tests for health aggregation endpoint."""

import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_root_health():
    """Root /health returns simple status for Render."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "console"


@patch("backend.app.services.health_aggregator.httpx.AsyncClient")
def test_aggregated_health_all_up(mock_client_cls):
    """When all modules respond 200, overall is healthy."""
    mock_response = httpx.Response(200, json={"status": "ok"})
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client_cls.return_value = mock_client

    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["overall"] == "healthy"
    # 6 external modules + Console = 7
    assert data["total"] == 7
    assert data["up_count"] == 7
    assert len(data["services"]) == 7

    # Console is always up
    console_svc = next(s for s in data["services"] if s["name"] == "Console")
    assert console_svc["status"] == "up"


@patch("backend.app.services.health_aggregator.httpx.AsyncClient")
def test_aggregated_health_some_down(mock_client_cls):
    """When some modules fail, overall is degraded."""
    call_count = 0

    async def mock_get(url, **kwargs):
        nonlocal call_count
        call_count += 1
        # First two succeed, rest fail
        if call_count <= 2:
            return httpx.Response(200, json={"status": "ok"})
        raise httpx.ConnectError("Connection refused")

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client_cls.return_value = mock_client

    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    # 2 up + Console = 3 up out of 7
    assert data["overall"] == "degraded"
    assert data["up_count"] == 3

    down_services = [s for s in data["services"] if s["status"] == "down"]
    assert len(down_services) == 4
    for svc in down_services:
        assert "Connection refused" in svc["detail"]


@patch("backend.app.services.health_aggregator.httpx.AsyncClient")
def test_aggregated_health_timeout(mock_client_cls):
    """When a module times out, it shows as down."""
    async def mock_get(url, **kwargs):
        raise httpx.TimeoutException("timed out")

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client_cls.return_value = mock_client

    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["overall"] == "degraded"  # Console is up, others down

    for svc in data["services"]:
        if svc["name"] != "Console":
            assert svc["status"] == "down"
            assert "Timeout" in svc["detail"]


def test_health_response_structure():
    """Health response has required fields."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "services" in data
    assert "overall" in data
    assert "up_count" in data
    assert "total" in data

    for svc in data["services"]:
        assert "name" in svc
        assert "url" in svc
        assert "status" in svc
        assert svc["status"] in ("up", "degraded", "down")
        assert "response_time_s" in svc
