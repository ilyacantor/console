"""Operator Feed routes — proxy to Platform's mai plans API."""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from backend.app import config

logger = logging.getLogger("console.operator_feed")

router = APIRouter()

PROXY_TIMEOUT = 30.0

VALID_STATUSES = frozenset({
    "pending", "approved", "rejected", "executing", "executed", "failed",
})


@router.get("/plans")
async def get_plans(
    tenant_id: str = Query(..., description="Tenant UUID to scope plans"),
    status: str | None = Query(default=None, description="Filter by plan status"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """Proxy to Platform's GET /api/mai/plans.

    Console calls this to populate the Operator Feed with Tier 3/4
    escalation records from the mai_plans table.
    """
    if status and status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: '{status}'. Must be one of: {sorted(VALID_STATUSES)}",
        )

    platform_url = f"{config.PLATFORM_BASE_URL}/api/mai/plans"
    params: dict[str, str] = {
        "tenant_id": tenant_id,
        "limit": str(limit),
        "offset": str(offset),
    }
    if status:
        params["status"] = status

    try:
        async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
            resp = await client.get(platform_url, params=params)
    except httpx.ConnectError:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Connection refused to Platform at {platform_url} "
                f"— is Platform running on port {config.PLATFORM_BASE_URL.split(':')[-1]}?"
            ),
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"Timeout reaching Platform at {platform_url} after {PROXY_TIMEOUT}s",
        )

    if resp.status_code != 200:
        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            detail = resp.json()
        else:
            detail = {"error": resp.text}
        return JSONResponse(status_code=resp.status_code, content=detail)

    return resp.json()
