"""Proxy routes — forward requests to AOS modules to avoid CORS issues."""

import logging
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from backend.app import config

logger = logging.getLogger("console.proxy")

router = APIRouter()

# Paths that must be proxied as SSE streams. Regular _proxy reads the full
# body before returning — for chat we need to forward chunks as they arrive.
_SSE_STREAM_PATHS: set[tuple[str, str]] = {
    ("platform", "api/mai/chat"),
}

MODULE_URLS = {
    "aod": config.AOD_BASE_URL,
    "aam": config.AAM_BASE_URL,
    "dcl": config.DCL_BASE_URL,
    "nlq": config.NLQ_BASE_URL,
    "farm": config.FARM_BASE_URL,
    "platform": config.PLATFORM_BASE_URL,
}

PROXY_TIMEOUT = 30.0


@router.get("/{module}/{path:path}")
async def proxy_get(module: str, path: str, request: Request) -> Response:
    """Forward a GET request to the specified AOS module."""
    return await _proxy(module, path, "GET", request)


@router.post("/{module}/{path:path}")
async def proxy_post(module: str, path: str, request: Request) -> Response:
    """Forward a POST request to the specified AOS module."""
    if (module, path) in _SSE_STREAM_PATHS:
        return await _proxy_sse(module, path, request)
    return await _proxy(module, path, "POST", request)


async def _proxy_sse(module: str, path: str, request: Request) -> Response:
    """Forward a POST as an SSE stream — used for Mai canonical /chat.

    httpx.stream() yields chunks as they arrive from Platform; we reemit
    them to the browser via StreamingResponse so the tool-use loop can
    deliver content/tool_use/tool_result/done events incrementally.
    """
    base_url = MODULE_URLS.get(module)
    if not base_url:
        return JSONResponse(
            status_code=400,
            content={"error": f"Unknown module '{module}'"},
        )

    target_url = f"{base_url}/{path}"
    body = await request.body()

    async def forward() -> AsyncGenerator[bytes, None]:
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    target_url,
                    content=body,
                    headers={
                        "Content-Type": request.headers.get(
                            "content-type", "application/json"
                        ),
                        "Accept": "text/event-stream",
                    },
                ) as resp:
                    if resp.status_code >= 400:
                        detail = (await resp.aread()).decode(errors="replace")
                        yield (
                            f'data: {{"type":"error","error":"Platform {target_url} '
                            f'returned {resp.status_code}: {detail}"}}\n\n'
                        ).encode()
                        return
                    async for chunk in resp.aiter_raw():
                        yield chunk
        except httpx.HTTPError as exc:
            logger.error("SSE proxy failed: %s %s — %s", "POST", target_url, exc)
            yield (
                f'data: {{"type":"error","error":"Cannot reach {target_url} — {exc}"}}\n\n'
            ).encode()

    return StreamingResponse(
        forward(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
