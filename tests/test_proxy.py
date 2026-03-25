"""Tests for module proxy routes."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


@patch("backend.app.routes.proxy.httpx.AsyncClient")
def test_proxy_dcl_get(mock_client_cls):
    """Proxy GET to DCL forwards request and returns response."""
    mock_response = httpx.Response(
        200,
        json={"total_triples": 9350, "count": 9350},
        headers={"content-type": "application/json"},
    )
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_client

    resp = client.get("/api/proxy/dcl/api/dcl/triples/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_triples"] == 9350


@patch("backend.app.routes.proxy.httpx.AsyncClient")
def test_proxy_passes_query_params(mock_client_cls):
    """Proxy passes query parameters through to the target module."""
    mock_response = httpx.Response(
        200,
        json={"ok": True},
        headers={"content-type": "application/json"},
    )
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_client

    resp = client.get("/api/proxy/dcl/api/dcl/reports/v2/bridge?entity_id=meridian")
    assert resp.status_code == 200

    # Verify the query params were passed
    call_args = mock_client.get.call_args
    assert "entity_id" in call_args.kwargs.get("params", {})


@patch("backend.app.routes.proxy.httpx.AsyncClient")
def test_proxy_connection_error_returns_502(mock_client_cls):
    """Proxy returns 502 when the target module is unreachable."""
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_client

    resp = client.get("/api/proxy/dcl/api/dcl/context")
    assert resp.status_code == 502
    data = resp.json()
    assert "Connection refused" in data["error"]
    assert data["module"] == "dcl"


@patch("backend.app.routes.proxy.httpx.AsyncClient")
def test_proxy_timeout_returns_504(mock_client_cls):
    """Proxy returns 504 when the target module times out."""
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("Timed out"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_client

    resp = client.get("/api/proxy/farm/health")
    assert resp.status_code == 504
    data = resp.json()
    assert "Timeout" in data["error"]
    assert data["module"] == "farm"


def test_proxy_unknown_module():
    """Proxy returns 400 for unknown module names."""
    resp = client.get("/api/proxy/unknown/health")
    assert resp.status_code == 400
    data = resp.json()
    assert "Unknown module" in data["error"]
    assert "dcl" in data["available_modules"]


@patch("backend.app.routes.proxy.httpx.AsyncClient")
def test_proxy_post_forwards_body(mock_client_cls):
    """Proxy POST forwards the request body to the target module."""
    mock_response = httpx.Response(
        200,
        json={"status": "generating"},
        headers={"content-type": "application/json"},
    )
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_client

    resp = client.post(
        "/api/proxy/farm/api/business-data/generate-multi-entity-triples",
        json={"entities": "meridian"},
    )
    assert resp.status_code == 200
    assert mock_client.post.call_count == 1
