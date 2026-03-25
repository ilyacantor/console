"""Engagement routes — deal lifecycle and state management."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.app import db

logger = logging.getLogger("console.engagements")

router = APIRouter()


class EngagementUpdate(BaseModel):
    lifecycle_stage: str | None = None
    state_json: dict | None = None


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
