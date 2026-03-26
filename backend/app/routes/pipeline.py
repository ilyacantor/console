"""Pipeline endpoints — start, status, advance, history, recon."""

import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from backend.app import config, db
from backend.app.models.pipeline import (
    ExecutionMode,
    PipelineJob,
    PipelineMode,
    StartPipelineRequest,
    StartPipelineResponse,
    StepStatus,
)
from backend.app.services import pipeline_orchestrator
from backend.app.services.pipeline_orchestrator import PIPELINE_JOBS

import httpx

logger = logging.getLogger("console.pipeline")

router = APIRouter()


@router.post("/start", response_model=StartPipelineResponse)
async def start_pipeline(req: StartPipelineRequest, background_tasks: BackgroundTasks):
    """Start an SE or ME pipeline in batch or step-by-step mode."""
    import uuid

    job_id = str(uuid.uuid4())[:8]

    steps = (pipeline_orchestrator.create_se_steps()
             if req.mode == PipelineMode.SE
             else pipeline_orchestrator.create_me_steps())

    job = PipelineJob(
        job_id=job_id,
        pipeline_mode=req.mode,
        execution_mode=req.execution,
        started_at=pipeline_orchestrator._now(),
        steps=steps,
        total_steps=len(steps),
        message=f"{req.mode.value.upper()} pipeline started "
                f"({req.execution.value} mode)",
        config=req.config or {},
    )

    # ME pipeline: generate shared triples_id for provenance tracking
    if req.mode == PipelineMode.ME:
        job.config["_triples_id"] = f"triples_{job_id}"

    PIPELINE_JOBS[job_id] = job

    if req.execution == ExecutionMode.BATCH:
        background_tasks.add_task(pipeline_orchestrator.run_pipeline_batch,
                                  job_id)
        logger.info(f"[PIPELINE] {req.mode.value.upper()} batch pipeline "
                    f"started: job_id={job_id}")
    else:
        first_indices = pipeline_orchestrator.get_next_step_indices(job)
        if first_indices:
            background_tasks.add_task(pipeline_orchestrator.run_single_step,
                                      job_id, first_indices)
            logger.info(f"[PIPELINE] {req.mode.value.upper()} step pipeline "
                        f"started: job_id={job_id}")

    return StartPipelineResponse(
        job_id=job_id,
        status="started",
        message=f"{req.mode.value.upper()} pipeline started. "
                f"Poll /api/pipeline/status?job_id={job_id} for progress.",
    )


@router.get("/status", response_model=PipelineJob)
async def get_pipeline_status(job_id: str):
    """Get the current status of a pipeline job (in-memory, fast)."""
    job = PIPELINE_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404,
                            detail=f"Job {job_id} not found")
    return job


@router.post("/advance", response_model=PipelineJob)
async def advance_pipeline(job_id: str, background_tasks: BackgroundTasks):
    """Run the next pending step in step-by-step mode."""
    job = PIPELINE_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404,
                            detail=f"Job {job_id} not found")

    if job.execution_mode != ExecutionMode.STEP:
        raise HTTPException(
            status_code=400,
            detail="Cannot advance a batch pipeline — it runs all steps "
                   "automatically",
        )

    running = [s for s in job.steps if s.status == StepStatus.RUNNING]
    if running:
        raise HTTPException(
            status_code=409,
            detail=f"Step '{running[0].display_name}' is still running — "
                   f"wait for it to complete before advancing",
        )

    next_indices = pipeline_orchestrator.get_next_step_indices(job)
    if not next_indices:
        raise HTTPException(
            status_code=400,
            detail="No more pending steps to advance to",
        )

    background_tasks.add_task(pipeline_orchestrator.run_single_step,
                              job_id, next_indices)
    logger.info(f"[PIPELINE] Advancing {job_id}: step(s) {next_indices}")

    return job


# ── Legacy blocking endpoint (backward compat) ──────────────────────

@router.post("/run")
async def run_pipeline_legacy(req: dict):
    """Legacy blocking pipeline run — redirects to new start endpoint."""
    mode_str = req.get("mode", "SE").upper()
    if mode_str not in ("SE", "ME"):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid mode '{mode_str}'. Must be 'SE' or 'ME'.",
        )
    mode = PipelineMode.SE if mode_str == "SE" else PipelineMode.ME
    entities = req.get("entities", [])
    if mode == PipelineMode.ME and len(entities) < 2:
        raise HTTPException(
            status_code=400,
            detail="ME mode requires at least 2 entities.",
        )

    import uuid
    job_id = str(uuid.uuid4())[:8]

    steps = (pipeline_orchestrator.create_se_steps()
             if mode == PipelineMode.SE
             else pipeline_orchestrator.create_me_steps())

    job = PipelineJob(
        job_id=job_id,
        pipeline_mode=mode,
        execution_mode=ExecutionMode.BATCH,
        started_at=pipeline_orchestrator._now(),
        steps=steps,
        total_steps=len(steps),
        message=f"{mode.value.upper()} pipeline started (batch mode)",
        config={"entities": entities},
    )

    PIPELINE_JOBS[job_id] = job
    await pipeline_orchestrator.run_pipeline_batch(job_id)
    return job.model_dump()


@router.post("/reset")
async def reset_pipeline():
    """Clear in-memory pipeline state."""
    PIPELINE_JOBS.clear()
    return {"status": "ok", "message": "Pipeline state cleared"}


# ── Run History (from Postgres) ──────────────────────────────────────

@router.get("/runs")
async def get_runs(limit: int = Query(default=20, ge=1, le=100)):
    """Get recent pipeline jobs from Postgres."""
    jobs = await db.get_pipeline_jobs(limit=limit)
    return {"runs": jobs}


@router.get("/runs/{job_id}")
async def get_run(job_id: str):
    """Get a single pipeline job by ID."""
    # Check in-memory first (active jobs)
    job = PIPELINE_JOBS.get(job_id)
    if job:
        return job.model_dump()

    # Fall back to Postgres
    row = await db.get_pipeline_job(job_id)
    if not row:
        raise HTTPException(status_code=404,
                            detail=f"Job {job_id} not found")
    return row


# ── Baselines (unchanged) ───────────────────────────────────────────

@router.get("/config/baselines")
async def get_baselines():
    baselines = await db.get_config("baselines")
    if baselines is None:
        baselines = config.DEFAULT_BASELINES
    return {"baselines": baselines}


@router.put("/config/baselines")
async def update_baselines(baselines: dict):
    await db.set_config("baselines", baselines)
    return {"status": "ok", "baselines": baselines}


# ── DCL Recon ────────────────────────────────────────────────────────

@router.get("/dcl-recon")
async def get_dcl_recon(job_id: str):
    """Fetch DCL recon checks for a completed pipeline job."""
    job = PIPELINE_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404,
                            detail=f"Job {job_id} not found")

    if not pipeline_orchestrator.is_terminal(job.status):
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} is not in a terminal state "
                   f"(status={job.status}). Recon checks are only available "
                   f"after pipeline completion.",
        )

    dcl_url = config.DCL_BASE_URL
    if not dcl_url:
        raise HTTPException(
            status_code=503,
            detail="DCL_BASE_URL not configured — cannot fetch recon checks.",
        )

    context = pipeline_orchestrator._extract_job_context(job)
    entity_id = context.get("tenant_id")

    params: dict[str, str] = {}
    if entity_id:
        params["entity_id"] = entity_id

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{dcl_url}/api/dcl/recon", params=params)
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Could not reach DCL at {dcl_url}/api/dcl/recon — "
                   f"connection refused.",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"DCL recon request timed out after 10s.",
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"DCL recon returned HTTP {resp.status_code}: "
                   f"{pipeline_orchestrator._extract_error(resp)}",
        )

    result = resp.json()

    # Persist to recon_history
    provenance_tag = context.get("provenance_tag")
    run_id = result.get("run_id") or context.get("run_id")
    history_id = await db.save_recon(
        job_id=job_id,
        pipeline_mode=job.pipeline_mode.value,
        entity_id=entity_id,
        run_id=run_id,
        provenance_tag=provenance_tag,
        overall=result.get("overall", "fail"),
        checks=result.get("checks", []),
    )
    result["history_id"] = history_id
    return result


@router.get("/dcl-recon/history")
async def get_recon_history(limit: int = Query(default=20, ge=1, le=100)):
    """List recent DCL recon snapshots."""
    rows = await db.get_recon_history(limit=limit)
    return rows


@router.get("/dcl-recon/history/{history_id}")
async def get_recon_snapshot(history_id: int):
    """Get a specific recon snapshot with full check data."""
    row = await db.get_recon_snapshot(history_id)
    if not row:
        raise HTTPException(status_code=404,
                            detail=f"Recon snapshot {history_id} not found")
    return row
