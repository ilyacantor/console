"""Tests for cron scheduler and manual trigger routes."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


@patch("backend.app.routes.changes.cron_scheduler.trigger_detection")
def test_manual_trigger(mock_trigger):
    """POST /api/changes/detect/dcl triggers detection and returns result."""
    mock_trigger.return_value = {
        "module": "dcl",
        "events_detected": 2,
        "duration_s": 0.45,
        "status": "success",
    }
    resp = client.post("/api/changes/detect/dcl")
    assert resp.status_code == 200
    data = resp.json()
    assert data["module"] == "dcl"
    assert data["events_detected"] == 2
    assert data["status"] == "success"
    mock_trigger.assert_called_once_with("dcl")


def test_manual_trigger_invalid_module():
    """POST /api/changes/detect/xyz returns 400 for invalid module."""
    resp = client.post("/api/changes/detect/xyz")
    assert resp.status_code == 400
    assert "Invalid module" in resp.json()["detail"]


@patch("backend.app.routes.changes.cron_scheduler.trigger_detection")
def test_manual_trigger_aod(mock_trigger):
    """POST /api/changes/detect/aod triggers AOD detection."""
    mock_trigger.return_value = {
        "module": "aod",
        "events_detected": 1,
        "duration_s": 0.30,
        "status": "success",
    }
    resp = client.post("/api/changes/detect/aod")
    assert resp.status_code == 200
    data = resp.json()
    assert data["module"] == "aod"
    mock_trigger.assert_called_once_with("aod")


@patch("backend.app.routes.changes.cron_scheduler.trigger_detection")
def test_manual_trigger_error(mock_trigger):
    """POST /api/changes/detect/aam returns error info when detection fails."""
    mock_trigger.return_value = {
        "module": "aam",
        "events_detected": 0,
        "duration_s": 0.10,
        "status": "error",
        "error": "ConnectError: AAM unreachable",
    }
    resp = client.post("/api/changes/detect/aam")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"
    assert data["events_detected"] == 0
