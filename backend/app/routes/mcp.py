"""Console MCP Server — surface_mcp endpoint for Mai v8.

Mirrors the DCL MCP server pattern (`MCPToolCall(tool, arguments, api_key)` ->
`MCPToolResult(tool, success, result, error)`) over POST /api/mcp/tools/call.

Tools exposed:
- get_surface_state: returns the current Console surface snapshot — route,
  active engagement, visible panels, active selection, last errors. The
  snapshot is maintained per session_id via POST /api/mcp/surface-state.

Per Mai v8 blueprint §5.2 every surface MCP server must expose
`get_surface_state`. Additional Console-specific tools can be added to
`_handle_tool_call` as the surface grows.

Storage is `console.surface_state_snapshots` (Postgres). Survives pm2
restart so an idle operator does not lose Mai's page-state context.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.app import db

router = APIRouter()
logger = logging.getLogger("console.mcp")

_VALID_API_KEYS = {
    os.environ.get("CONSOLE_MCP_API_KEY") or os.environ.get("MCP_API_KEY") or "console-mcp-key-v1",
    "console-mcp-test-key",
}

# Snapshots older than this are reaped on the next read. Sessions that don't
# return inside the window are gone — the frontend will push fresh on the next
# navigation. Avoids unbounded growth across abandoned tabs.
_TTL_HOURS = 24


class MCPToolCall(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    api_key: str | None = None


class MCPToolResult(BaseModel):
    tool: str
    success: bool
    result: Any = None
    error: str | None = None


class SurfaceStateUpdate(BaseModel):
    session_id: str
    tenant_id: str | None = None
    route: str | None = None
    active_engagement_id: str | None = None
    visible_panels: list[str] = Field(default_factory=list)
    active_selection: dict[str, Any] | None = None
    last_errors: list[str] = Field(default_factory=list)
    extra: dict[str, Any] | None = None


def _validate_api_key(api_key: str | None) -> bool:
    return api_key is not None and api_key in _VALID_API_KEYS


def _hash_payload(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def _store_snapshot(
    session_id: str,
    tenant_id: str | None,
    route: str | None,
    payload: dict[str, Any],
) -> None:
    """Upsert snapshot. Hash-skips when payload is identical to existing row,
    so updated_at remains a real freshness signal (idle heartbeats from the
    frontend cost zero writes)."""
    pool = db.get_pool()
    if pool is None:
        # Fail loud — silent fallback would let Mai's page-state path silently
        # degrade. Per blueprint §A1 / §12, surface failure to the caller.
        raise RuntimeError(
            "surface-state push: Console DB pool unavailable — "
            "snapshot cannot be persisted."
        )
    payload_hash = _hash_payload(payload)
    async with pool.acquire() as conn:
        existing_hash = await conn.fetchval(
            """
            SELECT payload_hash FROM console.surface_state_snapshots
            WHERE session_id = $1
            """,
            session_id,
        )
        if existing_hash == payload_hash:
            return
        await conn.execute(
            """
            INSERT INTO console.surface_state_snapshots
                (session_id, tenant_id, route, payload, payload_hash, updated_at)
            VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
            ON CONFLICT (session_id) DO UPDATE
                SET tenant_id    = EXCLUDED.tenant_id,
                    route        = EXCLUDED.route,
                    payload      = EXCLUDED.payload,
                    payload_hash = EXCLUDED.payload_hash,
                    updated_at   = NOW()
            """,
            session_id,
            tenant_id,
            route,
            json.dumps(payload, default=str),
            payload_hash,
        )


async def _load_snapshot(session_id: str) -> dict[str, Any] | None:
    """Read the snapshot for session_id. Sweeps stale rows opportunistically."""
    pool = db.get_pool()
    if pool is None:
        raise RuntimeError(
            "get_surface_state: Console DB pool unavailable — "
            "snapshot cannot be read."
        )
    async with pool.acquire() as conn:
        await conn.execute(
            f"""
            DELETE FROM console.surface_state_snapshots
            WHERE updated_at < NOW() - INTERVAL '{_TTL_HOURS} hours'
            """
        )
        row = await conn.fetchrow(
            """
            SELECT payload FROM console.surface_state_snapshots
            WHERE session_id = $1
            """,
            session_id,
        )
    if row is None:
        return None
    payload = row["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    return payload


@router.get("/info")
async def mcp_info() -> dict[str, Any]:
    """Return Console MCP server metadata — name, version, exposed tools."""
    return {
        "name": "console-mcp-server",
        "version": "1.0.0",
        "surface_id": "console",
        "tools": [
            {
                "name": "get_surface_state",
                "description": (
                    "Read the current Console surface snapshot — route, "
                    "active engagement, visible panels, active selection, "
                    "last errors. Used by Mai to see what the operator is "
                    "looking at before responding."
                ),
                "parameters": {
                    "session_id": {
                        "type": "string",
                        "description": "Chat session id from the canonical envelope.",
                    },
                },
            },
        ],
    }


@router.post("/tools/call", response_model=MCPToolResult)
async def mcp_tool_call(call: MCPToolCall) -> MCPToolResult:
    """Dispatch an MCP tool call against the Console surface."""
    if not _validate_api_key(call.api_key):
        return MCPToolResult(
            tool=call.tool,
            success=False,
            error="Authentication required. Provide a valid api_key.",
        )
    try:
        return await _handle_tool_call(call)
    except Exception as exc:  # noqa: BLE001 — surface failure in the result
        return MCPToolResult(
            tool=call.tool,
            success=False,
            error=f"{type(exc).__name__}: {exc}",
        )


@router.post("/surface-state")
async def update_surface_state(update: SurfaceStateUpdate) -> dict[str, str]:
    """Frontend pushes the latest surface snapshot here on route/selection changes
    or via the 60s idle heartbeat in useSurfaceState. Persisted in
    console.surface_state_snapshots so Mai's get_surface_state tool returns the
    same data after a console-backend pm2 restart."""
    snapshot: dict[str, Any] = {
        "session_id": update.session_id,
        "route": update.route,
        "active_engagement_id": update.active_engagement_id,
        "visible_panels": update.visible_panels,
        "active_selection": update.active_selection,
        "last_errors": update.last_errors,
    }
    if update.extra:
        snapshot["extra"] = update.extra
    await _store_snapshot(
        session_id=update.session_id,
        tenant_id=update.tenant_id,
        route=update.route,
        payload=snapshot,
    )
    return {"status": "ok", "session_id": update.session_id}


async def _handle_tool_call(call: MCPToolCall) -> MCPToolResult:
    if call.tool == "get_surface_state":
        session_id = call.arguments.get("session_id")
        if not session_id:
            return MCPToolResult(
                tool=call.tool,
                success=False,
                error="get_surface_state: missing required 'session_id'.",
            )
        snapshot = await _load_snapshot(session_id)
        if snapshot is None:
            return MCPToolResult(
                tool=call.tool,
                success=True,
                result={
                    "session_id": session_id,
                    "surface_id": "console",
                    "note": (
                        "No snapshot pushed yet for this session. The frontend "
                        "will POST /api/mcp/surface-state as the operator navigates."
                    ),
                },
            )
        return MCPToolResult(tool=call.tool, success=True, result=snapshot)

    return MCPToolResult(
        tool=call.tool,
        success=False,
        error=f"Unknown tool: {call.tool}",
    )
