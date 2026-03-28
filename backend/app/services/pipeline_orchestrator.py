"""Pipeline orchestrator — ported from Platform's operator.py.

Orchestrates SE and ME pipelines by calling each external service's
real API endpoints. Supports batch (run all steps) and step-by-step
(run one step at a time) execution modes.

SE pipeline: Farm Snapshot → AOD Discovery → AOD→AAM Handoff →
             AAM Inference → DCL Ingest → Complete
ME pipeline: DCL Ingest A ∥ B (parallel) → DCL Ingest Verify →
             COFA Unification → Complete
"""

import asyncio
import logging
import time
import uuid
from datetime import datetime
from typing import Any

import httpx

from backend.app import config, db
from backend.app.models.pipeline import (
    ExecutionMode,
    PipelineJob,
    PipelineMode,
    PipelineStep,
    StepStatus,
)

logger = logging.getLogger("console.pipeline")

# ── In-memory job store (fast polling path) ──────────────────────────
PIPELINE_JOBS: dict[str, PipelineJob] = {}


# ── Helpers ──────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _json_headers() -> dict[str, str]:
    return {"Content-Type": "application/json"}


def _aod_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if config.AOD_API_KEY:
        headers["X-API-Key"] = config.AOD_API_KEY
    return headers


def _mark_step(
    step: PipelineStep,
    status: StepStatus,
    message: str,
    data: dict[str, Any] | None = None,
    start_time: float | None = None,
) -> None:
    step.status = status
    step.message = message
    if status == StepStatus.RUNNING:
        step.started_at = _now()
    if status in (StepStatus.SUCCESS, StepStatus.FAILED, StepStatus.SKIPPED):
        step.completed_at = _now()
        if start_time is not None:
            step.duration_ms = int((time.time() - start_time) * 1000)
    if data:
        step.data = data


def is_terminal(status: str) -> bool:
    return status in ("completed", "completed_with_errors")


def _require_url(env_name: str, url_value: str, step_context: str) -> str:
    if not url_value:
        raise ValueError(
            f"{env_name} not configured — cannot execute {step_context}. "
            f"Set {env_name} environment variable."
        )
    return url_value.rstrip("/")


def _extract_error(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        if isinstance(body, dict) and "detail" in body:
            return str(body["detail"])[:500]
        return str(body)[:500]
    except Exception:
        return resp.text[:500] if resp.text else f"HTTP {resp.status_code}"


# ── Pipeline Step Definitions ────────────────────────────────────────

def create_se_steps() -> list[PipelineStep]:
    return [
        PipelineStep(name="farm_snapshot", display_name="Farm Snapshot",
                     message="Generate enterprise snapshot"),
        PipelineStep(name="aod_discovery", display_name="AOD Discovery",
                     message="Discover and classify assets"),
        PipelineStep(name="aod_aam_handoff", display_name="AOD → AAM Handoff",
                     message="Export candidates to AAM"),
        PipelineStep(name="aam_inference", display_name="AAM Inference",
                     message="Infer pipe definitions"),
        PipelineStep(name="farm_financials", display_name="DCL Ingest",
                     message="Generate financial triples"),
        PipelineStep(name="complete", display_name="Pipeline Complete",
                     message="Summarize pipeline run"),
    ]


def create_me_steps() -> list[PipelineStep]:
    return [
        PipelineStep(name="farm_financials_a",
                     display_name="DCL Ingest (Entity A)",
                     message="Generate financial triples for entity A",
                     parallel_group="farm_financials"),
        PipelineStep(name="farm_financials_b",
                     display_name="DCL Ingest (Entity B)",
                     message="Generate financial triples for entity B",
                     parallel_group="farm_financials"),
        PipelineStep(name="dcl_ingest", display_name="DCL Ingest Verify",
                     message="Verify triples landed in DCL"),
        PipelineStep(name="cofa_unification", display_name="COFA Unification",
                     message="Trigger COFA mapping via Maestra"),
        PipelineStep(name="complete", display_name="Pipeline Complete",
                     message="Summarize pipeline run"),
    ]


# ── Step Execution Dispatcher ────────────────────────────────────────

async def _execute_step(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
) -> None:
    t0 = time.time()
    _mark_step(step, StepStatus.RUNNING, f"Running {step.display_name}...")

    try:
        if step.name == "farm_snapshot":
            await _step_farm_snapshot(client, step, job, context, t0)
        elif step.name == "aod_discovery":
            await _step_aod_discovery(client, step, job, context, t0)
        elif step.name == "aod_aam_handoff":
            await _step_aod_aam_handoff(client, step, job, context, t0)
        elif step.name == "aam_inference":
            await _step_aam_inference(client, step, job, context, t0)
        elif step.name == "farm_financials":
            await _step_farm_financials(client, step, job, context, t0,
                                        config_key="farm_config")
        elif step.name == "farm_financials_a":
            await _step_farm_financials(client, step, job, context, t0,
                                        config_key="farm_config_a")
        elif step.name == "farm_financials_b":
            await _step_farm_financials(client, step, job, context, t0,
                                        config_key="farm_config_b")
        elif step.name == "dcl_ingest":
            await _step_dcl_ingest_verify(client, step, job, context, t0)
        elif step.name == "cofa_unification":
            await _step_cofa_unification(client, step, job, context, t0)
        elif step.name == "complete":
            _step_complete(step, job, t0)
        else:
            _mark_step(step, StepStatus.FAILED,
                       f"Unknown step: {step.name}", start_time=t0)

    except ValueError as e:
        logger.error(f"[PIPELINE] Step {step.name} config error: {e}")
        _mark_step(step, StepStatus.FAILED, str(e), start_time=t0)
    except Exception as e:
        logger.error(f"[PIPELINE] Step {step.name} error: {e}", exc_info=True)
        _mark_step(step, StepStatus.FAILED,
                   f"{type(e).__name__}: {e}", start_time=t0)


# ── Individual Step Implementations ──────────────────────────────────

async def _step_farm_snapshot(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """SE Step 1: Create Farm snapshot."""
    url = _require_url("FARM_BASE_URL", config.FARM_BASE_URL, "Farm Snapshot")
    cfg = job.config
    tenant_id = context.get("tenant_id") or cfg.get("tenant_id") or config.AOS_TENANT_ID
    entity_id = context.get("entity_id") or cfg.get("entity_id")
    entity_name = context.get("entity_name")

    body: dict[str, Any] = {
        "seed": cfg.get("seed", 42),
        "scale": cfg.get("scale", "medium"),
    }
    if tenant_id:
        body["tenant_id"] = tenant_id
    if entity_id:
        body["entity_id"] = entity_id
    if cfg.get("enterprise_profile"):
        body["enterprise_profile"] = cfg["enterprise_profile"]

    try:
        resp = await client.post(f"{url}/api/snapshots", json=body,
                                 headers=_json_headers())
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach Farm at {url}/api/snapshots — "
                   f"connection refused. Verify Farm is running.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm request timed out at {url}/api/snapshots — {e}",
                   start_time=t0)
        return

    if resp.status_code == 200:
        data = resp.json()
        context["snapshot_id"] = data.get("snapshot_id")
        # Provenance uses entity_name from registry (stable across runs)
        provenance = entity_name or entity_id or data.get("tenant_id")
        if provenance:
            context["provenance_tag"] = provenance
            for s in job.steps:
                s.provenance_tag = provenance
        _mark_step(step, StepStatus.SUCCESS, "Snapshot ready",
                   data=data, start_time=t0)

    elif resp.status_code == 202:
        data = resp.json()
        async_job_id = data.get("job_id")
        if not async_job_id:
            _mark_step(step, StepStatus.FAILED,
                       f"Farm returned 202 but no job_id in response: {data}",
                       start_time=t0)
            return

        step.message = f"Snapshot generating (job {async_job_id})..."
        poll_url = f"{url}/api/jobs/{async_job_id}"
        deadline = time.time() + 120

        while time.time() < deadline:
            await asyncio.sleep(2)
            try:
                poll_resp = await client.get(poll_url, headers=_json_headers())
            except (httpx.ConnectError, httpx.TimeoutException):
                continue

            if poll_resp.status_code == 200:
                poll_data = poll_resp.json()
                poll_status = poll_data.get("status", "")
                if poll_status == "completed":
                    result = poll_data.get("result", {})
                    context["snapshot_id"] = (result.get("snapshot_id")
                                              or data.get("snapshot_id"))
                    provenance = entity_name or entity_id or result.get("tenant_id")
                    if provenance:
                        context["provenance_tag"] = provenance
                        for s in job.steps:
                            s.provenance_tag = provenance
                    _mark_step(step, StepStatus.SUCCESS, "Snapshot ready",
                               data=result, start_time=t0)
                    return
                elif poll_status == "failed":
                    _mark_step(step, StepStatus.FAILED,
                               f"Farm snapshot job failed: "
                               f"{poll_data.get('error', 'unknown')}",
                               data=poll_data, start_time=t0)
                    return

        _mark_step(step, StepStatus.FAILED,
                   f"Farm snapshot job {async_job_id} timed out after 120s",
                   start_time=t0)
    else:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm snapshot failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)


async def _step_aod_discovery(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """SE Step 2: Trigger AOD discovery from Farm snapshot."""
    url = _require_url("AOD_BASE_URL", config.AOD_BASE_URL, "AOD Discovery")
    farm_url = _require_url("FARM_BASE_URL", config.FARM_BASE_URL,
                            "AOD Discovery (Farm URL)")

    snapshot_id = context.get("snapshot_id")
    tenant_id = context.get("tenant_id") or job.config.get("tenant_id")
    entity_id = context.get("entity_id") or job.config.get("entity_id")

    if not snapshot_id:
        _mark_step(step, StepStatus.FAILED,
                   "No snapshot_id available — Farm Snapshot step must "
                   "succeed first",
                   start_time=t0)
        return

    body: dict[str, Any] = {
        "snapshot_id": snapshot_id,
        "farm_base_url": farm_url,
    }
    if tenant_id:
        body["tenant_id"] = tenant_id
    if entity_id:
        body["entity_id"] = entity_id

    try:
        resp = await client.post(f"{url}/api/runs/from-farm",
                                 json=body, headers=_aod_headers())
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach AOD at {url}/api/runs/from-farm — "
                   f"connection refused. Verify AOD is running.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"AOD discovery timed out at {url}/api/runs/from-farm — {e}",
                   start_time=t0)
        return

    if resp.status_code == 200:
        data = resp.json()
        context["run_id"] = data.get("run_id")
        counts = data.get("counts") or {}
        asset_count = counts.get("assets_admitted", "?")
        _mark_step(step, StepStatus.SUCCESS,
                   f"Discovery complete: run_id={context.get('run_id')}, "
                   f"{asset_count} assets",
                   data=data, start_time=t0)
    else:
        _mark_step(step, StepStatus.FAILED,
                   f"AOD discovery failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)


async def _step_aod_aam_handoff(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """SE Step 3: Export AOD candidates to AAM."""
    url = _require_url("AOD_BASE_URL", config.AOD_BASE_URL, "AOD-AAM Handoff")

    run_id = context.get("run_id")
    if not run_id:
        _mark_step(step, StepStatus.FAILED,
                   "No run_id available — AOD Discovery step must succeed first",
                   start_time=t0)
        return

    try:
        resp = await client.post(
            f"{url}/api/handoff/aam/export",
            headers=_aod_headers(),
            params={"run_id": run_id, "status_filter": "all"},
        )
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach AOD at {url}/api/handoff/aam/export — "
                   f"connection refused.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"AOD handoff timed out at "
                   f"{url}/api/handoff/aam/export — {e}",
                   start_time=t0)
        return

    if resp.status_code == 200:
        data = resp.json()
        candidates = data.get("candidates_sent", data.get("count", "?"))
        _mark_step(step, StepStatus.SUCCESS,
                   f"Exported {candidates} candidates to AAM",
                   data=data, start_time=t0)
    else:
        _mark_step(step, StepStatus.FAILED,
                   f"AOD-AAM handoff failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)


async def _step_aam_inference(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """SE Step 4: Trigger AAM pipe inference."""
    url = _require_url("AAM_BASE_URL", config.AAM_BASE_URL, "AAM Inference")

    try:
        resp = await client.post(f"{url}/api/aam/infer",
                                 headers=_json_headers())
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach AAM at {url}/api/aam/infer — "
                   f"connection refused. Verify AAM is running.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"AAM inference timed out at {url}/api/aam/infer — {e}",
                   start_time=t0)
        return

    if resp.status_code == 200:
        data = resp.json()
        pipes = data.get("pipes_created", data.get("pipe_count", "?"))
        _mark_step(step, StepStatus.SUCCESS,
                   f"Inference complete: {pipes} pipes",
                   data=data, start_time=t0)
    else:
        _mark_step(step, StepStatus.FAILED,
                   f"AAM inference failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)


async def _step_farm_financials(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
    config_key: str = "farm_config",
) -> None:
    """Farm manifest intake for financial triple generation.

    Used by SE step 5 (config_key="farm_config"),
    ME step 1 (config_key="farm_config_a"),
    ME step 2 (config_key="farm_config_b").
    """
    url = _require_url("FARM_BASE_URL", config.FARM_BASE_URL,
                       step.display_name)
    dcl_url = _require_url("DCL_BASE_URL", config.DCL_BASE_URL,
                           step.display_name)

    cfg = job.config
    farm_cfg = cfg.get(config_key, {})

    run_id = context.get("run_id") or str(uuid.uuid4())
    tenant_id = (context.get("tenant_id")
                 or farm_cfg.get("tenant_id")
                 or cfg.get("tenant_id")
                 or config.AOS_TENANT_ID)
    entity_id = (farm_cfg.get("entity_id")
                 or context.get("entity_id")
                 or cfg.get("entity_id"))
    snapshot_name = (farm_cfg.get("snapshot_name")
                     or context.get("snapshot_id")
                     or "latest")
    pipe_id = farm_cfg.get("pipe_id", f"{step.name}-financials")
    system = farm_cfg.get("system", "netsuite")
    category = farm_cfg.get("category", "erp")

    if not entity_id:
        _mark_step(step, StepStatus.FAILED,
                   f"No entity_id available for {step.display_name} — "
                   f"cannot look up Farm config. Ensure engagement has entity_id set.",
                   start_time=t0)
        return

    body: dict[str, Any] = {
        "run_id": run_id,
        "source": {
            "pipe_id": pipe_id,
            "system": system,
            "category": category,
        },
        "target": {
            "dcl_url": f"{dcl_url}/api/dcl/ingest",
            "tenant_id": tenant_id or "",
            "snapshot_name": snapshot_name,
            "entity_id": entity_id,
        },
    }

    triples_id = cfg.get("_triples_id")
    if triples_id:
        body["target"]["triples_id"] = triples_id

    try:
        resp = await client.post(f"{url}/api/farm/manifest-intake",
                                 json=body, headers=_json_headers())
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach Farm at {url}/api/farm/manifest-intake — "
                   f"connection refused.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm financial generation timed out at "
                   f"{url}/api/farm/manifest-intake — {e}",
                   start_time=t0)
        return

    if resp.status_code == 200:
        data = resp.json()
        farm_status = data.get("status", "completed")
        if farm_status not in ("completed", "skipped"):
            push = data.get("push_result") or {}
            error_detail = push.get("error") or farm_status
            _mark_step(step, StepStatus.FAILED,
                       f"DCL ingest failed (Farm status={farm_status}): {error_detail}",
                       data=data, start_time=t0)
            return
        rows = data.get("rows_generated", 0)
        push = data.get("push_result") or {}
        accepted = push.get("rows_accepted")
        if accepted is not None and accepted != rows:
            triples = f"{accepted} accepted"
        else:
            triples = str(rows)
        echoed_triples_id = data.get("triples_id")
        if echoed_triples_id and not any(s.provenance_tag for s in job.steps):
            context["provenance_tag"] = echoed_triples_id
            for s in job.steps:
                s.provenance_tag = echoed_triples_id
        _mark_step(step, StepStatus.SUCCESS,
                   f"Financial triples generated: {triples}",
                   data=data, start_time=t0)
    else:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm financials failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)


async def _step_dcl_ingest_verify(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """Verify triples landed in DCL."""
    url = _require_url("DCL_BASE_URL", config.DCL_BASE_URL, "DCL Ingest Verify")

    try:
        resp = await client.get(f"{url}/api/dcl/triples/overview",
                                headers=_json_headers())
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach DCL at {url}/api/dcl/triples/overview — "
                   f"connection refused. Verify DCL is running.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"DCL request timed out at "
                   f"{url}/api/dcl/triples/overview — {e}",
                   start_time=t0)
        return

    if resp.status_code == 200:
        data = resp.json()
        total = data.get("total_triples", data.get("count", 0))
        _mark_step(step, StepStatus.SUCCESS,
                   f"DCL has {total:,} triples",
                   data=data, start_time=t0)
    else:
        _mark_step(step, StepStatus.FAILED,
                   f"DCL triple check failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)


async def _step_cofa_unification(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """COFA unification via Platform's Maestra HTTP endpoint.

    Console doesn't host Maestra in-process — calls Platform's API.
    """
    platform_url = _require_url("PLATFORM_BASE_URL", config.PLATFORM_BASE_URL,
                                "COFA Unification")

    cfg = job.config
    engagement_id = cfg.get("engagement_id")

    # Auto-fetch active engagement if not provided
    if not engagement_id:
        engagements_url = f"{platform_url}/api/maestra/engagements"
        try:
            eng_resp = await client.get(engagements_url)
        except httpx.ConnectError:
            _mark_step(step, StepStatus.FAILED,
                       f"Could not reach Platform at {engagements_url} — "
                       f"connection refused. Verify Platform is running.",
                       start_time=t0)
            return
        except httpx.TimeoutException as e:
            _mark_step(step, StepStatus.FAILED,
                       f"Platform request timed out at "
                       f"{engagements_url} — {e}",
                       start_time=t0)
            return

        if eng_resp.status_code != 200:
            _mark_step(step, StepStatus.FAILED,
                       f"Could not fetch engagements ({eng_resp.status_code}): "
                       f"{_extract_error(eng_resp)}",
                       start_time=t0)
            return

        engagements = eng_resp.json()
        if isinstance(engagements, dict):
            engagements = engagements.get("engagements", [])

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
            hint = ""
            drafts = by_state.get("draft", [])
            if drafts:
                hint = (
                    f" To activate, PATCH /api/maestra/engagements/"
                    f"{drafts[0]}/state with {{\"new_state\": \"active\"}}."
                )
            _mark_step(step, StepStatus.FAILED,
                       f"No active engagement found. "
                       f"{len(engagements)} engagement(s) exist — "
                       f"{state_summary or 'none'}.{hint}",
                       start_time=t0)
            return

        engagement_id = active["engagement_id"]

    # Send COFA initiation message
    cofa_url = f"{platform_url}/api/maestra/cofa-chat"
    body = {
        "engagement_id": engagement_id,
        "message": "Begin COFA unification — map both entity charts of accounts",
        "session_id": f"operator-cofa-{job.job_id}",
    }

    try:
        resp = await client.post(cofa_url, json=body)
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach Platform COFA at {cofa_url} — "
                   f"connection refused.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"COFA request timed out at {cofa_url} — {e}",
                   start_time=t0)
        return

    if resp.status_code != 200:
        _mark_step(step, StepStatus.FAILED,
                   f"COFA unification failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)
        return

    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    _mark_step(step, StepStatus.SUCCESS,
               f"COFA complete (engagement={engagement_id})",
               data=data, start_time=t0)


def _step_complete(
    step: PipelineStep,
    job: PipelineJob,
    t0: float,
) -> None:
    """Final summary step."""
    succeeded = sum(1 for s in job.steps if s.status == StepStatus.SUCCESS)
    failed = sum(1 for s in job.steps if s.status == StepStatus.FAILED)
    skipped = sum(1 for s in job.steps if s.status == StepStatus.SKIPPED)
    total = len(job.steps) - 1  # exclude the complete step itself

    elapsed_ms = 0
    for s in job.steps:
        if s.duration_ms:
            elapsed_ms += s.duration_ms

    summary = {
        "steps_succeeded": succeeded,
        "steps_failed": failed,
        "steps_skipped": skipped,
        "steps_total": total,
        "total_elapsed_ms": elapsed_ms,
        "pipeline_mode": job.pipeline_mode.value,
    }

    if failed > 0:
        _mark_step(step, StepStatus.SUCCESS,
                   f"Pipeline finished with {failed} error(s): "
                   f"{succeeded}/{total} succeeded",
                   data=summary, start_time=t0)
    else:
        _mark_step(step, StepStatus.SUCCESS,
                   f"Pipeline completed: {succeeded}/{total} steps succeeded "
                   f"in {elapsed_ms}ms",
                   data=summary, start_time=t0)


# ── Pipeline Execution Engine ────────────────────────────────────────

async def run_pipeline_batch(job_id: str) -> None:
    """Run all pipeline steps in sequence (batch mode).

    Parallel groups are executed concurrently via asyncio.gather.
    Stops on first failure (subsequent steps stay PENDING).
    Persists to Postgres on each step completion.
    """
    job = PIPELINE_JOBS.get(job_id)
    if not job:
        return

    job.status = "running"

    async with httpx.AsyncClient(timeout=240.0) as client:
        context: dict[str, Any] = {}

        # Resolve tenant identity from registry at pipeline start.
        # The engagement's entity_ids are the business keys; tenant_id
        # is the shared isolation UUID looked up from the registry.
        cfg = job.config
        _entity_id = cfg.get("entity_id")
        if not _entity_id and cfg.get("entities"):
            _entity_id = cfg["entities"][0]
        if _entity_id:
            _reg = await db.get_entity(_entity_id)
            if _reg:
                context["tenant_id"] = _reg["tenant_id"]
                context["entity_id"] = _reg["entity_id"]
                context["entity_name"] = _reg["entity_name"]
        if "tenant_id" not in context:
            # Fallback: use explicit tenant_id from config and look up entities
            _tid = cfg.get("tenant_id") or config.AOS_TENANT_ID
            if _tid:
                context["tenant_id"] = _tid
                _entities = await db.list_entities_for_tenant(_tid)
                if _entities:
                    context["entity_id"] = _entities[0]["entity_id"]
                    context["entity_name"] = _entities[0]["entity_name"]

        i = 0
        while i < len(job.steps):
            step = job.steps[i]

            if step.parallel_group and step.status == StepStatus.PENDING:
                group_indices = [
                    j for j in range(i, len(job.steps))
                    if job.steps[j].parallel_group == step.parallel_group
                    and job.steps[j].status == StepStatus.PENDING
                ]
                job.current_step = i + 1
                job.message = (f"Running parallel group: "
                               f"{step.parallel_group} "
                               f"({len(group_indices)} steps)")

                tasks = [
                    _execute_step(client, job.steps[j], job, context)
                    for j in group_indices
                ]
                await asyncio.gather(*tasks)

                # Persist after parallel group completes
                await _persist_job(job)

                group_failed = any(
                    job.steps[j].status == StepStatus.FAILED
                    for j in group_indices
                )
                if group_failed:
                    job.status = "completed_with_errors"
                    job.message = (f"Pipeline stopped: parallel group "
                                   f"'{step.parallel_group}' had failures")
                    job.completed_at = _now()
                    await _persist_job(job)
                    return

                i = max(group_indices) + 1
            else:
                job.current_step = i + 1
                job.message = (f"Step {i + 1}/{job.total_steps}: "
                               f"{step.display_name}")

                await _execute_step(client, step, job, context)

                # Persist after each step
                await _persist_job(job)

                if step.status == StepStatus.FAILED:
                    job.status = "completed_with_errors"
                    job.message = (f"Pipeline stopped at step "
                                   f"'{step.display_name}': {step.message}")
                    job.completed_at = _now()
                    await _persist_job(job)
                    return

                i += 1

    failed_count = sum(1 for s in job.steps if s.status == StepStatus.FAILED)
    if failed_count > 0:
        job.status = "completed_with_errors"
        job.message = f"Pipeline finished with {failed_count} error(s)"
    else:
        job.status = "completed"
        job.message = "Pipeline completed successfully"
    job.completed_at = _now()
    await _persist_job(job)


def _extract_job_context(job: PipelineJob) -> dict[str, Any]:
    """Rebuild pipeline context from completed step data."""
    context: dict[str, Any] = {}
    # Carry identity from job config first (set at pipeline start from registry)
    cfg = job.config
    for key in ("tenant_id", "entity_id", "entity_name"):
        if cfg.get(key):
            context[key] = cfg[key]
    for s in job.steps:
        if s.data and s.status == StepStatus.SUCCESS:
            if "snapshot_id" in s.data:
                context["snapshot_id"] = s.data["snapshot_id"]
            if "tenant_id" in s.data:
                context["tenant_id"] = s.data["tenant_id"]
            if "run_id" in s.data:
                context["run_id"] = s.data["run_id"]
        if s.provenance_tag:
            context["provenance_tag"] = s.provenance_tag
    return context


async def run_single_step(job_id: str, step_indices: list[int]) -> None:
    """Run specific step(s) for step-by-step mode."""
    job = PIPELINE_JOBS.get(job_id)
    if not job:
        return

    job.status = "running"

    async with httpx.AsyncClient(timeout=240.0) as client:
        context = _extract_job_context(job)

        if len(step_indices) > 1:
            tasks = [
                _execute_step(client, job.steps[j], job, context)
                for j in step_indices
            ]
            await asyncio.gather(*tasks)
        else:
            idx = step_indices[0]
            job.current_step = idx + 1
            job.message = f"Running step: {job.steps[idx].display_name}"
            await _execute_step(client, job.steps[idx], job, context)

    # Persist after step execution
    await _persist_job(job)

    all_done = all(
        s.status in (StepStatus.SUCCESS, StepStatus.FAILED, StepStatus.SKIPPED)
        for s in job.steps
    )
    has_failures = any(s.status == StepStatus.FAILED for s in job.steps)

    if all_done:
        job.status = "completed_with_errors" if has_failures else "completed"
        job.completed_at = _now()
        job.message = "Pipeline completed"
    elif has_failures:
        job.status = "paused_with_errors"
        job.message = "Step failed — review error and retry or reset"
    else:
        job.status = "paused"
        job.message = "Step completed — click Next Step to continue"

    await _persist_job(job)


def get_next_step_indices(job: PipelineJob) -> list[int]:
    """Find the next pending step(s) to execute."""
    for i, step in enumerate(job.steps):
        if step.status == StepStatus.PENDING:
            if step.parallel_group:
                return [
                    j for j, s in enumerate(job.steps)
                    if s.parallel_group == step.parallel_group
                    and s.status == StepStatus.PENDING
                ]
            return [i]
    return []


# ── DB Persistence ───────────────────────────────────────────────────

async def _persist_job(job: PipelineJob) -> None:
    """Write current job state to Postgres for run history persistence."""
    try:
        await db.save_pipeline_job(job)
    except Exception as exc:
        logger.error(f"[PIPELINE] Failed to persist job {job.job_id}: {exc}")
