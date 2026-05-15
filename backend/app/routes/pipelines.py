"""Console pipelines routes — operator surfaces over the AAM → DCL pipeline.

Four surfaces:
  GET  /api/pipelines/catalog            — AAM-discovered pipes
  GET  /api/pipelines/mappings           — AAM field-mapping packs
  POST /api/pipelines/mappings/approve   — operator approves a mid-confidence mapping
  GET  /api/pipelines/identity/pending   — AAM resolver HITL pending queue
  POST /api/pipelines/identity/decision  — operator approve/reject
  GET  /api/pipelines/identity/audit     — audit trail for one HITL row
  POST /api/pipelines/consumer/query     — Console MCP-client query to DCL
  POST /api/pipelines/consumer/provenance — Console MCP-client provenance drill-through

Every Console route forwards identity (tenant_id + entity_id) end-to-end (I2)
and surfaces upstream failures with the specific endpoint + cause (no silent
fallback). Identifiers in responses are namespaced (I1) — never bare run_id.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app import config
from backend.app.services.dcl_mcp_client import (
    ConsoleMCPClientError,
    provenance as mcp_provenance,
    query_triples as mcp_query_triples,
)

router = APIRouter()
logger = logging.getLogger("console.pipelines")

# Upstream call ceiling — Console must propagate errors quickly so the UI can
# render an informative failure surface rather than hang on the spinner.
_AAM_TIMEOUT = 8.0


async def _aam_get(path: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """GET an AAM endpoint and unwrap to JSON. Raises HTTPException on failure
    with the full endpoint + cause embedded in the detail."""
    url = f"{config.AAM_BASE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=_AAM_TIMEOUT) as client:
            resp = await client.get(url, params=params or {})
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AAM unreachable at {url} — connection refused: {exc}",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=f"AAM timeout at {url} after {_AAM_TIMEOUT:.1f}s: {exc}",
        ) from exc
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"AAM {path} returned {resp.status_code}: {resp.text[:400]}",
        )
    return resp.json()


async def _aam_post(path: str, *, json_body: dict[str, Any]) -> dict[str, Any]:
    url = f"{config.AAM_BASE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=_AAM_TIMEOUT) as client:
            resp = await client.post(url, json=json_body)
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AAM unreachable at {url} — connection refused: {exc}",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=f"AAM timeout at {url} after {_AAM_TIMEOUT:.1f}s: {exc}",
        ) from exc
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"AAM {path} returned {resp.status_code}: {resp.text[:400]}",
        )
    return resp.json()


# ---------------------------------------------------------------------------
# 1. Pipe catalog
# ---------------------------------------------------------------------------


@router.get("/catalog")
async def catalog() -> dict[str, Any]:
    """Return the list of AAM-declared pipes.

    Shape per pipe (subset, what the UI renders):
      display_name, source_system, fabric_plane, modality, identity_keys,
      vendor (best-effort inferred from provenance.lineage_hints).
    """
    data = await _aam_get("/api/pipes")
    pipes_raw = data.get("pipes") or []
    pipes: list[dict[str, Any]] = []
    for p in pipes_raw:
        vendor = ""
        hints = (p.get("provenance") or {}).get("lineage_hints") or []
        for h in hints:
            if isinstance(h, str) and h.startswith("vendor:"):
                vendor = h.split(":", 1)[1]
                break
        identity_keys = p.get("identity_keys") or []
        if isinstance(identity_keys, str):
            identity_keys = [identity_keys]
        pipes.append({
            "pipe_id": p.get("pipe_id"),
            "display_name": p.get("display_name") or "",
            "vendor": vendor,
            "source_system": p.get("source_system") or "",
            "fabric_plane": p.get("fabric_plane") or "",
            "modality": p.get("modality") or "",
            "identity_keys": list(identity_keys),
        })
    return {"pipes": pipes, "count": len(pipes)}


# ---------------------------------------------------------------------------
# 2. Semantic mapping
# ---------------------------------------------------------------------------


class ApproveMappingRequest(BaseModel):
    pack_key: str
    source_field: str
    approved: bool = True


@router.get("/mappings")
async def mappings() -> dict[str, Any]:
    """Return AAM mapping packs (source_field → concept.property with confidence)."""
    return await _aam_get("/api/aam/mappings")


@router.post("/mappings/approve")
async def approve_mapping(req: ApproveMappingRequest) -> dict[str, Any]:
    """Operator approves a mid-confidence mapping via AAM's approval endpoint."""
    return await _aam_post(
        "/api/aam/mappings/approve",
        json_body=req.model_dump(),
    )


# ---------------------------------------------------------------------------
# 3. Identity review queue (WP3)
# ---------------------------------------------------------------------------


class IdentityDecisionRequest(BaseModel):
    hitl_queue_id: str = Field(..., description="The pending HITL row to finalize.")
    decision: str = Field(..., description="'approved' or 'rejected'")
    decided_by: str = Field(..., description="Operator id / email — required for the audit trail.")


@router.get("/identity/pending")
async def identity_pending(
    tenant_id: str = Query(...),
    entity_id: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> dict[str, Any]:
    """Return the AAM resolver HITL pending queue for a tenant.

    tenant_id is required (I2 — no silent fallback). Console returns 422
    when missing, matching AAM's invariant.
    """
    if not tenant_id:
        raise HTTPException(status_code=422, detail="tenant_id is required (I2)")
    params: dict[str, Any] = {"tenant_id": tenant_id, "limit": limit}
    if entity_id:
        params["entity_id"] = entity_id
    if domain:
        params["domain"] = domain
    return await _aam_get("/api/aam/resolver/pending", params=params)


@router.post("/identity/decision")
async def identity_decision(req: IdentityDecisionRequest) -> dict[str, Any]:
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="decision must be 'approved' or 'rejected'")
    return await _aam_post(
        "/api/aam/resolver/decisions",
        json_body=req.model_dump(),
    )


@router.get("/identity/audit")
async def identity_audit(hitl_queue_id: str = Query(...)) -> dict[str, Any]:
    if not hitl_queue_id:
        raise HTTPException(status_code=422, detail="hitl_queue_id is required")
    return await _aam_get(
        "/api/aam/resolver/audit",
        params={"hitl_queue_id": hitl_queue_id},
    )


# ---------------------------------------------------------------------------
# 4. Consumer drill-through — Console as MCP client to DCL
# ---------------------------------------------------------------------------


class ConsumerQueryRequest(BaseModel):
    tenant_id: str
    entity_id: str | None = None
    domain: str | None = None
    concept: str | None = None
    period: str | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    active_only: bool = True


class ConsumerProvenanceRequest(BaseModel):
    tenant_id: str
    triple_id: str | None = None
    concept: str | None = None
    entity_id: str | None = None
    period: str | None = None


@router.get("/consumer/query")
async def consumer_query_get(
    tenant_id: str = Query(...),
    entity_id: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    concept: str | None = Query(default=None),
    period: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    active_only: bool = Query(default=True),
) -> dict[str, Any]:
    """GET form of /consumer/query — query_triples is a read-only tool, so a
    GET form exists for read-time callers (Playwright ground-truth fetches,
    tooling that prefers idempotent GETs). Body shape and result are
    identical to the POST variant."""
    return await consumer_query(ConsumerQueryRequest(
        tenant_id=tenant_id,
        entity_id=entity_id,
        domain=domain,
        concept=concept,
        period=period,
        limit=limit,
        active_only=active_only,
    ))


@router.post("/consumer/query")
async def consumer_query(req: ConsumerQueryRequest) -> dict[str, Any]:
    """Run DCL's `query_triples` MCP tool. tenant_id is required (I2).

    The Console backend acts as the MCP client; DCL's MCP server is the
    server. The token is minted per-call using the shared HMAC secret.

    DCL's MCP tool returns a list of triple dicts. We wrap it in
    `{triples, count}` so the response shape is stable even when DCL
    returns an empty result, and so the UI can render counts.
    """
    if not req.tenant_id:
        raise HTTPException(status_code=422, detail="tenant_id is required (I2)")
    if not (req.domain or req.concept):
        raise HTTPException(
            status_code=400,
            detail="query_triples requires at least one of 'domain' or 'concept'",
        )
    try:
        result = await mcp_query_triples(
            tenant_id=req.tenant_id,
            domain=req.domain,
            concept=req.concept,
            entity_id=req.entity_id,
            period=req.period,
            limit=req.limit,
            active_only=req.active_only,
        )
    except ConsoleMCPClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    triples = result if isinstance(result, list) else (result.get("triples") if isinstance(result, dict) else [])
    return {
        "tenant_id": req.tenant_id,
        "entity_id": req.entity_id,
        "domain": req.domain,
        "concept": req.concept,
        "triples": triples or [],
        "count": len(triples or []),
    }


@router.post("/consumer/provenance")
async def consumer_provenance(req: ConsumerProvenanceRequest) -> dict[str, Any]:
    """Run DCL's `provenance` MCP tool — source chain for a triple.

    DCL returns either a single object with `sources: [...]` or a list of
    source rows directly; we normalize to `{sources, count}` so the UI
    consumes one shape.
    """
    if not req.tenant_id:
        raise HTTPException(status_code=422, detail="tenant_id is required (I2)")
    if not (req.triple_id or req.concept):
        raise HTTPException(
            status_code=400,
            detail="provenance requires either 'triple_id' or 'concept'",
        )
    try:
        result = await mcp_provenance(
            tenant_id=req.tenant_id,
            triple_id=req.triple_id,
            concept=req.concept,
            entity_id=req.entity_id,
            period=req.period,
        )
    except ConsoleMCPClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if isinstance(result, dict) and "sources" in result:
        sources = result["sources"] or []
    elif isinstance(result, list):
        sources = result
    elif isinstance(result, dict):
        # provenance returns a single object — convert into sources list
        sources = [result]
    else:
        sources = []
    return {
        "tenant_id": req.tenant_id,
        "triple_id": req.triple_id,
        "concept": req.concept,
        "entity_id": req.entity_id,
        "sources": sources,
        "count": len(sources),
    }
