"""Pipeline orchestrator — sequential calls to module APIs."""

import asyncio
import logging
import time
import uuid

import httpx

from backend.app import config, db
from backend.app.models.pipeline import PipelineRunResult, PipelineStepResult

logger = logging.getLogger("console.pipeline")

# Poll interval for Farm generation status
_FARM_POLL_INTERVAL = 2.0
_FARM_POLL_TIMEOUT = 300.0  # 5 minutes max


async def run_pipeline(mode: str, entities: list[str]) -> PipelineRunResult:
    """Execute a pipeline run.

    SE mode: Farm generate (single entity) → DCL verify
    ME mode: Farm generate (both entities) → DCL verify → COFA unification
    """
    run_id = str(uuid.uuid4())
    entity_str = ",".join(entities)

    if mode == "SE":
        steps = [
            PipelineStepResult(name="farm_gen", display_name="Farm Generate"),
            PipelineStepResult(name="dcl_verify", display_name="DCL Ingest Verify"),
        ]
    else:
        steps = [
            PipelineStepResult(
                name="farm_gen", display_name=f"Farm Generate ({entity_str})"
            ),
            PipelineStepResult(name="dcl_verify", display_name="DCL Ingest Verify"),
            PipelineStepResult(
                name="cofa_unification", display_name="COFA Unification"
            ),
        ]

    result = PipelineRunResult(
        run_id=run_id,
        mode=mode,
        entity_ids=entities,
        steps=steps,
    )

    pipeline_start = time.monotonic()
    total_triples = 0

    async with httpx.AsyncClient(timeout=300.0) as client:
        for step in steps:
            step.status = "running"

            step_start = time.monotonic()

            if step.name == "farm_gen":
                await _step_farm_generate(client, step, entities)
            elif step.name == "dcl_verify":
                await _step_dcl_verify(client, step)
            elif step.name == "cofa_unification":
                await _step_cofa_unification(client, step)

            step.duration_s = round(time.monotonic() - step_start, 1)

            if step.triples:
                total_triples += step.triples

            if step.status == "failed":
                result.status = "fail"
                result.total_duration_s = round(time.monotonic() - pipeline_start, 1)
                result.total_triples = total_triples
                await _persist_run(result)
                return result

    result.status = "pass"
    result.total_duration_s = round(time.monotonic() - pipeline_start, 1)
    result.total_triples = total_triples
    await _persist_run(result)
    return result


async def _step_farm_generate(
    client: httpx.AsyncClient,
    step: PipelineStepResult,
    entities: list[str],
) -> None:
    """Call Farm's triple generation endpoint and poll until complete."""
    url = f"{config.FARM_BASE_URL}/api/business-data/generate-multi-entity-triples"
    params = {
        "entities": ",".join(entities),
        "skip_push": "false",
    }

    try:
        resp = await client.post(url, params=params)
    except httpx.ConnectError:
        step.status = "failed"
        step.error = (
            f"Could not reach Farm at {url} — connection refused. "
            f"Verify Farm is running at {config.FARM_BASE_URL}."
        )
        return
    except httpx.TimeoutException as exc:
        step.status = "failed"
        step.error = f"Farm request timed out at {url} — {exc}"
        return

    if resp.status_code == 409:
        step.status = "failed"
        step.error = (
            "Farm triple generation already in progress. "
            "Wait for the current generation to complete before starting a new one."
        )
        return

    if resp.status_code not in (200, 202):
        step.status = "failed"
        step.error = (
            f"Farm generation failed (HTTP {resp.status_code}): "
            f"{_extract_error(resp)}"
        )
        return

    data = resp.json()
    step.detail = f"Generation started: {data.get('status', 'unknown')}"

    # Poll generation-status until idle
    status_url = f"{config.FARM_BASE_URL}/api/business-data/generation-status"
    deadline = time.monotonic() + _FARM_POLL_TIMEOUT

    while time.monotonic() < deadline:
        await asyncio.sleep(_FARM_POLL_INTERVAL)

        try:
            status_resp = await client.get(status_url)
        except (httpx.ConnectError, httpx.TimeoutException):
            continue  # Transient — retry

        if status_resp.status_code != 200:
            continue

        status_data = status_resp.json()
        gen_status = status_data.get("status", "unknown")

        if gen_status == "idle":
            # Generation complete
            error = status_data.get("error")
            if error:
                step.status = "failed"
                step.error = f"Farm generation failed: {error}"
                return

            push_result = status_data.get("push_result") or {}
            triples = push_result.get("total_triples", 0)
            if isinstance(triples, (int, float)):
                step.triples = int(triples)

            run_id = status_data.get("run_id")
            step.detail = f"Generation complete (run_id={run_id})"
            step.status = "success"
            return

        # Still generating or pushing — continue polling

    step.status = "failed"
    step.error = f"Farm generation timed out after {_FARM_POLL_TIMEOUT}s"


async def _step_dcl_verify(
    client: httpx.AsyncClient,
    step: PipelineStepResult,
) -> None:
    """Verify triples landed in DCL."""
    url = f"{config.DCL_BASE_URL}/api/dcl/triples/overview"

    try:
        resp = await client.get(url)
    except httpx.ConnectError:
        step.status = "failed"
        step.error = (
            f"Could not reach DCL at {url} — connection refused. "
            f"Verify DCL is running at {config.DCL_BASE_URL}."
        )
        return
    except httpx.TimeoutException as exc:
        step.status = "failed"
        step.error = f"DCL request timed out at {url} — {exc}"
        return

    if resp.status_code != 200:
        step.status = "failed"
        step.error = (
            f"DCL triple check failed (HTTP {resp.status_code}): "
            f"{_extract_error(resp)}"
        )
        return

    data = resp.json()
    total = data.get("total_triples", data.get("count", 0))
    step.triples = int(total) if total else 0
    step.detail = f"DCL has {step.triples:,} triples"
    step.status = "success"


async def _step_cofa_unification(
    client: httpx.AsyncClient,
    step: PipelineStepResult,
) -> None:
    """Trigger COFA unification via Platform's Maestra endpoint."""
    url = f"{config.PLATFORM_BASE_URL}/api/maestra/cofa-chat"

    # COFA requires an active engagement — attempt to find one
    engagements_url = f"{config.PLATFORM_BASE_URL}/api/maestra/engagements"

    try:
        eng_resp = await client.get(engagements_url)
    except httpx.ConnectError:
        step.status = "failed"
        step.error = (
            f"Could not reach Platform at {engagements_url} — connection refused. "
            f"Verify Platform is running at {config.PLATFORM_BASE_URL}."
        )
        return
    except httpx.TimeoutException as exc:
        step.status = "failed"
        step.error = f"Platform request timed out at {engagements_url} — {exc}"
        return

    if eng_resp.status_code != 200:
        step.status = "failed"
        step.error = (
            f"Could not fetch engagements (HTTP {eng_resp.status_code}): "
            f"{_extract_error(eng_resp)}"
        )
        return

    engagements = eng_resp.json()
    if isinstance(engagements, dict):
        engagements = engagements.get("engagements", [])

    # Find an active engagement
    active = None
    for eng in engagements:
        if eng.get("state") == "active":
            active = eng
            break

    if not active:
        by_state: dict[str, list] = {}
        for eng in engagements:
            by_state.setdefault(eng.get("state", "unknown"), []).append(
                eng.get("engagement_id", "?")
            )
        state_summary = "; ".join(
            f"{st}: {', '.join(ids)}" for st, ids in by_state.items()
        )
        step.status = "failed"
        step.error = (
            f"No active engagement found for COFA unification. "
            f"Existing engagements — {state_summary or 'none'}. "
            f"Create and activate an engagement before running ME pipeline."
        )
        return

    engagement_id = active["engagement_id"]

    # Send COFA initiation message
    body = {
        "engagement_id": engagement_id,
        "message": "Begin COFA unification analysis",
        "session_id": str(uuid.uuid4()),
    }

    try:
        resp = await client.post(url, json=body)
    except httpx.ConnectError:
        step.status = "failed"
        step.error = (
            f"Could not reach Platform COFA at {url} — connection refused."
        )
        return
    except httpx.TimeoutException as exc:
        step.status = "failed"
        step.error = f"COFA request timed out at {url} — {exc}"
        return

    if resp.status_code != 200:
        step.status = "failed"
        step.error = (
            f"COFA unification failed (HTTP {resp.status_code}): "
            f"{_extract_error(resp)}"
        )
        return

    step.detail = f"COFA complete (engagement={engagement_id})"
    step.status = "success"


def _extract_error(resp: httpx.Response) -> str:
    """Extract error detail from an HTTP response."""
    try:
        data = resp.json()
        return str(data.get("detail", data))
    except Exception:
        text = resp.text[:500] if resp.text else "(empty response)"
        return text


async def _persist_run(result: PipelineRunResult) -> None:
    """Store a completed pipeline run in the database."""
    try:
        await db.save_run(
            run_id=result.run_id,
            mode=result.mode,
            entity_ids=result.entity_ids,
            steps=[s.model_dump() for s in result.steps],
            total_duration_s=result.total_duration_s or 0.0,
            total_triples=result.total_triples or 0,
            status=result.status,
        )
    except Exception as exc:
        logger.error(f"Failed to persist pipeline run {result.run_id}: {exc}")
