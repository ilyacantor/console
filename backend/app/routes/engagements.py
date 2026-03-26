"""Engagement routes — deal lifecycle and state management."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.app import db

logger = logging.getLogger("console.engagements")

router = APIRouter()


class EngagementCreate(BaseModel):
    acquirer_entity_id: str
    target_entity_id: str
    engagement_type: str = "MA"


class EngagementUpdate(BaseModel):
    lifecycle_stage: str | None = None
    state_json: dict | None = None


@router.post("")
async def create_engagement(body: EngagementCreate):
    """Create a new engagement."""
    engagement_id = await db.create_engagement(
        acquirer_entity_id=body.acquirer_entity_id,
        target_entity_id=body.target_entity_id,
        engagement_type=body.engagement_type,
    )
    row = await db.get_engagement(engagement_id)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create engagement")
    return row


@router.get("")
async def list_engagements():
    """List all engagements."""
    rows = await db.get_engagements()
    return {"engagements": rows}


@router.get("/{engagement_id}")
async def get_engagement(engagement_id: str):
    """Get a single engagement by ID."""
    row = await db.get_engagement(engagement_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Engagement {engagement_id} not found")
    return row


@router.get("/{engagement_id}/history")
async def get_engagement_history(engagement_id: str, limit: int = 50):
    """Get chronological history for an engagement from all run tables."""
    existing = await db.get_engagement(engagement_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Engagement {engagement_id} not found")
    events = await db.get_engagement_history(engagement_id, limit=limit)
    return {"events": events}


@router.get("/{engagement_id}/conflicts")
async def get_engagement_conflicts(engagement_id: str):
    """Get COFA conflicts scoped to an engagement."""
    existing = await db.get_engagement(engagement_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Engagement {engagement_id} not found")
    conflicts = await db.get_conflicts(engagement_id)
    return {"conflicts": conflicts}


@router.patch("/{engagement_id}")
async def update_engagement(engagement_id: str, body: EngagementUpdate):
    """Update engagement lifecycle_stage and/or state_json."""
    existing = await db.get_engagement(engagement_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Engagement {engagement_id} not found")

    await db.update_engagement(
        engagement_id,
        lifecycle_stage=body.lifecycle_stage,
        state_json=body.state_json,
    )
    updated = await db.get_engagement(engagement_id)
    return updated
