"""Pipeline orchestrator — ported from Platform's operator.py.

Orchestrates the AOS pipeline by calling each external service's real
API endpoints. Supports batch (run all steps) and step-by-step (run
one step at a time) execution modes.

The spine (one identity pair, minted with the enterprise, threaded
unchanged through every boundary — I2):

  Enterprise Snapshot (Farm mints entity_id + tenant_id; no DCL push)
  → Discover (AOD scans the enterprise)
  → Validation Lab (Farm grades the AOD scan vs ground truth; FAIL gates)
  → Connect (AOD → AAM candidate handoff, AAM pipe inference)
  → Transport (AAM pulls plane records, one combined DCL ingest)
  → Verify Data in Ask & Dashboards (NLQ sees the run)
  → Complete
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Any

import httpx

from backend.app import config, db
from backend.app.models.pipeline import (
    ExecutionMode,
    PipelineJob,
    PipelineStep,
    StepStatus,
)
from backend.app.services import nlq_client

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
) -> str:
    """Build human-readable run label.

    {entity_id}-{short_hash}  (e.g., BlueLogic-NEQ8-a9ed)
    short_hash = first 4 hex chars of pipeline_run_id (no hyphens).
    """
    short_hash = pipeline_run_id.replace("-", "")[:4]
    if entity_id:
        return f"{entity_id}-{short_hash}"
    return short_hash


# ── Pipeline Step Definitions ────────────────────────────────────────

def create_se_steps() -> list[PipelineStep]:
    return [
        PipelineStep(name="farm_snapshot", display_name="Enterprise Snapshot (Farm)",
                     message="Stand up the enterprise; mint run identity"),
        PipelineStep(name="aod_discovery", display_name="AOD Discovery",
                     message="Scan the enterprise; classify assets"),
        PipelineStep(name="farm_validation", display_name="Validation Lab Grade",
                     message="Farm grades AOD scan accuracy vs ground truth"),
        PipelineStep(name="aod_aam_handoff", display_name="AOD → AAM Handoff",
                     message="Export connection candidates to AAM"),
        PipelineStep(name="aam_inference", display_name="AAM Inference",
                     message="Infer pipe definitions"),
        PipelineStep(name="aam_transport", display_name="AAM Transport → DCL",
                     message="Pull plane records; one combined DCL ingest"),
        PipelineStep(name="nlq_data_visible",
                     display_name="Verify Data in Ask & Dashboards",
                     message="Confirm NLQ can query and render the new data"),
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
        elif step.name == "farm_validation":
            await _step_farm_validation(client, step, job, context, t0)
        elif step.name == "aod_aam_handoff":
            await _step_aod_aam_handoff(client, step, job, context, t0)
        elif step.name == "aam_inference":
            await _step_aam_inference(client, step, job, context, t0)
        elif step.name == "aam_transport":
            await _step_aam_transport(client, step, job, context, t0)
        elif step.name == "nlq_data_visible":
            await _step_nlq_data_visible(client, step, job, context, t0)
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
    """Step 1: Stand up the enterprise (Farm snapshot). Farm owns identity
    generation (A10): every snapshot mints a fresh I2 pair (entity_id business
    key + tenant_id UUID, 1:1) that threads unchanged through the whole spine.
    push_to_dcl=false — in the new spine AAM owns transport; the snapshot is
    the enterprise standing up, not a DCL write."""
    url = _require_url("FARM_BASE_URL", config.FARM_BASE_URL, "Farm Snapshot")
    cfg = job.config

    body: dict[str, Any] = {
        "scale": cfg.get("scale", "medium"),
        "push_to_dcl": False,
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
        if not data.get("entity_id") or not data.get("tenant_id"):
            _mark_step(step, StepStatus.FAILED,
                       f"Farm snapshot response missing identity pair "
                       f"(entity_id={data.get('entity_id')!r}, "
                       f"tenant_id={data.get('tenant_id')!r}) — every stage "
                       f"must carry both (I2). No silent fallback.",
                       data=data, start_time=t0)
            return
        context["entity_id"] = data["entity_id"]
        context["tenant_id"] = data["tenant_id"]
        _update_run_name(job, context)
        _mark_step(step, StepStatus.SUCCESS,
                   f"Enterprise up: entity {data['entity_id']} "
                   f"(fresh identity pair minted)",
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
                    if not result.get("entity_id") or not result.get("tenant_id"):
                        _mark_step(step, StepStatus.FAILED,
                                   f"Farm snapshot job result missing identity "
                                   f"pair (entity_id={result.get('entity_id')!r}, "
                                   f"tenant_id={result.get('tenant_id')!r}) — "
                                   f"every stage must carry both (I2).",
                                   data=result, start_time=t0)
                        return
                    context["entity_id"] = result["entity_id"]
                    context["tenant_id"] = result["tenant_id"]
                    _update_run_name(job, context)
                    _mark_step(step, StepStatus.SUCCESS,
                               f"Enterprise up: entity {result['entity_id']} "
                               f"(fresh identity pair minted)",
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
    """Step 2: Discover — AOD scans the enterprise snapshot. AOS starts here.
    Carries the snapshot-minted identity pair explicitly (I2)."""
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
    if not tenant_id or not entity_id:
        _mark_step(step, StepStatus.FAILED,
                   f"Identity pair missing for AOD Discovery "
                   f"(tenant_id={tenant_id!r}, entity_id={entity_id!r}) — "
                   f"the Enterprise Snapshot step mints both (I2). "
                   f"No silent fallback.",
                   start_time=t0)
        return

    body: dict[str, Any] = {
        "snapshot_id": farm_manifest_id,
        "farm_base_url": farm_url,
        "tenant_id": tenant_id,
        "entity_id": entity_id,
    }

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


async def _step_farm_validation(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """Step 3: Validation Lab — Farm grades the AOD scan against its own
    ground truth (the __expected__ block computed from the snapshot).

    POST /api/reconcile/auto makes Farm pull AOD's results for this
    (snapshot, tenant) and grade them: PASS / WARN / FAIL.
    FAIL is a hard gate — a discovery that can't be trusted must not feed
    Connect/Transport. WARN passes with the grade surfaced loudly.
    """
    url = _require_url("FARM_BASE_URL", config.FARM_BASE_URL,
                       "Validation Lab Grade")

    farm_manifest_id = context.get("farm_manifest_id")
    tenant_id = context.get("tenant_id")
    aod_discovery_id = context.get("aod_discovery_id")

    if not farm_manifest_id or not tenant_id:
        _mark_step(step, StepStatus.FAILED,
                   f"Cannot grade scan — snapshot/tenant missing "
                   f"(farm_manifest_id={farm_manifest_id!r}, "
                   f"tenant_id={tenant_id!r}). Earlier steps must succeed first.",
                   start_time=t0)
        return
    if not aod_discovery_id:
        _mark_step(step, StepStatus.FAILED,
                   "No aod_discovery_id available — AOD Discovery step must "
                   "succeed before its scan can be graded.",
                   start_time=t0)
        return

    try:
        resp = await client.post(
            f"{url}/api/reconcile/auto",
            json={"snapshot_id": farm_manifest_id, "tenant_id": tenant_id},
            headers=_json_headers(),
        )
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach Farm at {url}/api/reconcile/auto — "
                   f"connection refused. Verify Farm is running.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"Validation Lab grading timed out at "
                   f"{url}/api/reconcile/auto — {e}",
                   start_time=t0)
        return

    if resp.status_code != 200:
        _mark_step(step, StepStatus.FAILED,
                   f"Validation Lab grading failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)
        return

    data = resp.json()
    grade = str(data.get("status") or "").upper()
    graded_run = data.get("aod_run_id")
    reconciliation_id = data.get("reconciliation_id")
    if reconciliation_id:
        context["reconciliation_id"] = reconciliation_id
    context["validation_grade"] = grade

    # Provenance cross-check (I3): the grade must be for THIS run's scan.
    if graded_run and graded_run != aod_discovery_id:
        _mark_step(step, StepStatus.FAILED,
                   f"Validation Lab graded a different scan "
                   f"(aod_run_id={graded_run}) than this run's discovery "
                   f"({aod_discovery_id}) — provenance mismatch, refusing to "
                   f"proceed on someone else's grade.",
                   data=data, start_time=t0)
        return

    if grade == "FAIL":
        _mark_step(step, StepStatus.FAILED,
                   f"Validation Lab graded the AOD scan FAIL — Farm ground "
                   f"truth exceeds what AOD found. Discovery cannot be "
                   f"trusted; transport gated. reconciliation_id="
                   f"{reconciliation_id}",
                   data=data, start_time=t0)
        return
    if grade not in ("PASS", "WARN"):
        _mark_step(step, StepStatus.FAILED,
                   f"Validation Lab returned unknown grade {grade!r} "
                   f"(expected PASS/WARN/FAIL) — refusing to treat unknown "
                   f"as success.",
                   data=data, start_time=t0)
        return

    detail = ("AOD scan matches Farm ground truth" if grade == "PASS"
              else "scan deviates from Farm ground truth — review scorecard")
    _mark_step(step, StepStatus.SUCCESS,
               f"Scan accuracy graded {grade} — {detail} "
               f"(scan {aod_discovery_id})",
               data=data, start_time=t0)


async def _step_aod_aam_handoff(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """Step 4: Connect — export AOD connection candidates to AAM."""
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


async def _step_aam_transport(
    client: httpx.AsyncClient,
    step: PipelineStep,
    job: PipelineJob,
    context: dict[str, Any],
    t0: float,
) -> None:
    """Step 6: Transport — AAM pulls every fabric plane's raw records for this
    run's entity and lands them in ONE combined DCL ingest (records path).

    Replaces the retired Farm manifest-intake triples push: AAM owns
    connectivity + transport (A10); DCL resolves the records into canonical
    concepts. The run's identity pair is passed explicitly — AAM mints nothing.
    """
    url = _require_url("AAM_BASE_URL", config.AAM_BASE_URL,
                       step.display_name)

    tenant_id = context.get("tenant_id")
    entity_id = context.get("entity_id")
    if not tenant_id or not entity_id:
        _mark_step(step, StepStatus.FAILED,
                   f"Identity pair missing for AAM Transport "
                   f"(tenant_id={tenant_id!r}, entity_id={entity_id!r}) — "
                   f"the Enterprise Snapshot step mints both (I2). "
                   f"No silent fallback.",
                   start_time=t0)
        return

    body: dict[str, Any] = {
        "plane": "all",
        "extra_planes": ["erp", "bi", "ledger"],
        "tenant_id": tenant_id,
        "entity_id": entity_id,
    }

    try:
        # Full-depth transport (7 planes, one batched ingest + honest
        # read-back) runs ~30-90s; give it its own ceiling above the
        # client default.
        resp = await client.post(f"{url}/api/aam/operator/fabric/run",
                                 json=body, headers=_json_headers(),
                                 timeout=300.0)
    except httpx.ConnectError:
        _mark_step(step, StepStatus.FAILED,
                   f"Could not reach AAM at {url}/api/aam/operator/fabric/run "
                   f"— connection refused. Verify AAM is running.",
                   start_time=t0)
        return
    except httpx.TimeoutException as e:
        _mark_step(step, StepStatus.FAILED,
                   f"AAM transport timed out at "
                   f"{url}/api/aam/operator/fabric/run — {e}",
                   start_time=t0)
        return

    if resp.status_code != 200:
        _mark_step(step, StepStatus.FAILED,
                   f"AAM transport failed ({resp.status_code}): "
                   f"{_extract_error(resp)}",
                   start_time=t0)
        return

    data = resp.json()
    planes = data.get("planes") or []
    failed = [p for p in planes if not p.get("ok")]
    if failed or not data.get("ok") or not planes:
        errors = "; ".join(
            f"{p.get('plane')}: {p.get('error', 'unknown error')}"
            for p in failed
        ) or "no planes returned"
        _mark_step(step, StepStatus.FAILED,
                   f"AAM transport failed for "
                   f"{len(failed) or 'all'} plane(s) — {errors}",
                   data=data, start_time=t0)
        return

    records_total = sum(int(p.get("records") or 0) for p in planes)
    concept_names: set[str] = set()
    for p in planes:
        concept_names.update((p.get("concepts") or {}).keys())
    dcl_ingest_id = planes[0].get("dcl_ingest_id")

    if dcl_ingest_id:
        context["dcl_ingest_id"] = dcl_ingest_id
        context.setdefault("dcl_ingest_ids", []).append(dcl_ingest_id)
    context["records_transported"] = records_total
    context["planes_run"] = len(planes)
    context["concepts_distinct"] = len(concept_names)

    _mark_step(step, StepStatus.SUCCESS,
               f"Transported {records_total:,} records across {len(planes)} "
               f"planes → one DCL ingest "
               f"({str(dcl_ingest_id)[:8]}), {len(concept_names)} distinct "
               f"concepts resolved",
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
        "run_name": job.run_name,
        "entity_id": context.get("entity_id"),
    }

    for key in ("validation_grade", "records_transported", "planes_run",
                "concepts_distinct", "dcl_ingest_id"):
        if context.get(key) is not None:
            summary[key] = context[key]

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
    """Update job.run_name when entity_id becomes available from Farm.

    Also sets provenance_tag on all steps to run_name for UI display.
    """
    entity_id = context.get("entity_id")
    new_name = make_run_name(entity_id, job.pipeline_run_id)
    job.run_name = new_name
    for s in job.steps:
        s.provenance_tag = new_name


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
        # Identity is NOT seeded from the environment: the Enterprise Snapshot
        # step mints the run's pair (I2) and every later step requires it.
        # A missing pair fails the step loudly — no env-tenant fallback (I6).
        context: dict[str, Any] = {
            "pipeline_run_id": pipeline_run_id,
        }

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
    # Carry identity from job config first (set at pipeline start from registry).
    # No env-tenant fallback: the Enterprise Snapshot step mints the pair (I2)
    # and replaying completed steps below recovers it.
    cfg = job.config
    for key in ("tenant_id", "entity_id", "entity_name"):
        if cfg.get(key):
            context[key] = cfg[key]

    for s in job.steps:
        if s.data and s.status == StepStatus.SUCCESS:
            # Capture namespaced IDs from step data
            if "farm_manifest_id" in s.data:
                context["farm_manifest_id"] = s.data["farm_manifest_id"]
            elif "snapshot_id" in s.data:
                context["farm_manifest_id"] = s.data["snapshot_id"]
            if "tenant_id" in s.data:
                context["tenant_id"] = s.data["tenant_id"]
            if "entity_id" in s.data:
                context["entity_id"] = s.data["entity_id"]
            if "aod_discovery_id" in s.data:
                context["aod_discovery_id"] = s.data["aod_discovery_id"]
            if "reconciliation_id" in s.data:
                context["reconciliation_id"] = s.data["reconciliation_id"]
            if s.name == "farm_validation" and "status" in s.data:
                context["validation_grade"] = str(s.data["status"]).upper()
            if "handoff_id" in s.data:
                context["handoff_id"] = s.data["handoff_id"]
            if "aam_inference_id" in s.data:
                context["aam_inference_id"] = s.data["aam_inference_id"]
            if s.name == "aam_transport":
                planes = s.data.get("planes") or []
                context["records_transported"] = sum(
                    int(p.get("records") or 0) for p in planes)
                context["planes_run"] = len(planes)
                names: set[str] = set()
                for p in planes:
                    names.update((p.get("concepts") or {}).keys())
                context["concepts_distinct"] = len(names)
                if planes and planes[0].get("dcl_ingest_id"):
                    _tid = planes[0]["dcl_ingest_id"]
                    context.setdefault("dcl_ingest_ids", []).append(_tid)
                    context["dcl_ingest_id"] = _tid
            _dcl_id = s.data.get("dcl_ingest_id")
            if not _dcl_id:
                _push = s.data.get("push_result") or {}
                _dcl_id = (_push.get("dcl_ingest_id")
                           or _push.get("dcl_run_id"))
            if _dcl_id:
                context.setdefault("dcl_ingest_ids", []).append(_dcl_id)
                context["dcl_ingest_id"] = _dcl_id
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
