"""Pipeline endpoints — run, reset, and history."""

from fastapi import APIRouter, HTTPException, Query

from backend.app import db
from backend.app.models.pipeline import RunPipelineRequest
from backend.app.services import pipeline_orchestrator

router = APIRouter()


@router.post("/run")
async def run_pipeline(req: RunPipelineRequest):
    """Execute a pipeline run (SE or ME mode)."""
    if req.mode == "ME" and len(req.entities) < 2:
        raise HTTPException(
            status_code=400,
            detail="ME mode requires at least 2 entities",
        )

    result = await pipeline_orchestrator.run_pipeline(
        mode=req.mode,
        entities=req.entities,
    )
    return result.model_dump()


@router.post("/reset")
async def reset_pipeline():
    """Reset pipeline state."""
    return {"status": "ok", "message": "Pipeline state cleared"}


@router.get("/runs")
async def get_runs(limit: int = Query(default=20, ge=1, le=100)):
    """Get recent pipeline runs."""
    runs = await db.get_runs(limit=limit)
    return {"runs": runs}


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    """Get a single pipeline run by ID."""
    run = await db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return run


@router.get("/config/baselines")
async def get_baselines():
    """Get pipeline step baselines."""
    baselines = await db.get_config("baselines")
    if baselines is None:
        from backend.app.config import DEFAULT_BASELINES
        baselines = DEFAULT_BASELINES
    return {"baselines": baselines}


@router.put("/config/baselines")
async def update_baselines(baselines: dict):
    """Update pipeline step baselines."""
    await db.set_config("baselines", baselines)
    return {"status": "ok", "baselines": baselines}
