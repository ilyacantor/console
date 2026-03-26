"""Tests for instrumentation routes — Maestra run ledger and summary."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)

SAMPLE_RUNS = [
    {
        "run_id": "run-001",
        "engagement_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "step_name": "cofa-map",
        "run_tag": "cofa-run-001",
        "model_version": "claude-opus-4-20250514",
        "constitution_version": "v3.1",
        "duration_s": 12.3,
        "tokens_in": 4200,
        "tokens_out": 1800,
        "cost_usd": 0.18,
        "status": "success",
        "error_detail": None,
        "created_at": "2026-03-25T07:00:00+00:00",
    },
    {
        "run_id": "run-002",
        "engagement_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "step_name": "chat",
        "run_tag": "chat-001",
        "model_version": "claude-opus-4-20250514",
        "constitution_version": "v3.1",
        "duration_s": 3.2,
        "tokens_in": 1200,
        "tokens_out": 800,
        "cost_usd": 0.06,
        "status": "success",
        "error_detail": None,
        "created_at": "2026-03-25T08:00:00+00:00",
    },
    {
        "run_id": "run-003",
        "engagement_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "step_name": "cofa-map",
        "run_tag": "cofa-run-002",
        "model_version": "claude-opus-4-20250514",
        "constitution_version": "v3.1",
        "duration_s": 0.0,
        "tokens_in": 500,
        "tokens_out": 0,
        "cost_usd": 0.01,
        "status": "failed",
        "error_detail": "Context window exceeded",
        "created_at": "2026-03-25T09:00:00+00:00",
    },
]

SAMPLE_SUMMARY = {
    "total_runs": 3,
    "total_tokens": 8500,
    "total_cost": 0.25,
    "avg_duration_s": 5.2,
}


@patch("backend.app.routes.instrumentation.db.get_maestra_runs")
def test_get_runs(mock_get_runs):
    """GET /api/instrumentation/runs returns seeded data."""
    mock_get_runs.return_value = SAMPLE_RUNS

    resp = client.get("/api/instrumentation/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert "runs" in data
    assert data["count"] == 3
    assert data["runs"][0]["step_name"] == "cofa-map"
    assert data["runs"][1]["step_name"] == "chat"


@patch("backend.app.routes.instrumentation.db.get_maestra_summary")
def test_get_summary(mock_summary):
    """GET /api/instrumentation/summary returns correct aggregates."""
    mock_summary.return_value = SAMPLE_SUMMARY

    resp = client.get("/api/instrumentation/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_runs"] == 3
    assert data["total_tokens"] == 8500
    assert data["total_cost"] == 0.25
    assert data["avg_duration_s"] == 5.2


@patch("backend.app.routes.instrumentation.db.get_maestra_runs")
def test_filter_by_step_name(mock_get_runs):
    """Filter by step_name returns only matching runs."""
    cofa_runs = [r for r in SAMPLE_RUNS if r["step_name"] == "cofa-map"]
    mock_get_runs.return_value = cofa_runs

    resp = client.get("/api/instrumentation/runs?step_name=cofa-map")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    for run in data["runs"]:
        assert run["step_name"] == "cofa-map"


@patch("backend.app.routes.instrumentation.db.get_maestra_runs")
def test_filter_by_engagement(mock_get_runs):
    """Filter by engagement_id passes through to DB layer."""
    mock_get_runs.return_value = SAMPLE_RUNS

    resp = client.get("/api/instrumentation/runs?engagement_id=a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    assert resp.status_code == 200
    mock_get_runs.assert_called_once_with(
        engagement_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        step_name=None,
        limit=50,
    )


@patch("backend.app.routes.instrumentation.db.get_maestra_runs")
def test_limit_parameter(mock_get_runs):
    """Limit parameter is passed to DB layer."""
    mock_get_runs.return_value = [SAMPLE_RUNS[0]]

    resp = client.get("/api/instrumentation/runs?limit=1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
