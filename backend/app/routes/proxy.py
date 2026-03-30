"""Proxy routes — forward requests to AOS modules to avoid CORS issues."""

import logging

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from backend.app import config

logger = logging.getLogger("console.proxy")

router = APIRouter()

MODULE_URLS = {
    "aod": config.AOD_BASE_URL,
    "aam": config.AAM_BASE_URL,
    "dcl": config.DCL_BASE_URL,
    "nlq": config.NLQ_BASE_URL,
    "farm": config.FARM_BASE_URL,
    "platform": config.PLATFORM_BASE_URL,
    "convergence": config.CONVERGENCE_BASE_URL,
}

PROXY_TIMEOUT = 30.0


@router.get("/{module}/{path:path}")
async def proxy_get(module: str, path: str, request: Request) -> Response:
    """Forward a GET request to the specified AOS module."""
    return await _proxy(module, path, "GET", request)


@router.post("/{module}/{path:path}")
async def proxy_post(module: str, path: str, request: Request) -> Response:
    """Forward a POST request to the specified AOS module."""
    return await _proxy(module, path, "POST", request)


async def _proxy(module: str, path: str, method: str, request: Request) -> Response:
    base_url = MODULE_URLS.get(module)
    if not base_url:
        return JSONResponse(
            status_code=400,
            content={
                "error": f"Unknown module '{module}'",
                "available_modules": list(MODULE_URLS.keys()),
            },
        )

    target_url = f"{base_url}/{path}"
    params = dict(request.query_params)

    try:
        async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
            if method == "GET":
                resp = await client.get(target_url, params=params)
            else:
                body = await request.body()
                resp = await client.post(
                    target_url,
                    params=params,
                    content=body,
                    headers={"Content-Type": request.headers.get("content-type", "application/json")},
                )

        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type"),
        )
    except httpx.ConnectError:
        logger.error(f"Proxy connection refused: {method} {target_url}")
        return JSONResponse(
            status_code=502,
            content={
                "error": f"Connection refused to {module} at {target_url}",
                "module": module,
                "target_url": target_url,
            },
        )
    except httpx.TimeoutException:
        logger.error(f"Proxy timeout: {method} {target_url} after {PROXY_TIMEOUT}s")
        return JSONResponse(
            status_code=504,
            content={
                "error": f"Timeout reaching {module} at {target_url} after {PROXY_TIMEOUT}s",
                "module": module,
                "target_url": target_url,
            },
        )
