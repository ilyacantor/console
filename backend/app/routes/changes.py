"""Change feed routes — event listing, filtering, acknowledgment, manual trigger."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from backend.app import db
from backend.app.services import cron_scheduler

logger = logging.getLogger("console.changes")

router = APIRouter()


@router.get("")
async def list_changes(
    since: str | None = Query(None, description="ISO datetime — only events after this time"),
    severity: str | None = Query(None, description="Filter by severity: critical, warning, info"),
    module: str | None = Query(None, description="Filter by source module: aod, aam, dcl"),
    limit: int = Query(50, ge=1, le=200),
    acknowledged: bool | None = Query(None, description="Filter by acknowledged state"),
):
    """List change events with optional filters."""
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid 'since' datetime format: {since}. Use ISO 8601.",
            )

    events = await db.get_change_events(
        since=since_dt,
        severity=severity,
        module=module,
        acknowledged=acknowledged,
        limit=limit,
    )
    return {"events": events, "count": len(events)}


@router.post("/{event_id}/acknowledge")
async def acknowledge_event(event_id: str):
    """Mark a change event as acknowledged."""
    success = await db.acknowledge_event(event_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Change event {event_id} not found")
    return {"status": "ok", "event_id": event_id}


@router.get("/summary")
async def change_summary():
    """Get unacknowledged event counts by severity and last scan time."""
    return await db.get_change_summary()


@router.post("/detect/{module}")
async def trigger_detection(module: str):
    """Manually trigger change detection for a module."""
    valid_modules = {"aod", "aam", "dcl"}
    if module not in valid_modules:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid module '{module}'. Valid: {', '.join(sorted(valid_modules))}",
        )

    result = await cron_scheduler.trigger_detection(module)
    return result
