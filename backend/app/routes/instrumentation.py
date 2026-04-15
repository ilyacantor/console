"""Instrumentation routes — Mai run ledger and cost tracking."""

import logging

from fastapi import APIRouter, Query

from backend.app import db

logger = logging.getLogger("console.instrumentation")

router = APIRouter()


@router.get("/runs")
async def get_runs(
    engagement_id: str | None = Query(default=None),
    step_name: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
):
    """Query mai runs with optional filters."""
    runs = await db.get_mai_runs(
        engagement_id=engagement_id,
        step_name=step_name,
        limit=limit,
    )
    return {"runs": runs, "count": len(runs)}


@router.get("/summary")
async def get_summary(engagement_id: str | None = Query(default=None)):
    """Aggregate stats: total runs, tokens, cost, avg duration."""
    summary = await db.get_mai_summary(engagement_id=engagement_id)
    return summary
