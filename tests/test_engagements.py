"""Tests for engagement routes (proxied to Convergence)."""

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
    "state": {
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

_CC = "backend.app.routes.engagements.convergence_client"


@patch(f"{_CC}.list_engagements", new_callable=AsyncMock)
def test_list_engagements(mock_list):
    mock_list.return_value = [DEMO_ENGAGEMENT]
    resp = client.get("/api/engagements")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["engagements"]) == 1
    assert data["engagements"][0]["engagement_type"] == "MA"


@patch(f"{_CC}.get_engagement", new_callable=AsyncMock)
def test_get_engagement(mock_get):
    mock_get.return_value = DEMO_ENGAGEMENT
    resp = client.get(f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["lifecycle_stage"] == "review"
    assert data["acquirer_entity_id"] == "meridian"


@patch(f"{_CC}.get_engagement", new_callable=AsyncMock)
def test_get_engagement_not_found(mock_get):
    mock_get.return_value = None
    resp = client.get("/api/engagements/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


@patch(f"{_CC}.update_engagement", new_callable=AsyncMock)
def test_update_engagement(mock_update):
    updated = {**DEMO_ENGAGEMENT, "lifecycle_stage": "combine"}
    mock_update.return_value = updated
    resp = client.patch(
        f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}",
        json={"lifecycle_stage": "combine"},
    )
    assert resp.status_code == 200
    assert resp.json()["lifecycle_stage"] == "combine"


@patch(f"{_CC}.update_engagement", new_callable=AsyncMock)
def test_update_engagement_not_found(mock_update):
    mock_update.return_value = None
    resp = client.patch(
        "/api/engagements/00000000-0000-0000-0000-000000000000",
        json={"lifecycle_stage": "deliver"},
    )
    assert resp.status_code == 404


@patch(f"{_CC}.create_engagement", new_callable=AsyncMock)
def test_create_engagement(mock_create):
    created = {
        "engagement_id": "new-eng-001",
        "acquirer_entity_id": "meridian",
        "target_entity_id": "cascadia",
        "engagement_type": "MA",
        "lifecycle_stage": "draft",
        "state": {},
        "created_at": "2026-03-25T10:00:00+00:00",
        "updated_at": "2026-03-25T10:00:00+00:00",
    }
    mock_create.return_value = created
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


@patch(f"{_CC}.get_conflicts", new_callable=AsyncMock)
def test_get_conflicts(mock_conflicts):
    mock_conflicts.return_value = [
        {"id": "COFA-001", "name": "Revenue gross/net recognition", "severity": "high", "status": "pending"},
    ]
    resp = client.get(f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}/conflicts")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["conflicts"]) == 1
    assert data["conflicts"][0]["id"] == "COFA-001"


@patch(f"{_CC}.get_engagement_history", new_callable=AsyncMock)
def test_get_history(mock_history):
    mock_history.return_value = [{"step": "cofa", "status": "complete"}]
    resp = client.get(f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}/history")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["events"]) == 1


@patch(f"{_CC}.get_engagement", new_callable=AsyncMock)
def test_directional_schema(mock_get):
    mock_get.return_value = DEMO_ENGAGEMENT
    resp = client.get(f"/api/engagements/{DEMO_ENGAGEMENT['engagement_id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert "acquirer_entity_id" in data
    assert "target_entity_id" in data
    assert data["acquirer_entity_id"] == "meridian"
    assert data["target_entity_id"] == "cascadia"
