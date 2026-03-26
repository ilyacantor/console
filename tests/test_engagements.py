"""Tests for engagement routes."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)

DEMO_ENGAGEMENT = {
    "engagement_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "acquirer_entity_id": "meridian",
    "target_entity_id": "cascadia",
    "engagement_type": "MA",
    "lifecycle_stage": "review",
    "state_json": {
        "conflicts_resolved": 3,
        "conflicts_total": 6,
        "deliverables_ready": 6,
        "total_cost": 14.20,
        "total_runs": 9,
        "total_tokens": 47000,
    },
    "created_at": "2026-03-25T10:00:00+00:00",
    "updated_at": "2026-03-25T10:00:00+00:00",
}


@patch("backend.app.routes.engagements.db.get_engagements")
def test_list_engagements(mock_get):
    """GET /api/engagements returns list of engagements."""
    mock_get.return_value = [DEMO_ENGAGEMENT]
    resp = client.get("/api/engagements")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["engagements"]) == 1
    assert data["engagements"][0]["engagement_type"] == "MA"


@patch("backend.app.routes.engagements.db.get_engagement")
def test_get_engagement(mock_get):
    """GET /api/engagements/{id} returns single engagement."""
    mock_get.return_value = DEMO_ENGAGEMENT
    resp = client.get(f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["lifecycle_stage"] == "review"
    assert data["acquirer_entity_id"] == "meridian"
    assert data["target_entity_id"] == "cascadia"


@patch("backend.app.routes.engagements.db.get_engagement")
def test_get_engagement_not_found(mock_get):
    """GET /api/engagements/{id} returns 404 for unknown ID."""
    mock_get.return_value = None
    resp = client.get("/api/engagements/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


@patch("backend.app.routes.engagements.db.update_engagement")
@patch("backend.app.routes.engagements.db.get_engagement")
def test_update_engagement(mock_get, mock_update):
    """PATCH /api/engagements/{id} updates lifecycle stage."""
    updated = {**DEMO_ENGAGEMENT, "lifecycle_stage": "combine"}
    mock_get.side_effect = [DEMO_ENGAGEMENT, updated]
    mock_update.return_value = None

    resp = client.patch(
        f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}",
        json={"lifecycle_stage": "combine"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["lifecycle_stage"] == "combine"


@patch("backend.app.routes.engagements.db.update_engagement")
@patch("backend.app.routes.engagements.db.get_engagement")
def test_update_engagement_state_json(mock_get, mock_update):
    """PATCH /api/engagements/{id} updates state_json."""
    new_state = {**DEMO_ENGAGEMENT["state_json"], "conflicts_resolved": 6}
    updated = {**DEMO_ENGAGEMENT, "state_json": new_state}
    mock_get.side_effect = [DEMO_ENGAGEMENT, updated]
    mock_update.return_value = None

    resp = client.patch(
        f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}",
        json={"state_json": new_state},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["state_json"]["conflicts_resolved"] == 6


@patch("backend.app.routes.engagements.db.get_engagement")
def test_update_engagement_not_found(mock_get):
    """PATCH /api/engagements/{id} returns 404 for unknown ID."""
    mock_get.return_value = None
    resp = client.patch(
        "/api/engagements/00000000-0000-0000-0000-000000000000",
        json={"lifecycle_stage": "deliver"},
    )
    assert resp.status_code == 404


@patch("backend.app.routes.engagements.db.get_engagement")
@patch("backend.app.routes.engagements.db.create_engagement")
def test_create_engagement(mock_create, mock_get):
    """POST /api/engagements creates a new engagement."""
    mock_create.return_value = "new-eng-001"
    mock_get.return_value = {
        "engagement_id": "new-eng-001",
        "acquirer_entity_id": "meridian",
        "target_entity_id": "cascadia",
        "engagement_type": "MA",
        "lifecycle_stage": "upload",
        "state_json": {},
        "created_at": "2026-03-25T10:00:00+00:00",
        "updated_at": "2026-03-25T10:00:00+00:00",
    }

    resp = client.post(
        "/api/engagements",
        json={
            "acquirer_entity_id": "meridian",
            "target_entity_id": "cascadia",
            "engagement_type": "MA",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["engagement_id"] == "new-eng-001"
    assert data["acquirer_entity_id"] == "meridian"
    assert data["target_entity_id"] == "cascadia"
    assert data["lifecycle_stage"] == "upload"
    mock_create.assert_called_once_with(
        acquirer_entity_id="meridian",
        target_entity_id="cascadia",
        engagement_type="MA",
    )


@patch("backend.app.routes.engagements.db.get_conflicts")
@patch("backend.app.routes.engagements.db.get_engagement")
def test_get_conflicts(mock_get, mock_conflicts):
    """GET /api/engagements/{id}/conflicts returns scoped conflicts."""
    mock_get.return_value = DEMO_ENGAGEMENT
    mock_conflicts.return_value = [
        {"id": "COFA-001", "engagement_id": DEMO_ENGAGEMENT["engagement_id"], "name": "Revenue gross/net recognition", "impact_dollars": 340000000, "impact_label": "$340M", "severity": "high", "status": "pending", "treatment": None, "created_at": "2026-03-25T10:00:00+00:00"},
        {"id": "COFA-002", "engagement_id": DEMO_ENGAGEMENT["engagement_id"], "name": "Benefits loading (COGS vs OpEx)", "impact_dollars": 89000000, "impact_label": "$89M", "severity": "medium", "status": "pending", "treatment": None, "created_at": "2026-03-25T10:00:00+00:00"},
        {"id": "COFA-003", "engagement_id": DEMO_ENGAGEMENT["engagement_id"], "name": "S&M bundling", "impact_dollars": 28000000, "impact_label": "$28M", "severity": "low", "status": "resolved", "treatment": "Acq. treatment", "created_at": "2026-03-25T10:00:00+00:00"},
        {"id": "COFA-004", "engagement_id": DEMO_ENGAGEMENT["engagement_id"], "name": "Recruiting capitalization", "impact_dollars": 12000000, "impact_label": "$12M", "severity": "medium", "status": "pending", "treatment": None, "created_at": "2026-03-25T10:00:00+00:00"},
        {"id": "COFA-005", "engagement_id": DEMO_ENGAGEMENT["engagement_id"], "name": "Automation capitalization", "impact_dollars": 8000000, "impact_label": "$8M", "severity": "low", "status": "resolved", "treatment": "Keep both", "created_at": "2026-03-25T10:00:00+00:00"},
        {"id": "COFA-006", "engagement_id": DEMO_ENGAGEMENT["engagement_id"], "name": "Depreciation method", "impact_dollars": 4000000, "impact_label": "$4M", "severity": "low", "status": "resolved", "treatment": "Post-close", "created_at": "2026-03-25T10:00:00+00:00"},
    ]
    resp = client.get(f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}/conflicts")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["conflicts"]) == 6
    assert data["conflicts"][0]["id"] == "COFA-001"
    assert data["conflicts"][0]["severity"] == "high"


@patch("backend.app.routes.engagements.db.get_engagement")
def test_get_conflicts_not_found(mock_get):
    """GET /api/engagements/{id}/conflicts returns 404 for unknown engagement."""
    mock_get.return_value = None
    resp = client.get("/api/engagements/00000000-0000-0000-0000-000000000000/conflicts")
    assert resp.status_code == 404


@patch("backend.app.routes.engagements.db.get_conflicts")
@patch("backend.app.routes.engagements.db.get_engagement")
def test_get_conflicts_empty(mock_get, mock_conflicts):
    """GET /api/engagements/{id}/conflicts returns empty list for engagement with no conflicts."""
    mock_get.return_value = DEMO_ENGAGEMENT
    mock_conflicts.return_value = []
    resp = client.get(f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}/conflicts")
    assert resp.status_code == 200
    data = resp.json()
    assert data["conflicts"] == []


@patch("backend.app.routes.engagements.db.get_engagement")
def test_directional_schema(mock_get):
    """Engagement has directional fields: acquirer_entity_id and target_entity_id."""
    mock_get.return_value = DEMO_ENGAGEMENT
    resp = client.get(f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert "acquirer_entity_id" in data
    assert "target_entity_id" in data
    assert data["acquirer_entity_id"] == "meridian"
    assert data["target_entity_id"] == "cascadia"
