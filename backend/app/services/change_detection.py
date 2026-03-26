"""Change detection — compares module state against stored snapshots."""

import logging
from datetime import datetime, timezone

import httpx

from backend.app import config, db

logger = logging.getLogger("console.change_detection")

_DETECTION_TIMEOUT = 10.0


async def _get_thresholds() -> dict:
    """Load detection thresholds from console_config."""
    thresholds = await db.get_config("detection_thresholds")
    if not thresholds:
        return {
            "coverage_drop_critical": 10,
            "coverage_drop_warning": 5,
            "confidence_shift_warning": 0.10,
            "source_stale_hours": 48,
        }
    return thresholds


async def detect_aod_changes() -> list[dict]:
    """Detect AOD changes by comparing health/status against previous snapshot."""
    module = "aod"
    events: list[dict] = []
    now = datetime.now(timezone.utc)

    try:
        async with httpx.AsyncClient(timeout=_DETECTION_TIMEOUT) as client:
            resp = await client.get(f"{config.AOD_BASE_URL}/health")
            resp.raise_for_status()
            health = resp.json()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        logger.error(
            f"AOD unreachable at {config.AOD_BASE_URL}/health — "
            f"{type(exc).__name__}: {exc}"
        )
        return []

    current_snapshot = {
        "status": health.get("status", "unknown"),
        "checked_at": now.isoformat(),
    }

    previous = await db.get_config(f"snapshot_{module}")

    if previous is None:
        logger.info("AOD detection: first run, storing baseline snapshot")
        await db.set_config(f"snapshot_{module}", current_snapshot)
        return []

    prev_status = previous.get("status", "unknown")
    curr_status = current_snapshot["status"]

    if prev_status != curr_status:
        severity = "warning" if curr_status != "ok" else "info"
        events.append({
            "timestamp": now,
            "source_module": module,
            "event_type": "health_change",
            "summary": f"AOD health changed: {prev_status} to {curr_status}",
            "severity": severity,
            "payload": {"previous_status": prev_status, "current_status": curr_status},
        })

    if not events:
        events.append({
            "timestamp": now,
            "source_module": module,
            "event_type": "discovery_scan",
            "summary": "AOD health check: status unchanged",
            "severity": "info",
            "payload": {"status": curr_status},
        })

    await db.set_config(f"snapshot_{module}", current_snapshot)
    return events


async def detect_aam_changes() -> list[dict]:
    """Detect AAM changes — drift events and pipe health."""
    module = "aam"
    events: list[dict] = []
    now = datetime.now(timezone.utc)

    drift_data = None
    pipes_data = None

    try:
        async with httpx.AsyncClient(timeout=_DETECTION_TIMEOUT) as client:
            drift_resp = await client.get(f"{config.AAM_BASE_URL}/api/drift")
            drift_resp.raise_for_status()
            drift_data = drift_resp.json()

            pipes_resp = await client.get(f"{config.AAM_BASE_URL}/api/pipes")
            pipes_resp.raise_for_status()
            pipes_data = pipes_resp.json()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        logger.error(
            f"AAM unreachable at {config.AAM_BASE_URL} — "
            f"{type(exc).__name__}: {exc}"
        )
        return []

    drift_list = drift_data if isinstance(drift_data, list) else drift_data.get("drifts", [])
    pipes_list = pipes_data if isinstance(pipes_data, list) else pipes_data.get("pipes", [])

    pipe_count = len(pipes_list)
    drift_count = len(drift_list)

    current_snapshot = {
        "drift_count": drift_count,
        "pipe_count": pipe_count,
        "last_drift_ids": [d.get("drift_id", "") for d in drift_list[:20]],
        "checked_at": now.isoformat(),
    }

    previous = await db.get_config(f"snapshot_{module}")

    if previous is None:
        logger.info("AAM detection: first run, storing baseline snapshot")
        await db.set_config(f"snapshot_{module}", current_snapshot)
        return []

    prev_drift_ids = set(previous.get("last_drift_ids", []))
    new_drifts = [d for d in drift_list if d.get("drift_id", "") not in prev_drift_ids]

    for drift in new_drifts:
        drift_type = drift.get("drift_type", "unknown")
        severity_raw = drift.get("severity", "medium")
        severity = "critical" if severity_raw == "high" else "warning"
        event_type = "schema_drift" if "schema" in drift_type else "endpoint_drift"
        events.append({
            "timestamp": now,
            "source_module": module,
            "event_type": event_type,
            "summary": f"Drift detected: {drift_type} on pipe {drift.get('pipe_id', 'unknown')}",
            "severity": severity,
            "payload": drift,
        })

    prev_pipe_count = previous.get("pipe_count", 0)
    if pipe_count < prev_pipe_count:
        events.append({
            "timestamp": now,
            "source_module": module,
            "event_type": "pipe_unhealthy",
            "summary": f"Pipe count dropped from {prev_pipe_count} to {pipe_count}",
            "severity": "warning",
            "payload": {"previous_count": prev_pipe_count, "current_count": pipe_count},
        })

    if not events:
        events.append({
            "timestamp": now,
            "source_module": module,
            "event_type": "health_check",
            "summary": f"Pipe health check: {pipe_count}/{pipe_count} healthy",
            "severity": "info",
            "payload": {"healthy_count": pipe_count, "total_count": pipe_count},
        })

    await db.set_config(f"snapshot_{module}", current_snapshot)
    return events


async def detect_dcl_changes() -> list[dict]:
    """Detect DCL changes — triple count, coverage, freshness."""
    module = "dcl"
    events: list[dict] = []
    now = datetime.now(timezone.utc)
    thresholds = await _get_thresholds()

    try:
        async with httpx.AsyncClient(timeout=_DETECTION_TIMEOUT) as client:
            resp = await client.get(f"{config.DCL_BASE_URL}/api/dcl/triples/overview")
            resp.raise_for_status()
            overview = resp.json()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        logger.error(
            f"DCL unreachable at {config.DCL_BASE_URL}/api/dcl/triples/overview — "
            f"{type(exc).__name__}: {exc}"
        )
        return []

    triple_count = overview.get("total_triples", overview.get("count", 0))
    snapshot_ts = overview.get("snapshot_ts", overview.get("last_updated", now.isoformat()))

    current_snapshot = {
        "triple_count": triple_count,
        "snapshot_ts": snapshot_ts,
        "checked_at": now.isoformat(),
    }

    previous = await db.get_config(f"snapshot_{module}")

    if previous is None:
        logger.info("DCL detection: first run, storing baseline snapshot")
        await db.set_config(f"snapshot_{module}", current_snapshot)
        return []

    # Check coverage drop (triple count as proxy)
    prev_count = previous.get("triple_count", 0)
    if prev_count > 0 and triple_count < prev_count:
        drop_pct = ((prev_count - triple_count) / prev_count) * 100
        crit_threshold = thresholds.get("coverage_drop_critical", 10)
        warn_threshold = thresholds.get("coverage_drop_warning", 5)

        if drop_pct >= crit_threshold:
            events.append({
                "timestamp": now,
                "source_module": module,
                "event_type": "coverage_drop",
                "summary": f"Coverage drop: triple count {prev_count} to {triple_count} ({drop_pct:.1f}%)",
                "severity": "critical",
                "payload": {
                    "previous_count": prev_count,
                    "current_count": triple_count,
                    "drop_percent": round(drop_pct, 1),
                },
            })
        elif drop_pct >= warn_threshold:
            events.append({
                "timestamp": now,
                "source_module": module,
                "event_type": "coverage_drop",
                "summary": f"Coverage drop: triple count {prev_count} to {triple_count} ({drop_pct:.1f}%)",
                "severity": "warning",
                "payload": {
                    "previous_count": prev_count,
                    "current_count": triple_count,
                    "drop_percent": round(drop_pct, 1),
                },
            })

    # Check source freshness
    stale_hours_threshold = thresholds.get("source_stale_hours", 48)
    if snapshot_ts:
        try:
            last_updated = datetime.fromisoformat(snapshot_ts.replace("Z", "+00:00"))
            hours_since = (now - last_updated).total_seconds() / 3600
            if hours_since > stale_hours_threshold:
                events.append({
                    "timestamp": now,
                    "source_module": module,
                    "event_type": "source_stale",
                    "summary": f"Source freshness: data stale ({int(hours_since)}h)",
                    "severity": "warning",
                    "payload": {
                        "hours_stale": round(hours_since, 1),
                        "staleness_threshold_hours": stale_hours_threshold,
                        "triple_count": triple_count,
                    },
                })
        except (ValueError, TypeError):
            logger.warning(f"Could not parse DCL snapshot_ts: {snapshot_ts}")

    if not events:
        events.append({
            "timestamp": now,
            "source_module": module,
            "event_type": "coverage_check",
            "summary": f"DCL coverage check: {triple_count} triples, no change",
            "severity": "info",
            "payload": {"triple_count": triple_count},
        })

    await db.set_config(f"snapshot_{module}", current_snapshot)
    return events
