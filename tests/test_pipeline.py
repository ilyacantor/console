"""Tests for pipeline endpoints."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def _farm_manifest_response(rows: int = 9350):
    return httpx.Response(200, json={
        "status": "completed",
        "rows_generated": rows,
        "push_result": {"rows_accepted": rows, "batch_count": (rows + 999) // 1000},
    })


def _dcl_overview_response(total: int = 9350):
    return httpx.Response(200, json={
        "total_triples": total,
        "count": total,
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
    """SE pipeline runs 6 steps: snapshot → AOD discovery → handoff → AAM → financials → complete."""

    async def mock_post(url, **kwargs):
        if "/api/snapshots" in url:
            return httpx.Response(200, json={
                "farm_manifest_id": "snap-123", "tenant_id": "test-tenant",
                "entity_id": "test-entity",
            })
        if "/api/runs/from-farm" in url:
            return httpx.Response(200, json={
                "aod_discovery_id": "aod-123", "counts": {"assets_admitted": 5}
            })
        if "/api/handoff/aam/export" in url:
            return httpx.Response(200, json={
                "candidates_sent": 3, "handoff_id": "handoff-123",
            })
        if "/api/aam/infer" in url:
            return httpx.Response(200, json={
                "pipes_created": 3, "aam_inference_id": "aam-123",
            })
        if "/api/farm/manifest-intake" in url:
            return _farm_manifest_response()
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()
    mock_db.get_entity = AsyncMock(return_value={
        "entity_id": "test-entity", "tenant_id": "test-tenant", "entity_name": "TestEntity",
    })
    mock_db.list_entities_for_tenant = AsyncMock(return_value=[
        {"entity_id": "test-entity", "tenant_id": "test-tenant", "entity_name": "TestEntity"},
    ])

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["test-entity"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["pipeline_mode"] == "se"
    assert data["status"] == "completed"
    assert len(data["steps"]) == 6

    # Verify pipeline_run_id is a full UUID (36 chars with hyphens)
    assert len(data["pipeline_run_id"]) == 36
    assert "-" in data["pipeline_run_id"]

    # Verify run_name is present
    assert data["run_name"]

    assert data["steps"][0]["name"] == "farm_snapshot"
    assert data["steps"][0]["status"] == "success"
    assert data["steps"][1]["name"] == "aod_discovery"
    assert data["steps"][1]["status"] == "success"
    assert data["steps"][4]["name"] == "farm_financials"
    assert data["steps"][4]["status"] == "success"
    assert data["steps"][5]["name"] == "complete"
    assert data["steps"][5]["status"] == "success"

    for step in data["steps"]:
        assert step["duration_ms"] is not None
        assert step["duration_ms"] >= 0


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_run_me_pipeline(mock_client_cls, mock_db):
    """ME pipeline runs 5 steps: financials A∥B → DCL verify → COFA → complete."""

    async def mock_post(url, **kwargs):
        if "/api/farm/manifest-intake" in url:
            resp = _farm_manifest_response()
            # Inject dcl_ingest_id into Farm response (ME pipeline needs it
            # to build dcl_ingest_ids context for COFA)
            data = resp.json()
            data["dcl_ingest_id"] = f"dcl-ingest-{hash(url) % 1000:03d}"
            return httpx.Response(200, json=data)
        if "/api/convergence/cofa/unify" in url:
            return httpx.Response(200, json={
                "cofa_run_id": "cofa-run-001",
                "status": "ok",
            })
        if "/api/convergence/verify" in url:
            return httpx.Response(200, json={
                "verify_id": "verify-001",
                "status": "passed",
            })
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        if "/api/dcl/triples/overview" in url:
            return _dcl_overview_response()
        if "/api/convergence/engagements/eng-conv-1" in url:
            return httpx.Response(200, json={
                "engagement_id": "eng-conv-1",
                "short_name": "MerCas",
                "acquirer_entity_id": "test-entity-a",
                "target_entity_id": "test-entity-b",
                "tenant_id": "test-tenant",
                "state": "active",
            })
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()
    mock_db.get_entity = AsyncMock(return_value={
        "entity_id": "test-entity", "tenant_id": "test-tenant", "entity_name": "TestEntity",
    })
    mock_db.list_entities_for_tenant = AsyncMock(return_value=[
        {"entity_id": "test-entity", "tenant_id": "test-tenant", "entity_name": "TestEntity"},
    ])

    resp = client.post("/api/pipeline/run", json={
        "mode": "ME",
        "entities": ["test-entity-a", "test-entity-b"],
        "config": {"convergence_engagement_id": "eng-conv-1"},
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["pipeline_mode"] == "me"
    assert data["status"] == "completed"
    assert len(data["steps"]) == 5

    # Verify pipeline_run_id is a full UUID
    assert len(data["pipeline_run_id"]) == 36

    assert data["steps"][0]["name"] == "farm_financials_a"
    assert data["steps"][1]["name"] == "farm_financials_b"
    assert data["steps"][2]["name"] == "cofa_unification"
    assert data["steps"][3]["name"] == "verify"
    assert data["steps"][4]["name"] == "complete"

    for step in data["steps"]:
        assert step["status"] == "success"


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_me_pipeline_uses_convergence_engagement(mock_client_cls, mock_db):
    """ME pipeline uses Convergence engagement_id, not Console UUID, for COFA."""

    cofa_bodies = []

    async def mock_post(url, **kwargs):
        if "/api/farm/manifest-intake" in url:
            resp = _farm_manifest_response()
            data = resp.json()
            data["dcl_ingest_id"] = f"dcl-ingest-{hash(url) % 1000:03d}"
            return httpx.Response(200, json=data)
        if "/api/convergence/cofa/unify" in url:
            cofa_bodies.append(kwargs.get("json", {}))
            return httpx.Response(200, json={
                "cofa_run_id": "cofa-test-123",
                "consumed_dcl_ingest_ids": [],
            })
        if "/api/convergence/verify" in url:
            return httpx.Response(200, json={"verify_id": "verify-test-1"})
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        if "/api/convergence/engagements" in url:
            return httpx.Response(200, json={
                "engagements": [{
                    "engagement_id": "conv-eng-id-123",
                    "acquirer_entity_id": "test-entity-a",
                    "target_entity_id": "test-entity-b",
                    "short_name": "TstAB",
                    "tenant_id": "test-tenant",
                    "state": "active",
                }]
            })
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()
    mock_db.get_engagement = AsyncMock(return_value={
        "engagement_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "acquirer_entity_id": "test-entity-a",
        "target_entity_id": "test-entity-b",
        "tenant_id": "test-tenant",
    })
    mock_db.link_convergence_engagement = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "mode": "ME",
        "entities": ["test-entity-a", "test-entity-b"],
        "config": {"engagement_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"},
    })
    assert resp.status_code == 200
    data = resp.json()

    # COFA step uses Convergence engagement_id, not Console UUID
    assert data["steps"][2]["name"] == "cofa_unification"
    assert data["steps"][2]["status"] == "success"
    assert len(cofa_bodies) == 1
    assert cofa_bodies[0]["engagement_id"] == "conv-eng-id-123"


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_pipeline_stops_on_failure(mock_client_cls, mock_db):
    """When Farm Snapshot fails, pipeline stops and returns completed_with_errors."""

    async def mock_post(url, **kwargs):
        if "/api/snapshots" in url:
            return httpx.Response(500, json={"detail": "Internal server error"})
        return httpx.Response(200, json={})

    async def mock_get(url, **kwargs):
        return httpx.Response(200, json={})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()
    mock_db.get_entity = AsyncMock(return_value={
        "entity_id": "test-entity", "tenant_id": "test-tenant", "entity_name": "TestEntity",
    })
    mock_db.list_entities_for_tenant = AsyncMock(return_value=[
        {"entity_id": "test-entity", "tenant_id": "test-tenant", "entity_name": "TestEntity"},
    ])

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["test-entity"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "completed_with_errors"
    assert data["steps"][0]["status"] == "failed"
    assert data["steps"][0]["message"] is not None
    assert data["steps"][1]["status"] == "pending"


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_pipeline_farm_connection_error(mock_client_cls, mock_db):
    """When Farm is unreachable, Farm Snapshot step shows connection error."""

    async def mock_post(url, **kwargs):
        raise httpx.ConnectError("Connection refused")

    mock_client = _make_mock_client(mock_post, AsyncMock())
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()
    mock_db.get_entity = AsyncMock(return_value={
        "entity_id": "test-entity", "tenant_id": "test-tenant", "entity_name": "TestEntity",
    })
    mock_db.list_entities_for_tenant = AsyncMock(return_value=[
        {"entity_id": "test-entity", "tenant_id": "test-tenant", "entity_name": "TestEntity"},
    ])

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["test-entity"],
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "completed_with_errors"
    assert data["steps"][0]["status"] == "failed"
    assert "connection refused" in data["steps"][0]["message"].lower()


def test_me_requires_two_entities():
    """ME mode requires at least 2 entities."""
    resp = client.post("/api/pipeline/run", json={
        "mode": "ME",
        "entities": ["test-entity"],
    })
    assert resp.status_code == 400


def test_invalid_mode():
    """Invalid mode returns validation error."""
    resp = client.post("/api/pipeline/run", json={
        "mode": "INVALID",
        "entities": ["test-entity"],
    })
    assert resp.status_code == 422


@patch("backend.app.db.get_pipeline_jobs")
def test_get_runs(mock_get_pipeline_jobs):
    """GET /runs returns recent pipeline runs."""
    mock_get_pipeline_jobs.return_value = [
        {
            "pipeline_run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "run_name": "TestEntity-a1b2",
            "pipeline_mode": "se",
            "steps": [],
            "status": "completed",
            "created_at": "2026-03-25T00:00:00",
        }
    ]

    resp = client.get("/api/pipeline/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert "runs" in data
    assert len(data["runs"]) == 1
    assert data["runs"][0]["pipeline_run_id"] == "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    assert data["runs"][0]["run_name"] == "TestEntity-a1b2"


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


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_se_pipeline_threads_namespaced_ids(mock_client_cls, mock_db):
    """SE pipeline threads namespaced IDs: farm_manifest_id → aod_discovery_id → handoff_id → aam_inference_id."""

    captured_bodies: dict[str, dict] = {}

    async def mock_post(url, **kwargs):
        body = kwargs.get("json", {})
        if "/api/snapshots" in url:
            captured_bodies["snapshot"] = body
            return httpx.Response(200, json={
                "farm_manifest_id": "farm-snap-001",
                "entity_id": "test-entity",
                "tenant_id": "test-tenant",
            })
        if "/api/runs/from-farm" in url:
            captured_bodies["discovery"] = body
            return httpx.Response(200, json={
                "aod_discovery_id": "aod-disc-001",
                "consumed_snapshot_id": "farm-snap-001",
                "counts": {"assets_admitted": 5},
            })
        if "/api/handoff/aam/export" in url:
            captured_bodies["handoff"] = kwargs.get("params", {})
            return httpx.Response(200, json={
                "handoff_id": "handoff-001",
                "source_aod_discovery_id": "aod-disc-001",
                "candidates_sent": 3,
            })
        if "/api/aam/infer" in url:
            captured_bodies["aam"] = body
            return httpx.Response(200, json={
                "aam_inference_id": "aam-inf-001",
                "source_handoff_id": "handoff-001",
                "pipes_created": 3,
            })
        if "/api/farm/manifest-intake" in url:
            captured_bodies["financials"] = body
            return _farm_manifest_response()
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "mode": "SE",
        "entities": ["test-entity"],
        "config": {"entity_id": "test-entity"},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"

    # Verify farm_manifest_id threaded to AOD discovery
    assert captured_bodies["discovery"]["snapshot_id"] == "farm-snap-001"
    assert captured_bodies["discovery"]["tenant_id"] is not None
    assert captured_bodies["discovery"]["entity_id"] == "test-entity"

    # Verify aod_discovery_id threaded to handoff
    assert captured_bodies["handoff"]["aod_discovery_id"] == "aod-disc-001"

    # Verify handoff_id threaded to AAM
    assert captured_bodies["aam"]["handoff_id"] == "handoff-001"

    # Verify farm_manifest_id threaded to financials + triples_id present
    assert captured_bodies["financials"]["farm_manifest_id"] == "farm-snap-001"
    assert "triples_id" in captured_bodies["financials"]["target"]


@patch("backend.app.services.pipeline_orchestrator.db")
@patch("backend.app.services.pipeline_orchestrator.httpx.AsyncClient")
def test_cofa_sends_pipeline_run_id_to_convergence(mock_client_cls, mock_db):
    """COFA unify request to Convergence includes full pipeline_run_id (not truncated)."""

    cofa_bodies = []

    async def mock_post(url, **kwargs):
        if "/api/farm/manifest-intake" in url:
            resp = _farm_manifest_response()
            data = resp.json()
            data["dcl_ingest_id"] = f"dcl-ingest-{hash(url) % 1000:03d}"
            return httpx.Response(200, json=data)
        if "/api/convergence/cofa/unify" in url:
            cofa_bodies.append(kwargs.get("json", {}))
            return httpx.Response(200, json={
                "cofa_run_id": "cofa-run-001",
                "consumed_dcl_ingest_ids": [],
            })
        if "/api/convergence/verify" in url:
            return httpx.Response(200, json={"verify_id": "verify-001"})
        return httpx.Response(404, json={"detail": "not found"})

    async def mock_get(url, **kwargs):
        if "/api/convergence/engagements/eng-conv-1" in url:
            return httpx.Response(200, json={
                "engagement_id": "eng-conv-1",
                "short_name": "TstAB",
                "acquirer_entity_id": "test-entity-a",
                "target_entity_id": "test-entity-b",
                "tenant_id": "test-tenant",
                "state": "active",
            })
        return httpx.Response(404, json={"detail": "not found"})

    mock_client = _make_mock_client(mock_post, mock_get)
    mock_client_cls.return_value = mock_client
    mock_db.save_pipeline_job = AsyncMock()

    resp = client.post("/api/pipeline/run", json={
        "mode": "ME",
        "entities": ["test-entity-a", "test-entity-b"],
        "config": {"convergence_engagement_id": "eng-conv-1"},
    })
    assert resp.status_code == 200
    data = resp.json()

    assert len(cofa_bodies) == 1
    pipeline_run_id = data["pipeline_run_id"]

    # COFA body must include full pipeline_run_id and engagement_id
    assert cofa_bodies[0]["pipeline_run_id"] == pipeline_run_id
    assert cofa_bodies[0]["engagement_id"] == "eng-conv-1"
    assert len(pipeline_run_id) == 36  # Full UUID
