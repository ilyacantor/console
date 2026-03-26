"""Tests for config routes — read and update console settings."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)

SAMPLE_CONFIG = {
    "baselines": {"farm_gen": 2, "dcl_verify": 2},
    "module_urls": {"aod": "http://localhost:8001", "dcl": "http://localhost:8004"},
    "cron_schedules": {"aod_discovery": {"interval_minutes": 360, "enabled": True}},
    "detection_thresholds": {"coverage_drop_warning": 5, "source_stale_hours": 48},
}


@patch("backend.app.routes.config.db.get_all_config")
def test_get_all_config(mock_get_all):
    """GET /api/config returns all config entries."""
    mock_get_all.return_value = SAMPLE_CONFIG

    resp = client.get("/api/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "config" in data
    assert data["config"]["baselines"]["farm_gen"] == 2
    assert "module_urls" in data["config"]
    assert "cron_schedules" in data["config"]


@patch("backend.app.routes.config.db.get_all_config")
@patch("backend.app.routes.config.db.set_config")
def test_update_config(mock_set, mock_get_all):
    """PUT /api/config updates values; GET confirms."""
    mock_set.return_value = None
    updated = {**SAMPLE_CONFIG, "detection_thresholds": {"coverage_drop_warning": 10, "source_stale_hours": 24}}
    mock_get_all.return_value = updated

    resp = client.put("/api/config", json={"detection_thresholds": {"coverage_drop_warning": 10, "source_stale_hours": 24}})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["config"]["detection_thresholds"]["coverage_drop_warning"] == 10
    assert data["config"]["detection_thresholds"]["source_stale_hours"] == 24


@patch("backend.app.routes.config.db.get_all_config")
@patch("backend.app.routes.config.db.set_config")
def test_partial_update(mock_set, mock_get_all):
    """Partial update: change one key, others unchanged."""
    mock_set.return_value = None
    updated = {**SAMPLE_CONFIG, "cron_schedules": {"aod_discovery": {"interval_minutes": 120, "enabled": True}}}
    mock_get_all.return_value = updated

    resp = client.put("/api/config", json={"cron_schedules": {"aod_discovery": {"interval_minutes": 120, "enabled": True}}})
    assert resp.status_code == 200
    data = resp.json()
    assert data["config"]["cron_schedules"]["aod_discovery"]["interval_minutes"] == 120
    # baselines unchanged
    assert data["config"]["baselines"]["farm_gen"] == 2


@patch("backend.app.routes.config.db.get_config")
def test_get_single_key(mock_get):
    """GET /api/config/{key} returns single config value."""
    mock_get.return_value = {"farm_gen": 2, "dcl_verify": 2}

    resp = client.get("/api/config/baselines")
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"] == "baselines"
    assert data["value"]["farm_gen"] == 2


@patch("backend.app.routes.config.db.get_config")
def test_get_missing_key(mock_get):
    """GET /api/config/{key} for non-existent key returns null value."""
    mock_get.return_value = None

    resp = client.get("/api/config/nonexistent")
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"] == "nonexistent"
    assert data["value"] is None


@patch("backend.app.routes.config.db.set_config")
def test_update_single_key(mock_set):
    """PUT /api/config/{key} updates single value."""
    mock_set.return_value = None

    resp = client.put("/api/config/baselines", json={"value": {"farm_gen": 3}})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["key"] == "baselines"
