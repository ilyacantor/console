"""Cron scheduler — asyncio background loops for change detection."""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Callable, Coroutine

from backend.app import db
from backend.app.services.change_detection import (
    detect_aam_changes,
    detect_aod_changes,
    detect_dcl_changes,
)

logger = logging.getLogger("console.cron_scheduler")

_tasks: list[asyncio.Task] = []

_DETECT_FNS: dict[str, Callable[[], Coroutine]] = {
    "aod": detect_aod_changes,
    "aam": detect_aam_changes,
    "dcl": detect_dcl_changes,
}

_CONFIG_KEYS: dict[str, str] = {
    "aod": "aod_discovery",
    "aam": "aam_drift",
    "dcl": "dcl_coverage",
}


async def _run_detection_loop(
    module: str,
    config_key: str,
    detect_fn: Callable[[], Coroutine],
) -> None:
    """Run a detection function on a schedule read from console_config."""
    logger.info(f"Cron loop started for {module} (config_key={config_key})")

    while True:
        schedule = await db.get_config("cron_schedules")
        module_config = (schedule or {}).get(config_key, {})

        if not module_config.get("enabled", True):
            await asyncio.sleep(60)
            continue

        interval_s = module_config.get("interval_minutes", 15) * 60
        started_at = datetime.now(timezone.utc)
        t0 = time.monotonic()

        try:
            events = await detect_fn()
            duration_s = time.monotonic() - t0

            if events:
                await db.save_change_events_batch(events)

            await db.save_cron_run(
                module=module,
                events_detected=len(events),
                status="success",
                started_at=started_at,
                duration_s=duration_s,
            )
            logger.info(
                f"Cron {module}: {len(events)} events detected in {duration_s:.1f}s"
            )
        except Exception as exc:
            duration_s = time.monotonic() - t0
            error_detail = f"{type(exc).__name__}: {exc}"
            await db.save_cron_run(
                module=module,
                events_detected=0,
                status="error",
                error_detail=error_detail,
                started_at=started_at,
                duration_s=duration_s,
            )
            logger.error(f"Cron {module} failed: {error_detail}")

        await asyncio.sleep(interval_s)


async def start_scheduler() -> None:
    """Launch background detection loops for all modules."""
    for module, detect_fn in _DETECT_FNS.items():
        config_key = _CONFIG_KEYS[module]
        task = asyncio.create_task(
            _run_detection_loop(module, config_key, detect_fn),
            name=f"cron_{module}",
        )
        _tasks.append(task)
        logger.info(f"Scheduled cron loop: {module}")


async def stop_scheduler() -> None:
    """Cancel all running detection loops."""
    for task in _tasks:
        task.cancel()
    for task in _tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    _tasks.clear()
    logger.info("Cron scheduler stopped")


async def trigger_detection(module: str) -> dict:
    """Manually trigger detection for a single module. Returns summary."""
    detect_fn = _DETECT_FNS.get(module)
    if not detect_fn:
        valid = ", ".join(_DETECT_FNS.keys())
        raise ValueError(
            f"Unknown module '{module}' — valid modules: {valid}"
        )

    started_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    try:
        events = await detect_fn()
        duration_s = time.monotonic() - t0

        if events:
            await db.save_change_events_batch(events)

        await db.save_cron_run(
            module=module,
            events_detected=len(events),
            status="success",
            started_at=started_at,
            duration_s=duration_s,
        )

        return {
            "module": module,
            "events_detected": len(events),
            "duration_s": round(duration_s, 2),
            "status": "success",
        }
    except Exception as exc:
        duration_s = time.monotonic() - t0
        error_detail = f"{type(exc).__name__}: {exc}"
        await db.save_cron_run(
            module=module,
            events_detected=0,
            status="error",
            error_detail=error_detail,
            started_at=started_at,
            duration_s=duration_s,
        )
        return {
            "module": module,
            "events_detected": 0,
            "duration_s": round(duration_s, 2),
            "status": "error",
            "error": error_detail,
        }
