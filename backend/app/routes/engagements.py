"""Engagement routes — proxied to Convergence (canonical owner)."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import httpx

from backend.app.services import convergence_client

logger = logging.getLogger("console.engagements")

router = APIRouter()


class EngagementCreate(BaseModel):
    acquirer_entity_id: str
    target_entity_id: str
    engagement_type: str = "MA"


class EngagementUpdate(BaseModel):
    lifecycle_stage: str | None = None
    state: dict | None = None


@router.post("")
async def create_engagement(body: EngagementCreate):
    """Create a new engagement in Convergence."""
    try:
        return await convergence_client.create_engagement(
            acquirer_entity_id=body.acquirer_entity_id,
            target_entity_id=body.target_entity_id,
            engagement_type=body.engagement_type,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach Convergence: {e}")


@router.get("")
async def list_engagements():
    """List all engagements from Convergence."""
    try:
        rows = await convergence_client.list_engagements()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach Convergence: {e}")
    return {"engagements": rows}


@router.get("/{engagement_id}")
async def get_engagement(engagement_id: str):
    """Get a single engagement from Convergence."""
    try:
        row = await convergence_client.get_engagement(engagement_id)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach Convergence: {e}")
    if not row:
        raise HTTPException(status_code=404, detail=f"Engagement {engagement_id} not found")
    return row


@router.get("/{engagement_id}/history")
async def get_engagement_history(engagement_id: str, limit: int = 50):
    """Get run history from Convergence."""
    try:
        events = await convergence_client.get_engagement_history(engagement_id, limit=limit)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach Convergence: {e}")
    return {"events": events}


@router.get("/{engagement_id}/conflicts")
async def get_engagement_conflicts(engagement_id: str):
    """Get COFA conflicts from Convergence."""
    try:
        conflicts = await convergence_client.get_conflicts(engagement_id)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach Convergence: {e}")
    return {"conflicts": conflicts}


@router.patch("/{engagement_id}")
async def update_engagement(engagement_id: str, body: EngagementUpdate):
    """Update engagement in Convergence."""
    try:
        result = await convergence_client.update_engagement(
            engagement_id,
            lifecycle_stage=body.lifecycle_stage,
            state=body.state,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach Convergence: {e}")
    if not result:
        raise HTTPException(status_code=404, detail=f"Engagement {engagement_id} not found")
    return result
