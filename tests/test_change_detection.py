"""Tests for change detection service logic."""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import httpx

from backend.app.services.change_detection import (
    detect_dcl_changes,
)


class FakeTransport(httpx.AsyncBaseTransport):
    """Transport that returns fixed responses by URL pattern."""

    def __init__(self, responses: dict[str, dict]):
        self._responses = responses

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        for pattern, data in self._responses.items():
            if pattern in str(request.url):
                return httpx.Response(200, json=data, request=request)
        return httpx.Response(404, json={"detail": "not found"}, request=request)


class FailTransport(httpx.AsyncBaseTransport):
    """Transport that always raises ConnectError."""

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused")


def _patched_client(transport):
    """Return a patched AsyncClient constructor that uses the given transport."""
    original = httpx.AsyncClient

    def factory(**kwargs):
        kwargs.pop("timeout", None)
        return original(transport=transport, **kwargs)

    return factory


@patch("backend.app.services.change_detection.db")
@patch("backend.app.services.change_detection.config")
def test_dcl_first_run_baseline(mock_config, mock_db):
    """First run with no previous snapshot stores baseline, emits no events."""
    mock_config.DCL_BASE_URL = "http://localhost:8004"
    mock_db.get_config = AsyncMock(side_effect=lambda key: {
        "snapshot_dcl": None,
        "detection_thresholds": {
            "coverage_drop_critical": 10,
            "coverage_drop_warning": 5,
            "source_stale_hours": 48,
        },
    }.get(key))
    mock_db.set_config = AsyncMock()

    transport = FakeTransport({
        "/api/dcl/triples/overview": {
            "total_triples": 9350,
            "snapshot_ts": datetime.now(timezone.utc).isoformat(),
        },
    })

    async def run():
        with patch(
            "backend.app.services.change_detection.httpx.AsyncClient",
            side_effect=_patched_client(transport),
        ):
            return await detect_dcl_changes()

    events = asyncio.run(run())
    assert len(events) == 0
    mock_db.set_config.assert_called_once()
    assert mock_db.set_config.call_args[0][0] == "snapshot_dcl"


@patch("backend.app.services.change_detection.db")
@patch("backend.app.services.change_detection.config")
def test_dcl_coverage_drop(mock_config, mock_db):
    """Triple count drop exceeding critical threshold emits critical event."""
    mock_config.DCL_BASE_URL = "http://localhost:8004"
    mock_db.get_config = AsyncMock(side_effect=lambda key: {
        "snapshot_dcl": {
            "triple_count": 9350,
            "snapshot_ts": datetime.now(timezone.utc).isoformat(),
            "checked_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        },
        "detection_thresholds": {
            "coverage_drop_critical": 10,
            "coverage_drop_warning": 5,
            "source_stale_hours": 48,
        },
    }.get(key))
    mock_db.set_config = AsyncMock()

    # 20% drop: 9350 -> 7480
    transport = FakeTransport({
        "/api/dcl/triples/overview": {
            "total_triples": 7480,
            "snapshot_ts": datetime.now(timezone.utc).isoformat(),
        },
    })

    async def run():
        with patch(
            "backend.app.services.change_detection.httpx.AsyncClient",
            side_effect=_patched_client(transport),
        ):
            return await detect_dcl_changes()

    events = asyncio.run(run())
    coverage_events = [e for e in events if e["event_type"] == "coverage_drop"]
    assert len(coverage_events) >= 1
    assert coverage_events[0]["severity"] == "critical"


@patch("backend.app.services.change_detection.db")
@patch("backend.app.services.change_detection.config")
def test_dcl_no_change(mock_config, mock_db):
    """Same triple count with fresh data emits only info event."""
    now = datetime.now(timezone.utc)
    mock_config.DCL_BASE_URL = "http://localhost:8004"
    mock_db.get_config = AsyncMock(side_effect=lambda key: {
        "snapshot_dcl": {
            "triple_count": 9350,
            "snapshot_ts": now.isoformat(),
            "checked_at": (now - timedelta(minutes=15)).isoformat(),
        },
        "detection_thresholds": {
            "coverage_drop_critical": 10,
            "coverage_drop_warning": 5,
            "source_stale_hours": 48,
        },
    }.get(key))
    mock_db.set_config = AsyncMock()

    transport = FakeTransport({
        "/api/dcl/triples/overview": {
            "total_triples": 9350,
            "snapshot_ts": now.isoformat(),
        },
    })

    async def run():
        with patch(
            "backend.app.services.change_detection.httpx.AsyncClient",
            side_effect=_patched_client(transport),
        ):
            return await detect_dcl_changes()

    events = asyncio.run(run())
    assert all(e["severity"] == "info" for e in events)


@patch("backend.app.services.change_detection.db")
@patch("backend.app.services.change_detection.config")
def test_module_unreachable(mock_config, mock_db):
    """When module is unreachable, return empty list — no false events."""
    mock_config.DCL_BASE_URL = "http://localhost:8004"
    mock_db.get_config = AsyncMock(return_value=None)

    transport = FailTransport()

    async def run():
        with patch(
            "backend.app.services.change_detection.httpx.AsyncClient",
            side_effect=_patched_client(transport),
        ):
            return await detect_dcl_changes()

    events = asyncio.run(run())
    assert events == []
