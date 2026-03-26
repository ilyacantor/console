"""Narrative routes — demo narrative editor backend."""

import logging

from fastapi import APIRouter

from backend.app import db

logger = logging.getLogger("console.narrative")

router = APIRouter()

CONFIG_KEY = "demo_narrative"


@router.get("")
async def get_narrative():
    """Return current demo narrative."""
    narrative = await db.get_config(CONFIG_KEY)
    if narrative is None:
        return {"narrative": {"steps": []}}
    return {"narrative": narrative}


@router.put("")
async def update_narrative(body: dict):
    """Save updated demo narrative."""
    await db.set_config(CONFIG_KEY, body)
    return {"status": "ok", "narrative": body}
