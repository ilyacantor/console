"""Tests for change feed routes."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)

SAMPLE_EVENTS = [
    {
        "id": "00000000-0000-0000-0000-000000000001",
        "timestamp": "2026-03-25T08:00:00+00:00",
        "source_module": "aam",
        "event_type": "schema_drift",
        "entity_id": None,
        "summary": "Schema drift: ERP — 3 fields removed",
        "detail": None,
        "severity": "critical",
        "payload": {"pipe": "erp_netsuite_main"},
        "acknowledged": False,
        "created_at": "2026-03-25T08:00:00+00:00",
    },
    {
        "id": "00000000-0000-0000-0000-000000000002",
        "timestamp": "2026-03-25T07:00:00+00:00",
        "source_module": "dcl",
        "event_type": "coverage_drop",
        "entity_id": None,
        "summary": "Coverage drop: opex domain 98% to 84%",
        "detail": None,
        "severity": "critical",
        "payload": {"domain": "opex"},
        "acknowledged": False,
        "created_at": "2026-03-25T07:00:00+00:00",
    },
    {
        "id": "00000000-0000-0000-0000-000000000003",
        "timestamp": "2026-03-25T05:00:00+00:00",
        "source_module": "aod",
        "event_type": "asset_discovered",
        "entity_id": None,
        "summary": "New asset discovered: datadog.com",
        "detail": None,
        "severity": "warning",
        "payload": {},
        "acknowledged": False,
        "created_at": "2026-03-25T05:00:00+00:00",
    },
    {
        "id": "00000000-0000-0000-0000-000000000004",
        "timestamp": "2026-03-25T02:00:00+00:00",
        "source_module": "aam",
        "event_type": "health_check",
        "entity_id": None,
        "summary": "Pipe health check: 101/101 healthy",
        "detail": None,
        "severity": "info",
        "payload": {},
        "acknowledged": False,
        "created_at": "2026-03-25T02:00:00+00:00",
    },
]


@patch("backend.app.routes.changes.db.get_change_events")
def test_list_changes(mock_get):
    """GET /api/changes returns events with count."""
    mock_get.return_value = SAMPLE_EVENTS
    resp = client.get("/api/changes")
    assert resp.status_code == 200
    data = resp.json()
    assert "events" in data
    assert data["count"] == 4
    assert data["events"][0]["source_module"] == "aam"


@patch("backend.app.routes.changes.db.get_change_events")
def test_filter_by_severity(mock_get):
    """GET /api/changes?severity=critical returns only critical events."""
    critical_only = [e for e in SAMPLE_EVENTS if e["severity"] == "critical"]
    mock_get.return_value = critical_only
    resp = client.get("/api/changes?severity=critical")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    for ev in data["events"]:
        assert ev["severity"] == "critical"
    mock_get.assert_called_once()
    call_kwargs = mock_get.call_args
    assert call_kwargs[1]["severity"] == "critical" or call_kwargs[0][1] == "critical"


@patch("backend.app.routes.changes.db.get_change_events")
def test_filter_by_module(mock_get):
    """GET /api/changes?module=aam returns only AAM events."""
    aam_only = [e for e in SAMPLE_EVENTS if e["source_module"] == "aam"]
    mock_get.return_value = aam_only
    resp = client.get("/api/changes?module=aam")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    for ev in data["events"]:
        assert ev["source_module"] == "aam"


@patch("backend.app.routes.changes.db.acknowledge_event")
def test_acknowledge_event(mock_ack):
    """POST /api/changes/{id}/acknowledge returns 200 on success."""
    mock_ack.return_value = True
    event_id = "00000000-0000-0000-0000-000000000001"
    resp = client.post(f"/api/changes/{event_id}/acknowledge")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["event_id"] == event_id


@patch("backend.app.routes.changes.db.acknowledge_event")
def test_acknowledge_not_found(mock_ack):
    """POST /api/changes/{id}/acknowledge returns 404 for unknown ID."""
    mock_ack.return_value = False
    resp = client.post("/api/changes/00000000-0000-0000-0000-999999999999/acknowledge")
    assert resp.status_code == 404


@patch("backend.app.routes.changes.db.get_change_summary")
def test_change_summary(mock_summary):
    """GET /api/changes/summary returns severity counts and last_scan."""
    mock_summary.return_value = {
        "critical": 2,
        "warning": 1,
        "info": 1,
        "last_scan": "2026-03-25T09:50:00+00:00",
    }
    resp = client.get("/api/changes/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["critical"] == 2
    assert data["warning"] == 1
    assert data["info"] == 1
    assert data["last_scan"] is not None
