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
from backend.app.services import convergence_client, nlq_client

logger = logging.getLogger("console.pipeline")

# ── In-memory job store (fast polling path) ──────────────────────────
PIPELINE_JOBS: dict[str, PipelineJob] = {}


# ── Helpers ──────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _json_headers() -> dict[str, str]:
    return {"Content-Type": "application/json"}


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


def make_run_name(
    entity_id: str | None,
    pipeline_run_id: str,
    engagement_short_name: str | None = None,
) -> str:
    """Build human-readable run label.

    SE:  {entity_id}-{short_hash}  (e.g., BlueLogic-NEQ8-a9ed)
    ME:  {engagement_short_name}-{short_hash}  (e.g., MerCas-2571)
    short_hash = first 4 hex chars of pipeline_run_id (no hyphens).
    """
    short_hash = pipeline_run_id.replace("-", "")[:4]
    if engagement_short_name:
        return f"{engagement_short_name}-{short_hash}"
    if entity_id:
        return f"{entity_id}-{short_hash}"
    return short_hash


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
        PipelineStep(name="nlq_data_visible",
                     display_name="Verify Data in Ask & Dashboards",
                     message="Confirm NLQ can query and render the new data"),
        PipelineStep(name="complete", display_name="Pipeline Complete",
                     message="Summarize pipeline run"),
    ]


def create_me_steps() -> list[PipelineStep]:
    return [
        PipelineStep(name="farm_financials_a",
                     display_name="Farm + Convergence (Acquirer)",
                     message="Generate & ingest financial triples for acquirer",
                     parallel_group="entity_ingest"),
        PipelineStep(name="farm_financials_b",
                     display_name="Farm + Convergence (Target)",
                     message="Generate & ingest financial triples for target",
                     parallel_group="entity_ingest"),
        PipelineStep(name="convergence_overlay",
                     display_name="Convergence Multi-Entity Overlay",
                     message="Generate & ingest customer profile + overlap triples"),
        PipelineStep(name="cofa_unification", display_name="COFA Unification",
                     message="Unify charts of accounts via Convergence"),
        PipelineStep(name="verify", display_name="Verify",
                     message="Verify COFA output"),
        PipelineStep(name="convergence_surfaces_visible",
                     display_name="Verify Merge, Engagements, Reports",
                     message="Confirm Convergence surfaces can render the new data"),
        PipelineStep(name="complete", display_name="Pipeline Complete",
                     message="Summarize pipeline run"),
    ]


def logical_step_count(steps: list[PipelineStep]) -> int:
    """Count steps where parallel groups count as 1 logical step."""
    seen_groups: set[str] = set()
    count = 0
    for s in steps:
        if s.parallel_group:
            if s.parallel_group not in seen_groups:
                seen_groups.add(s.parallel_group)
                count += 1
        else:
            count += 1
    return count


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
        elif step.name == "convergence_overlay":
            await _step_convergence_overlay(client, step, job, context, t0)
        elif step.name == "cofa_unification":
            await _step_cofa_unification(client, step, job, context, t0)
        elif step.name == "verify":
            await _step_verify(client, step, job, context, t0)
        elif step.name == "nlq_data_visible":
            await _step_nlq_data_visible(client, step, job, context, t0)
        elif step.name == "convergence_surfaces_visible":
            await _step_convergence_surfaces_visible(client, step, job, context, t0)
        elif step.name == "complete":
            _step_complete(step, job, context, t0)
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
    """SE Step 1: Create Farm snapshot. Farm owns snapshot identity generation
    (fresh tenant_id + entity_id per snapshot). In SE mode Farm's entity_id IS
    the canonical pipeline identity. In ME mode entity_id is set by engagement
    pre-flight and Farm's value is ignored (only farm_manifest_id is captured)."""
    url = _require_url("FARM_BASE_URL", config.FARM_BASE_URL, "Farm Snapshot")
    cfg = job.config

    body: dict[str, Any] = {
        "scale": cfg.get("scale", "medium"),
    }
    if cfg.get("seed") is not None:
        body["seed"] = cfg["seed"]
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
        farm_manifest_id = data.get("farm_manifest_id") or data.get("snapshot_id")
        if farm_manifest_id:
            context["farm_manifest_id"] = farm_manifest_id
        if job.pipeline_mode == PipelineMode.SE and data.get("entity_id"):
            context["entity_id"] = data["entity_id"]
        if data.get("tenant_name"):
            context.setdefault("entity_name", data["tenant_name"])
        _update_run_name(job, context)
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
                    farm_manifest_id = (result.get("farm_manifest_id")
                                        or result.get("snapshot_id")
                                        or data.get("snapshot_id"))
                    if farm_manifest_id:
                        context["farm_manifest_id"] = farm_manifest_id
                    if job.pipeline_mode == PipelineMode.SE and result.get("entity_id"):
                        context["entity_id"] = result["entity_id"]
                    if result.get("tenant_name"):
                        context.setdefault("entity_name", result["tenant_name"])
                    _update_run_name(job, context)
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

    farm_manifest_id = context.get("farm_manifest_id")
    tenant_id = context.get("tenant_id")
    entity_id = context.get("entity_id")

    if not farm_manifest_id:
        _mark_step(step, StepStatus.FAILED,
                   "No farm_manifest_id available — Farm Snapshot step must "
                   "succeed first",
                   start_time=t0)
        return

    body: dict[str, Any] = {
        "snapshot_id": farm_manifest_id,
        "farm_base_url": farm_url,
    }
    if tenant_id:
        body["tenant_id"] = tenant_id
    if entity_id:
        body["entity_id"] = entity_id

    try:
        resp = await client.post(f"{url}/api/runs/from-farm",
                                 json=body, headers=_json_headers())
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
        aod_discovery_id = data.get("aod_discovery_id")
        if aod_discovery_id:
            context["aod_discovery_id"] = aod_discovery_id
        counts = data.get("counts") or {}
        asset_count = counts.get("assets_admitted", "?")
        _mark_step(step, StepStatus.SUCCESS,
                   f"Discovery complete: aod_discovery_id={aod_discovery_id}, "
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

    aod_discovery_id = context.get("aod_discovery_id")
    tenant_id = context.get("tenant_id")
    entity_id = context.get("entity_id")

    if not aod_discovery_id:
        _mark_step(step, StepStatus.FAILED,
                   "No aod_discovery_id available — AOD Discovery step must "
                   "succeed first",
                   start_time=t0)
        return

    try:
        resp = await client.post(
            f"{url}/api/handoff/aam/export",
            headers=_json_headers(),
            params={
                "aod_discovery_id": aod_discovery_id,
                "status_filter": "all",
                **({"tenant_id": tenant_id} if tenant_id else {}),
                **({"entity_id": entity_id} if entity_id else {}),
            },
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
        handoff_id = data.get("handoff_id")
        if handoff_id:
            context["handoff_id"] = handoff_id
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

    body: dict[str, Any] = {}
    handoff_id = context.get("handoff_id")
    tenant_id = context.get("tenant_id")
    entity_id = context.get("entity_id")
    if handoff_id:
        body["handoff_id"] = handoff_id
    if tenant_id:
        body["tenant_id"] = tenant_id
    if entity_id:
        body["entity_id"] = entity_id

    try:
        resp = await client.post(f"{url}/api/aam/infer",
                                 json=body, headers=_json_headers())
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
        # Capture namespaced ID from AAM
        aam_inference_id = data.get("aam_inference_id")
        if aam_inference_id:
            context["aam_inference_id"] = aam_inference_id
        source_handoff = data.get("source_handoff_id")
        if source_handoff:
            context["source_handoff_id"] = source_handoff
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

    pipeline_run_id = context.get("pipeline_run_id", job.pipeline_run_id)
    farm_manifest_id = (context.get("farm_manifest_id")
                        or farm_cfg.get("farm_manifest_id"))
    tenant_id = (context.get("tenant_id")
                 or farm_cfg.get("tenant_id")
                 or cfg.get("tenant_id")
                 or config.AOS_TENANT_ID)
    entity_id = (farm_cfg.get("entity_id")
                 or context.get("entity_id")
                 or cfg.get("entity_id"))
    snapshot_name = (farm_cfg.get("snapshot_name")
                     or job.run_name
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

    # ME mode pushes to Convergence; SE mode pushes to DCL.
    # Both dcl_url and ingest_url must point to the correct target so
    # Farm has no fallback path that silently routes ME data to DCL.
    is_me = config_key in ("farm_config_a", "farm_config_b")

    if is_me:
        convergence_url = _require_url(
            "CONVERGENCE_BASE_URL", config.CONVERGENCE_BASE_URL,
            step.display_name)
        target_dcl_url = f"{convergence_url}/api/convergence/ingest-triples"
        target_ingest_url = f"{convergence_url}/api/convergence/ingest-triples"
    else:
        target_dcl_url = f"{dcl_url}/api/dcl/ingest"
        target_ingest_url = None

    body: dict[str, Any] = {
        "source": {
            "pipe_id": pipe_id,
            "system": system,
            "category": category,
        },
        "target": {
            "dcl_url": target_dcl_url,
            "tenant_id": tenant_id or "",
            "snapshot_name": snapshot_name,
            "entity_id": entity_id,
        },
    }

    if target_ingest_url:
        body["target"]["ingest_url"] = target_ingest_url

    if is_me:
        # Per-entity farm_manifest_id for Farm provenance + ground truth.
        # Farm uses triples_id (= pipeline_run_id) as the run_id written
        # to convergence_triples, so both entity batches share one run_id.
        body["farm_manifest_id"] = str(uuid.uuid4())
    else:
        body["farm_manifest_id"] = pipeline_run_id

    # Pass farm_manifest_id if available (provenance link)
    if farm_manifest_id:
        body["farm_manifest_id"] = farm_manifest_id

    # Pipeline-level correlation ID for triple provenance tracking
    body["target"]["triples_id"] = pipeline_run_id

    _started = job.started_at
    body["provenance"] = {
        "triggered_by": "console",
        "pipeline_run_id": pipeline_run_id,
        "run_timestamp": _started.isoformat() if hasattr(_started, "isoformat") else str(_started or _now()),
    }

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
            _target_label = "Convergence" if is_me else "DCL"
            _mark_step(step, StepStatus.FAILED,
                       f"{_target_label} ingest failed (Farm status={farm_status}): {error_detail}",
                       data=data, start_time=t0)
            return

        # Capture expansion metrics from ingest
        rows = data.get("rows_generated", 0)
        push = data.get("push_result") or {}
        accepted = push.get("rows_accepted")
        triples_written = push.get("triples_written") or accepted or rows
        source_rows = data.get("source_rows") or rows

        # Capture ingest ID from response — per-entity tracking for ME.
        # ME uses convergence_ingest_id (per v7.4.1 identifier registry);
        # SE uses dcl_ingest_id. Farm returns dcl_run_id in push_result.
        if is_me:
            _cid = (data.get("convergence_ingest_id")
                    or push.get("convergence_ingest_id")
                    or push.get("dcl_run_id")
                    or data.get("dcl_ingest_id"))
            if _cid:
                if config_key == "farm_config_a":
                    context["convergence_ingest_id_a"] = _cid
                elif config_key == "farm_config_b":
                    context["convergence_ingest_id_b"] = _cid
                context.setdefault("convergence_ingest_ids", []).append(_cid)
        else:
            dcl_ingest_id = (data.get("dcl_ingest_id")
                             or push.get("dcl_ingest_id")
                             or push.get("dcl_run_id"))
            if dcl_ingest_id:
                context["dcl_ingest_id"] = dcl_ingest_id
                context.setdefault("dcl_ingest_ids", []).append(dcl_ingest_id)
        source_farm = (data.get("source_farm_manifest_id")
                       or push.get("source_farm_manifest_id"))
        if source_farm:
            context["source_farm_manifest_id"] = source_farm

        # Store expansion metrics in context — per-entity suffix for ME
        suffix = "_a" if config_key == "farm_config_a" else (
            "_b" if config_key == "farm_config_b" else "")
        context[f"source_rows{suffix}"] = source_rows
        context[f"triples_written{suffix}"] = triples_written
        if source_rows and source_rows > 0:
            context[f"expansion_factor{suffix}"] = round(
                triples_written / source_rows, 1)

        if accepted is not None and accepted != rows:
            triples_label = f"{accepted} accepted"
        else:
            triples_label = str(rows)
        _mark_step(step, StepStatus.SUCCESS,
                   f"Financial triples generated: {triples_label}",
                   data=data, start_time=t0)
    else:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm financials failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)


async def _step_convergence_overlay(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """ME Step 3: Generate multi-entity overlay triples (customer profiles,
    entity overlaps) via Farm and push to Convergence.

    Runs after the per-entity farm_financials_a/b ingest group completes.
    Farm's manifest-intake path does not invoke CustomerProfileTripleGenerator
    or OverlapTripleGenerator — only generate-multi-entity-triples does.
    Without this stage, cross_sell/qoe/entity_resolution engines see empty
    customer.* props and produce degenerate scores.

    Fail-loud gates (no silent skip):
      1. Farm generate non-200 or missing farm_manifest_id
      2. Farm per-entity domain summary shows zero customer triples
      3. Farm push-to-dcl non-200, success=false, or missing convergence_ingest_id
      4. Zero triples pushed
    """
    farm_url = _require_url("FARM_BASE_URL", config.FARM_BASE_URL,
                            "Convergence Overlay")

    tenant_id = context.get("tenant_id")
    if not tenant_id:
        _mark_step(step, StepStatus.FAILED,
                   "No tenant_id in pipeline context — ME pre-flight must "
                   "resolve tenant_id from Convergence before overlay can run.",
                   start_time=t0)
        return

    cfg = job.config
    acq_entity = (cfg.get("farm_config_a") or {}).get("entity_id")
    tgt_entity = (cfg.get("farm_config_b") or {}).get("entity_id")
    if not acq_entity or not tgt_entity:
        _mark_step(step, StepStatus.FAILED,
                   f"Missing entity_id on farm_config_a/b — "
                   f"acquirer={acq_entity!r}, target={tgt_entity!r}. "
                   f"ME pre-flight must populate both per-entity configs.",
                   start_time=t0)
        return

    seed = cfg.get("seed", 42)
    entities_csv = f"{acq_entity},{tgt_entity}"

    # Step 1: generate overlay triples (skip_push=true — we push explicitly
    # so this stage owns routing + response capture).
    try:
        gen_resp = await client.post(
            f"{farm_url}/api/business-data/generate-multi-entity-triples",
            headers=_json_headers(),
            params={
                "entities": entities_csv,
                "seed": str(seed),
                "tenant_id": tenant_id,
                "skip_push": "true",
            },
        )
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach Farm at "
                   f"{farm_url}/api/business-data/generate-multi-entity-triples "
                   f"— connection refused.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm overlay generation timed out at "
                   f"{farm_url}/api/business-data/generate-multi-entity-triples "
                   f"— {e}",
                   start_time=t0)
        return

    if gen_resp.status_code != 200:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm overlay generate failed ({gen_resp.status_code}): "
                   f"{_extract_error(gen_resp)}",
                   start_time=t0)
        return

    gen_data = gen_resp.json()
    farm_manifest_id = gen_data.get("farm_manifest_id")
    if not farm_manifest_id:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm overlay generate returned no farm_manifest_id: "
                   f"{gen_data}",
                   start_time=t0)
        return

    # Verify Farm generated customer profile triples for BOTH entities.
    # Farm's CustomerProfileGenerator silently skips unknown entity_ids
    # (logs a warning + continues) — we catch that here by requiring
    # customer domain > 0 in per-entity summary.
    domain_by_entity = gen_data.get("domain_summary_by_entity") or {}
    missing_customers: list[str] = []
    for _eid in (acq_entity, tgt_entity):
        _counts = domain_by_entity.get(_eid) or {}
        if _counts.get("customer", 0) == 0:
            missing_customers.append(_eid)
    if missing_customers:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm generated zero customer.* triples for "
                   f"entity_id={missing_customers!r}. "
                   f"CustomerProfileGenerator has no profile data for this "
                   f"entity — upstream Farm regression. "
                   f"domain_summary_by_entity={domain_by_entity}",
                   start_time=t0)
        return

    # Step 2: push to Convergence (Farm routes by manifest.mode=multi_entity
    # to CONVERGENCE_INGEST_URL). Blocks until push completes.
    push_url = (f"{farm_url}/api/business-data/triple-runs/"
                f"{farm_manifest_id}/push-to-dcl")
    try:
        push_resp = await client.post(push_url, headers=_json_headers())
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach Farm push-to-dcl at {push_url} — "
                   f"connection refused.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm overlay push timed out at {push_url} — {e}",
                   start_time=t0)
        return

    if push_resp.status_code != 200:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm overlay push failed ({push_resp.status_code}): "
                   f"{_extract_error(push_resp)}",
                   start_time=t0)
        return

    push_data = push_resp.json()
    if not push_data.get("success"):
        _mark_step(step, StepStatus.FAILED,
                   f"Farm overlay push returned success=false: {push_data}",
                   start_time=t0)
        return

    convergence_overlay_id = push_data.get("convergence_ingest_id")
    if not convergence_overlay_id:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm push-to-dcl did not return convergence_ingest_id — "
                   f"cannot track overlay identity. Response: {push_data}",
                   start_time=t0)
        return

    pushed = push_data.get("pushed", 0)
    if pushed == 0:
        _mark_step(step, StepStatus.FAILED,
                   f"Farm overlay push reported zero triples pushed. "
                   f"Response: {push_data}",
                   start_time=t0)
        return

    context["convergence_overlay_id"] = convergence_overlay_id
    context["overlay_farm_manifest_id"] = farm_manifest_id
    context.setdefault("convergence_ingest_ids", []).append(
        convergence_overlay_id)

    customer_total = sum(
        (domain_by_entity.get(_eid) or {}).get("customer", 0)
        for _eid in (acq_entity, tgt_entity)
    )
    _mark_step(step, StepStatus.SUCCESS,
               f"Overlay pushed: {pushed} triples "
               f"({customer_total} customer profiles) — "
               f"convergence_overlay_id={convergence_overlay_id}",
               data={
                   "convergence_overlay_id": convergence_overlay_id,
                   "overlay_farm_manifest_id": farm_manifest_id,
                   "triples_pushed": pushed,
                   "customer_triples": customer_total,
                   "tenant_id": tenant_id,
                   "entity_ids": [acq_entity, tgt_entity],
               },
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

    params: dict[str, str] = {}
    dcl_ingest_id = context.get("dcl_ingest_id")
    if dcl_ingest_id:
        params["dcl_ingest_id"] = dcl_ingest_id

    try:
        resp = await client.get(f"{url}/api/dcl/triples/overview",
                                headers=_json_headers(), params=params)
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
        verify_id = data.get("verify_id")
        if verify_id:
            context["verify_id"] = verify_id
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
    """COFA unification via Convergence HTTP endpoint.

    Convergence owns all ME engines including COFA.
    Sends convergence_ingest_ids array + engagement identity.
    """
    convergence_url = _require_url(
        "CONVERGENCE_BASE_URL", config.CONVERGENCE_BASE_URL,
        "COFA Unification")

    # Engagement identity from ME pre-flight (set in run_pipeline_batch)
    engagement_id = context.get("convergence_engagement_id")
    if not engagement_id:
        _mark_step(step, StepStatus.FAILED,
                   "No convergence_engagement_id in pipeline context — "
                   "ME pre-flight must resolve engagement from Convergence "
                   "before COFA can run.",
                   start_time=t0)
        return

    # Collect convergence_ingest_ids from completed Farm steps
    convergence_ingest_ids = context.get("convergence_ingest_ids", [])
    if not convergence_ingest_ids:
        _mark_step(step, StepStatus.FAILED,
                   "No convergence_ingest_ids in pipeline context — "
                   "Farm + Convergence ingest steps must succeed before COFA.",
                   start_time=t0)
        return

    pipeline_run_id = context.get("pipeline_run_id", job.pipeline_run_id)
    tenant_id = context.get("tenant_id")

    cofa_url = f"{convergence_url}/api/convergence/cofa/unify"
    body: dict[str, Any] = {
        "engagement_id": engagement_id,
        "dcl_ingest_ids": convergence_ingest_ids,
        "pipeline_run_id": pipeline_run_id,
    }
    if tenant_id:
        body["tenant_id"] = tenant_id

    try:
        resp = await client.post(cofa_url, json=body, headers=_json_headers())
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach Convergence COFA at {cofa_url} — "
                   f"connection refused. Verify Convergence is running on "
                   f"port 8010.",
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

    data = resp.json() if resp.headers.get(
        "content-type", "").startswith("application/json") else {}

    cofa_run_id = data.get("cofa_run_id")
    if cofa_run_id:
        context["cofa_run_id"] = cofa_run_id
    consumed = data.get("consumed_dcl_ingest_ids")
    if consumed:
        context["consumed_dcl_ingest_ids"] = consumed

    _mark_step(step, StepStatus.SUCCESS,
               f"COFA complete — cofa_run_id={cofa_run_id}, "
               f"consumed {len(convergence_ingest_ids)} ingest(s)",
               data=data, start_time=t0)


async def _step_verify(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """Verify COFA output via Convergence.

    Runs AFTER COFA completes — explicit DAG dependency.
    Sends cofa_run_id, captures verify_id.
    """
    convergence_url = _require_url(
        "CONVERGENCE_BASE_URL", config.CONVERGENCE_BASE_URL, "Verify")

    cofa_run_id = context.get("cofa_run_id")
    if not cofa_run_id:
        _mark_step(step, StepStatus.FAILED,
                   "No cofa_run_id in pipeline context — "
                   "COFA Unification must succeed before Verify.",
                   start_time=t0)
        return

    verify_url = f"{convergence_url}/api/convergence/verify"
    body: dict[str, Any] = {"cofa_run_id": cofa_run_id}
    tenant_id = context.get("tenant_id")
    if tenant_id:
        body["tenant_id"] = tenant_id
    pipeline_run_id = context.get("pipeline_run_id", job.pipeline_run_id)
    body["pipeline_run_id"] = pipeline_run_id

    try:
        resp = await client.post(verify_url, json=body,
                                 headers=_json_headers())
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach Convergence Verify at {verify_url} — "
                   f"connection refused. Verify Convergence is running on "
                   f"port 8010.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"Verify request timed out at {verify_url} — {e}",
                   start_time=t0)
        return

    if resp.status_code != 200:
        _mark_step(step, StepStatus.FAILED,
                   f"Verify failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)
        return

    data = resp.json() if resp.headers.get(
        "content-type", "").startswith("application/json") else {}

    verify_id = data.get("verify_id")
    if verify_id:
        context["verify_id"] = verify_id

    _mark_step(step, StepStatus.SUCCESS,
               f"Verify complete — verify_id={verify_id}",
               data=data, start_time=t0)


async def _step_nlq_data_visible(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """Post-SE check: confirm NLQ can see and query the freshly ingested data.

    Hits three NLQ endpoints in sequence. Fails loud with a plain-English
    message naming the surface that broke. Provenance (tenant_id, entity_id,
    run_name, dcl_ingest_id) is embedded in step.data for the Pipeline UI's
    StepDetail renderer.
    """
    url = _require_url("NLQ_BASE_URL", config.NLQ_BASE_URL,
                       "Verify Data in Ask & Dashboards")

    tenant_id = context.get("tenant_id")
    entity_id = context.get("entity_id")
    run_name = job.run_name
    dcl_ingest_id = context.get("dcl_ingest_id")

    if not tenant_id or not entity_id:
        _mark_step(step, StepStatus.FAILED,
                   f"Cannot verify NLQ — identity pair missing "
                   f"(tenant_id={tenant_id!r}, entity_id={entity_id!r}, "
                   f"run_name={run_name!r}). Earlier pipeline steps must "
                   f"populate both before verification can run.",
                   start_time=t0)
        return

    details: dict[str, Any] = {
        "tenant_id": tenant_id,
        "entity_id": entity_id,
        "run_name": run_name,
        "dcl_ingest_id": dcl_ingest_id,
        "nlq_base_url": url,
        "checks": [],
    }

    # 1. Pipeline status — confirms NLQ reached DCL and has metrics for dashboards
    try:
        status = await nlq_client.pipeline_status(client)
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ pipeline status unreachable at "
                   f"{url}/api/v1/pipeline/status — connection refused. "
                   f"Verify NLQ is running on port 8005. "
                   f"run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ pipeline status timed out at "
                   f"{url}/api/v1/pipeline/status — {e}. "
                   f"run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return
    except httpx.HTTPStatusError as e:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ pipeline status returned HTTP "
                   f"{e.response.status_code} at "
                   f"{url}/api/v1/pipeline/status: "
                   f"{_extract_error(e.response)}. "
                   f"run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return

    dcl_connected = bool(status.get("dcl_connected"))
    metric_count = int(status.get("metric_count") or 0)
    details["checks"].append({
        "surface": "Dashboards",
        "endpoint": f"{url}/api/v1/pipeline/status",
        "dcl_connected": dcl_connected,
        "metric_count": metric_count,
        "last_dcl_ingest_id": status.get("last_dcl_ingest_id"),
    })

    if not dcl_connected:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ cannot reach DCL — Dashboards will render empty. "
                   f"pipeline/status returned dcl_connected=false. "
                   f"run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return

    if metric_count == 0:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ catalog has zero metrics — Dashboards would render "
                   f"empty even though DCL is reachable. Expected DCL ingest "
                   f"to publish at least one metric. run={run_name}, "
                   f"entity={entity_id}, "
                   f"last_dcl_ingest_id={status.get('last_dcl_ingest_id')}",
                   data=details, start_time=t0)
        return

    # 2. Schema — Dashboards use this for metric/period pickers
    try:
        schema = await nlq_client.schema(client)
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ schema unreachable at {url}/api/v1/schema — "
                   f"connection refused. run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return
    except httpx.HTTPStatusError as e:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ schema returned HTTP {e.response.status_code} at "
                   f"{url}/api/v1/schema: {_extract_error(e.response)}. "
                   f"run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return

    metrics = schema.get("metrics") or []
    periods = schema.get("periods") or []
    details["checks"].append({
        "surface": "Dashboards/schema",
        "endpoint": f"{url}/api/v1/schema",
        "metric_count": len(metrics),
        "period_count": len(periods),
    })

    if not metrics:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ schema has no metrics — Dashboards cannot render "
                   f"any widget. run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return

    # 3. Canonical Ask query — generic phrasing (F1 hook: no entity names
    # hardcoded). entity_id is passed as a structured field from pipeline
    # context, so NLQ can resolve which entity's data to return.
    question = "what was total revenue in the most recent period"
    try:
        result = await nlq_client.query(client, question, entity_id=entity_id)
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ Ask query unreachable at {url}/api/v1/query — "
                   f"connection refused. run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ Ask query timed out at {url}/api/v1/query — {e}. "
                   f"run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return
    except httpx.HTTPStatusError as e:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ Ask returned HTTP {e.response.status_code} at "
                   f"{url}/api/v1/query for {question!r}: "
                   f"{_extract_error(e.response)}. "
                   f"run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return

    ask_success = bool(result.get("success"))
    data_source = result.get("data_source")
    value = result.get("value")
    details["checks"].append({
        "surface": "Ask",
        "endpoint": f"{url}/api/v1/query",
        "question": question,
        "success": ask_success,
        "data_source": data_source,
        "value": value,
    })

    if not ask_success:
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ Ask returned success=false for {question!r} — "
                   f"answer={result.get('answer')!r}. "
                   f"Users would see no data in Ask. "
                   f"run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return

    if not isinstance(data_source, str) or not data_source.startswith("dcl"):
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ Ask answered from data_source={data_source!r} "
                   f"instead of 'dcl*' — this is not the freshly ingested "
                   f"pipeline data. run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return

    if value is None or not isinstance(value, (int, float)):
        _mark_step(step, StepStatus.FAILED,
                   f"NLQ Ask returned success=true but value={value!r} is "
                   f"not numeric — Ask surface cannot render a figure. "
                   f"run={run_name}, entity={entity_id}",
                   data=details, start_time=t0)
        return

    _mark_step(step, StepStatus.SUCCESS,
               f"Data visible in NLQ — Ask answered {value!r} from DCL, "
               f"Dashboards catalog has {metric_count} metric(s). "
               f"run={run_name}",
               data=details, start_time=t0)


async def _step_convergence_surfaces_visible(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """Post-ME check: confirm Merge, Engagements, and Reports surfaces are
    healthy for the freshly ingested engagement. Plain-English failure
    messages carry the surface name, endpoint, and full provenance.
    """
    convergence_url = _require_url(
        "CONVERGENCE_BASE_URL", config.CONVERGENCE_BASE_URL,
        "Verify Merge, Engagements, Reports")

    tenant_id = context.get("tenant_id")
    engagement_id = context.get("convergence_engagement_id")
    run_name = job.run_name
    pipeline_run_id = context.get("pipeline_run_id", job.pipeline_run_id)

    cfg = job.config
    acq_entity = (cfg.get("farm_config_a") or {}).get("entity_id")
    tgt_entity = (cfg.get("farm_config_b") or {}).get("entity_id")

    if not tenant_id or not engagement_id:
        _mark_step(step, StepStatus.FAILED,
                   f"Cannot verify Convergence surfaces — identity missing "
                   f"(tenant_id={tenant_id!r}, "
                   f"engagement_id={engagement_id!r}, "
                   f"run_name={run_name!r}). ME pre-flight must populate "
                   f"both before verification.",
                   start_time=t0)
        return

    if not acq_entity or not tgt_entity:
        _mark_step(step, StepStatus.FAILED,
                   f"Cannot verify Convergence surfaces — entity pair "
                   f"missing (acquirer={acq_entity!r}, "
                   f"target={tgt_entity!r}). ME pre-flight must populate "
                   f"farm_config_a/b.entity_id before verification.",
                   start_time=t0)
        return

    details: dict[str, Any] = {
        "tenant_id": tenant_id,
        "engagement_id": engagement_id,
        "run_name": run_name,
        "pipeline_run_id": pipeline_run_id,
        "acquirer_entity_id": acq_entity,
        "target_entity_id": tgt_entity,
        "convergence_base_url": convergence_url,
        "checks": [],
    }

    def _fail(surface: str, endpoint: str, reason: str) -> None:
        details["checks"].append({
            "surface": surface,
            "endpoint": endpoint,
            "status": "failed",
            "reason": reason,
        })
        _mark_step(step, StepStatus.FAILED,
                   f"{surface} would fail for users — {reason}. "
                   f"endpoint={endpoint}. run={run_name}, "
                   f"engagement={engagement_id}",
                   data=details, start_time=t0)

    # 1. Merge overview — must return ≥2 entities with financial summary
    merge_endpoint = f"{convergence_url}/api/convergence/merge/overview"
    try:
        merge = await convergence_client.get_merge_overview(
            acquirer_id=acq_entity, target_id=tgt_entity)
    except httpx.ConnectError:
        _fail("Merge", merge_endpoint, "connection refused")
        return
    except httpx.TimeoutException as e:
        _fail("Merge", merge_endpoint, f"request timed out — {e}")
        return
    except httpx.HTTPStatusError as e:
        _fail("Merge", merge_endpoint,
              f"HTTP {e.response.status_code}: "
              f"{_extract_error(e.response)}")
        return

    overview = merge.get("overview") or {}
    entities = overview.get("entities") or []
    financial_summary = merge.get("financial_summary") or []
    if len(entities) < 2:
        _fail("Merge", merge_endpoint,
              f"expected ≥2 entities in overview, got {len(entities)} "
              f"({[e.get('entity_id') for e in entities]}) — "
              f"page would show 'need at least 2 entities' error")
        return
    if not financial_summary:
        _fail("Merge", merge_endpoint,
              "financial_summary is empty — Merge page would render with "
              "no revenue/EBITDA figures")
        return
    details["checks"].append({
        "surface": "Merge",
        "endpoint": merge_endpoint,
        "entities": [e.get("entity_id") for e in entities],
        "financial_summary_rows": len(financial_summary),
    })

    # 2. Active engagement — Engagements page primary call
    active_endpoint = (f"{convergence_url}/api/convergence/engagements/active"
                       f"?tenant_id={tenant_id}")
    try:
        active = await convergence_client.get_active_engagement(tenant_id)
    except httpx.ConnectError:
        _fail("Engagements", active_endpoint, "connection refused")
        return
    except httpx.TimeoutException as e:
        _fail("Engagements", active_endpoint, f"request timed out — {e}")
        return
    except httpx.HTTPStatusError as e:
        _fail("Engagements", active_endpoint,
              f"HTTP {e.response.status_code}: "
              f"{_extract_error(e.response)}")
        return

    if not active:
        _fail("Engagements", active_endpoint,
              f"no active engagement for tenant — page would show empty "
              f"state even though run just completed for "
              f"engagement_id={engagement_id}")
        return
    active_eid = str(active.get("engagement_id") or "")
    if active_eid != engagement_id:
        _fail("Engagements", active_endpoint,
              f"active engagement is {active_eid!r}, expected "
              f"{engagement_id!r} — Engagements page would show the wrong "
              f"engagement as active")
        return
    details["checks"].append({
        "surface": "Engagements/active",
        "endpoint": active_endpoint,
        "active_engagement_id": active_eid,
    })

    # 3. Engagement history — past runs list
    history_endpoint = (f"{convergence_url}/api/convergence/engagements/"
                        f"{engagement_id}/runs")
    try:
        history = await convergence_client.get_engagement_history(
            engagement_id)
    except httpx.ConnectError:
        _fail("Engagements", history_endpoint, "connection refused")
        return
    except httpx.TimeoutException as e:
        _fail("Engagements", history_endpoint, f"request timed out — {e}")
        return
    except httpx.HTTPStatusError as e:
        _fail("Engagements", history_endpoint,
              f"HTTP {e.response.status_code}: "
              f"{_extract_error(e.response)}")
        return

    if not history:
        _fail("Engagements", history_endpoint,
              f"no past runs returned for engagement_id={engagement_id} — "
              f"Engagements page 'past runs' section would be empty even "
              f"though this run just completed")
        return
    details["checks"].append({
        "surface": "Engagements/runs",
        "endpoint": history_endpoint,
        "past_runs": len(history),
    })

    # 4. Reports P&L Combined tab.
    # is_active=true fallback — ME ingests span multiple convergence_ingest_ids
    # (one per entity), so no single run_id covers the combined payload.
    # Convergence's v2_helpers.py documents this: passing pipeline_run_id=None
    # switches the resolver from run_id scoping to is_active=true filtering,
    # which is exactly what Reports surfaces use by default.
    pnl_endpoint = (f"{convergence_url}/api/convergence/reports/v2/"
                    f"combining/income-statement")
    try:
        pnl = await convergence_client.get_pnl_income_statement(
            tenant_id=tenant_id)
    except httpx.ConnectError:
        _fail("Reports P&L Combined", pnl_endpoint, "connection refused")
        return
    except httpx.TimeoutException as e:
        _fail("Reports P&L Combined", pnl_endpoint,
              f"request timed out — {e}")
        return
    except httpx.HTTPStatusError as e:
        _fail("Reports P&L Combined", pnl_endpoint,
              f"HTTP {e.response.status_code}: "
              f"{_extract_error(e.response)}")
        return

    combined_pnl = pnl.get("combined")
    if not isinstance(combined_pnl, dict) or not combined_pnl:
        _fail("Reports P&L Combined", pnl_endpoint,
              f"'combined' payload missing or empty — P&L Combined tab "
              f"would render empty. keys={sorted(pnl.keys())[:10]}")
        return
    details["checks"].append({
        "surface": "Reports P&L Combined",
        "endpoint": pnl_endpoint,
        "combined_concepts": sorted(combined_pnl.keys())[:10],
    })

    # 5. Reports QofE tab — same is_active=true fallback rationale as P&L above.
    qoe_endpoint = (f"{convergence_url}/api/convergence/reports/v2/"
                    f"qoe/combined")
    try:
        qoe = await convergence_client.get_qoe_combined(
            tenant_id=tenant_id)
    except httpx.ConnectError:
        _fail("Reports QofE", qoe_endpoint, "connection refused")
        return
    except httpx.TimeoutException as e:
        _fail("Reports QofE", qoe_endpoint, f"request timed out — {e}")
        return
    except httpx.HTTPStatusError as e:
        _fail("Reports QofE", qoe_endpoint,
              f"HTTP {e.response.status_code}: "
              f"{_extract_error(e.response)}")
        return

    # QofE response shape: combined dict (per-entity QoE payload) + bridge
    # dict (adjustments). Either being populated is enough to render the tab.
    combined_qoe = qoe.get("combined")
    bridge_qoe = qoe.get("bridge")
    has_combined = isinstance(combined_qoe, dict) and bool(combined_qoe)
    has_bridge = isinstance(bridge_qoe, dict) and bool(bridge_qoe)
    if not has_combined and not has_bridge:
        _fail("Reports QofE", qoe_endpoint,
              f"neither 'combined' nor 'bridge' payload is populated — "
              f"QofE tab would render empty. keys={sorted(qoe.keys())}")
        return
    details["checks"].append({
        "surface": "Reports QofE",
        "endpoint": qoe_endpoint,
        "combined_keys": sorted(combined_qoe.keys())[:10] if has_combined else [],
        "bridge_keys": sorted(bridge_qoe.keys())[:10] if has_bridge else [],
    })

    _mark_step(step, StepStatus.SUCCESS,
               f"Convergence surfaces verified — Merge ({len(entities)} "
               f"entities), Engagements ({len(history)} past runs), "
               f"P&L Combined ({len(combined_pnl)} concepts), QofE "
               f"(combined={has_combined}, bridge={has_bridge}). "
               f"run={run_name}",
               data=details, start_time=t0)


def _step_complete(
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """Final summary step."""
    succeeded = sum(1 for s in job.steps if s.status == StepStatus.SUCCESS)
    failed = sum(1 for s in job.steps if s.status == StepStatus.FAILED)
    skipped = sum(1 for s in job.steps if s.status == StepStatus.SKIPPED)
    # Count all steps except the "complete" step itself
    steps_except_complete = [s for s in job.steps if s.name != "complete"]
    total = len(steps_except_complete)

    elapsed_ms = 0
    for s in job.steps:
        if s.duration_ms:
            elapsed_ms += s.duration_ms

    summary: dict[str, Any] = {
        "steps_succeeded": succeeded,
        "steps_failed": failed,
        "steps_skipped": skipped,
        "steps_total": total,
        "total_elapsed_ms": elapsed_ms,
        "pipeline_mode": job.pipeline_mode.value,
        "run_name": job.run_name,
        "entity_id": context.get("entity_id"),
    }

    # ME: aggregate per-entity expansion metrics
    if job.pipeline_mode == PipelineMode.ME:
        source_rows = (
            (context.get("source_rows_a") or 0)
            + (context.get("source_rows_b") or 0))
        triples_written = (
            (context.get("triples_written_a") or 0)
            + (context.get("triples_written_b") or 0))
        if source_rows:
            summary["source_rows"] = source_rows
        if triples_written:
            summary["triples_written"] = triples_written
        if source_rows and source_rows > 0 and triples_written:
            summary["expansion_factor"] = round(
                triples_written / source_rows, 1)
        # ME identity
        summary["engagement_short_name"] = context.get(
            "engagement_short_name")
        summary["convergence_engagement_id"] = context.get(
            "convergence_engagement_id")
    else:
        # SE: single-entity metrics
        source_rows = context.get("source_rows")
        triples_written = context.get("triples_written")
        expansion_factor = context.get("expansion_factor")
        if source_rows is not None:
            summary["source_rows"] = source_rows
        if triples_written is not None:
            summary["triples_written"] = triples_written
        if expansion_factor is not None:
            summary["expansion_factor"] = expansion_factor

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


# ── Run Name Management ─────────────────────────────────────────────

def _update_run_name(job: PipelineJob, context: dict[str, Any]) -> None:
    """Update job.run_name when identity becomes available.

    SE: entity_id from Farm.
    ME: engagement_short_name from Convergence pre-flight.
    Also sets provenance_tag on all steps to run_name for UI display.
    """
    entity_id = context.get("entity_id")
    engagement_short_name = context.get("engagement_short_name")
    new_name = make_run_name(
        entity_id, job.pipeline_run_id,
        engagement_short_name=engagement_short_name)
    job.run_name = new_name
    for s in job.steps:
        s.provenance_tag = new_name


# ── ME Pre-flight ───────────────────────────────────────────────────

async def _me_preflight(
    client: httpx.AsyncClient,
    job: PipelineJob,
    context: dict[str, Any],
    cfg: dict[str, Any],
) -> None:
    """Fetch engagement from Convergence, populate context + per-entity configs.

    Raises RuntimeError on failure (caller catches and aborts pipeline).
    Sets: convergence_engagement_id, engagement_short_name, tenant_id,
          farm_config_a.entity_id, farm_config_b.entity_id, run_name.
    """
    convergence_url = config.CONVERGENCE_BASE_URL
    if not convergence_url:
        raise RuntimeError(
            "ME pre-flight — CONVERGENCE_BASE_URL not configured")

    convergence_url = convergence_url.rstrip("/")

    # Engagement ID — Convergence is the canonical owner
    engagement_id = (cfg.get("convergence_engagement_id")
                     or cfg.get("engagement_id"))
    if not engagement_id:
        raise RuntimeError(
            "ME pre-flight — no engagement_id in pipeline config")

    url = (f"{convergence_url}/api/convergence/engagements/"
           f"{engagement_id}")
    try:
        resp = await client.get(url, headers=_json_headers())
    except httpx.ConnectError:
        raise RuntimeError(
            f"ME pre-flight — Could not reach Convergence "
            f"at {url} — connection refused")
    except httpx.TimeoutException:
        raise RuntimeError(
            f"ME pre-flight — Convergence timed out at {url}")

    if resp.status_code == 404:
        raise RuntimeError(
            f"ME pre-flight — engagement {engagement_id} not found in Convergence")
    if resp.status_code != 200:
        raise RuntimeError(
            f"ME pre-flight — Convergence returned "
            f"{resp.status_code}: {_extract_error(resp)}")

    eng = resp.json()

    lifecycle_stage = eng.get("lifecycle_stage")
    if lifecycle_stage != "active":
        raise RuntimeError(
            f"ME pre-flight — engagement {engagement_id} is not runnable: "
            f"lifecycle_stage={lifecycle_stage!r} (must be 'active'). "
            f"Only active engagements can run the ME pipeline.")

    # Populate context from Convergence engagement
    context["convergence_engagement_id"] = str(eng["engagement_id"])
    short_name = eng.get("short_name") or eng.get("engagement_short_name", "")
    context["engagement_short_name"] = short_name

    acq_entity = eng.get("acquirer_entity_id", "")
    tgt_entity = eng.get("target_entity_id", "")

    # tenant_id: Convergence engagement > env
    tenant_id = eng.get("tenant_id")
    if not tenant_id:
        tenant_id = config.AOS_TENANT_ID
    context["tenant_id"] = tenant_id

    # Set per-entity Farm configs so farm_financials_a/b get correct entity_id
    job.config["farm_config_a"] = {
        **cfg.get("farm_config_a", {}),
        "entity_id": acq_entity,
    }
    job.config["farm_config_b"] = {
        **cfg.get("farm_config_b", {}),
        "entity_id": tgt_entity,
    }

    # Persist Convergence identity in job.config for step-mode context rebuild
    job.config["convergence_engagement_id"] = context[
        "convergence_engagement_id"]
    job.config["engagement_short_name"] = short_name

    # Set run_name from engagement_short_name
    _update_run_name(job, context)

    logger.info(
        f"[PIPELINE] ME pre-flight OK — engagement={eng['engagement_id']}, "
        f"short_name={short_name}, acquirer={acq_entity}, "
        f"target={tgt_entity}")


# ── Pipeline Execution Engine ────────────────────────────────────────

async def run_pipeline_batch(pipeline_run_id: str) -> None:
    """Run all pipeline steps in sequence (batch mode).

    Parallel groups are executed concurrently via asyncio.gather.
    Stops on first failure (subsequent steps stay PENDING).
    Persists to Postgres on each step completion.
    """
    job = PIPELINE_JOBS.get(pipeline_run_id)
    if not job:
        return

    job.status = "running"

    async with httpx.AsyncClient(timeout=240.0) as client:
        context: dict[str, Any] = {
            "pipeline_run_id": pipeline_run_id,
        }

        # Resolve tenant identity — SE and ME have different models.
        cfg = job.config

        if job.pipeline_mode == PipelineMode.SE:
            # SE: canonical tenant_id from env.  entity_id is generated by
            # Farm during the snapshot step — NOT from SEED_ACQUIRER_ENTITY
            # (that's an ME entity).  entity_id will be set by
            # _step_farm_snapshot when Farm responds.
            context["tenant_id"] = config.AOS_TENANT_ID
        else:
            # ── ME pre-flight ──────────────────────────────────────
            # Fetch engagement from Convergence API to get canonical
            # engagement_id, engagement_short_name, and entity pair.
            try:
                await _me_preflight(client, job, context, cfg)
            except RuntimeError as e:
                logger.error(f"[PIPELINE] {e}")
                job.status = "completed_with_errors"
                job.message = str(e)
                job.completed_at = _now()
                await _persist_job(job)
                return

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
    context: dict[str, Any] = {
        "pipeline_run_id": job.pipeline_run_id,
    }
    # Carry identity from job config first (set at pipeline start from registry)
    cfg = job.config
    for key in ("tenant_id", "entity_id", "entity_name"):
        if cfg.get(key):
            context[key] = cfg[key]

    # SE default: canonical tenant from env.  entity_id comes from Farm
    # snapshot step (recovered from step data below), not SEED_ACQUIRER_ENTITY.
    if job.pipeline_mode == PipelineMode.SE:
        if not context.get("tenant_id"):
            context["tenant_id"] = config.AOS_TENANT_ID

    # ME identity from config (set by pre-flight, persisted in job.config)
    if cfg.get("convergence_engagement_id"):
        context["convergence_engagement_id"] = cfg["convergence_engagement_id"]
    if cfg.get("engagement_short_name"):
        context["engagement_short_name"] = cfg["engagement_short_name"]

    for s in job.steps:
        if s.data and s.status == StepStatus.SUCCESS:
            # Capture namespaced IDs from step data
            if "farm_manifest_id" in s.data:
                context["farm_manifest_id"] = s.data["farm_manifest_id"]
            elif "snapshot_id" in s.data:
                context["farm_manifest_id"] = s.data["snapshot_id"]
            if s.name == "farm_snapshot":
                if job.pipeline_mode == PipelineMode.SE and "entity_id" in s.data:
                    context["entity_id"] = s.data["entity_id"]
            else:
                if "tenant_id" in s.data:
                    context["tenant_id"] = s.data["tenant_id"]
                if "entity_id" in s.data:
                    context["entity_id"] = s.data["entity_id"]
            if "aod_discovery_id" in s.data:
                context["aod_discovery_id"] = s.data["aod_discovery_id"]
            if "handoff_id" in s.data:
                context["handoff_id"] = s.data["handoff_id"]
            if "aam_inference_id" in s.data:
                context["aam_inference_id"] = s.data["aam_inference_id"]
            # Extract ingest ID — ME uses convergence_ingest_id, SE uses dcl_ingest_id
            if s.name in ("farm_financials_a", "farm_financials_b"):
                _push = s.data.get("push_result") or {}
                _cid = (s.data.get("convergence_ingest_id")
                        or _push.get("convergence_ingest_id")
                        or _push.get("dcl_run_id")
                        or s.data.get("dcl_ingest_id"))
                if _cid:
                    context.setdefault("convergence_ingest_ids", []).append(_cid)
                if s.name == "farm_financials_a" and _cid:
                    context["convergence_ingest_id_a"] = _cid
                if s.name == "farm_financials_b" and _cid:
                    context["convergence_ingest_id_b"] = _cid
            else:
                _dcl_id = s.data.get("dcl_ingest_id")
                if not _dcl_id:
                    _push = s.data.get("push_result") or {}
                    _dcl_id = (_push.get("dcl_ingest_id")
                               or _push.get("dcl_run_id"))
                if _dcl_id:
                    context.setdefault("dcl_ingest_ids", []).append(_dcl_id)
                    context["dcl_ingest_id"] = _dcl_id
            # Convergence multi-entity overlay
            if s.name == "convergence_overlay":
                _ov_id = s.data.get("convergence_overlay_id")
                if _ov_id:
                    context["convergence_overlay_id"] = _ov_id
                    context.setdefault(
                        "convergence_ingest_ids", []).append(_ov_id)
                _ov_fm = s.data.get("overlay_farm_manifest_id")
                if _ov_fm:
                    context["overlay_farm_manifest_id"] = _ov_fm
            # COFA output
            if "cofa_run_id" in s.data:
                context["cofa_run_id"] = s.data["cofa_run_id"]
            if "verify_id" in s.data:
                context["verify_id"] = s.data["verify_id"]
    return context


async def run_single_step(pipeline_run_id: str, step_indices: list[int]) -> None:
    """Run specific step(s) for step-by-step mode."""
    job = PIPELINE_JOBS.get(pipeline_run_id)
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
        logger.error(
            f"[PIPELINE] Failed to persist job {job.pipeline_run_id}: {exc}"
        )
