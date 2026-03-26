"""Config routes — read and update console_config entries."""

import logging

from fastapi import APIRouter

from backend.app import db

logger = logging.getLogger("console.config")

router = APIRouter()


@router.get("")
async def get_all_config():
    """Return all console_config entries as a structured object."""
    config = await db.get_all_config()
    return {"config": config}


@router.put("")
async def update_config(body: dict):
    """Partial update of console_config entries."""
    for key, value in body.items():
        await db.set_config(key, value)
    config = await db.get_all_config()
    return {"status": "ok", "config": config}


@router.get("/cron-last-runs")
async def get_cron_last_runs():
    """Return last successful cron run timestamp per module."""
    last_runs = await db.get_last_cron_runs()
    return {"last_runs": last_runs}


@router.get("/{key}")
async def get_config_key(key: str):
    """Get a single config value by key."""
    value = await db.get_config(key)
    if value is None:
        return {"key": key, "value": None}
    return {"key": key, "value": value}


@router.put("/{key}")
async def update_config_key(key: str, body: dict):
    """Update a single config value."""
    value = body.get("value", body)
    await db.set_config(key, value)
    return {"status": "ok", "key": key, "value": value}
