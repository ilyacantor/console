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
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

_VALID_API_KEYS = {
    os.environ.get("CONSOLE_MCP_API_KEY") or os.environ.get("MCP_API_KEY") or "console-mcp-key-v1",
    "console-mcp-test-key",
}

# In-memory surface state store. Key = session_id; value = latest snapshot
# the frontend pushed via POST /api/mcp/surface-state. Single-process dev
# deployment only — when Console moves to multi-worker we will promote this
# to Redis / the shared DB.
_SURFACE_STATE: dict[str, dict[str, Any]] = {}


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
    route: str | None = None
    active_engagement_id: str | None = None
    visible_panels: list[str] = Field(default_factory=list)
    active_selection: dict[str, Any] | None = None
    last_errors: list[str] = Field(default_factory=list)
    extra: dict[str, Any] | None = None


def _validate_api_key(api_key: str | None) -> bool:
    return api_key is not None and api_key in _VALID_API_KEYS


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
        return _handle_tool_call(call)
    except Exception as exc:  # noqa: BLE001 — surface failure in the result
        return MCPToolResult(
            tool=call.tool,
            success=False,
            error=f"{type(exc).__name__}: {exc}",
        )


@router.post("/surface-state")
async def update_surface_state(update: SurfaceStateUpdate) -> dict[str, str]:
    """Frontend pushes the latest surface snapshot here on route/selection changes.

    The snapshot is stored per session_id and returned verbatim by
    get_surface_state when Mai calls the MCP tool.
    """
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
    _SURFACE_STATE[update.session_id] = snapshot
    return {"status": "ok", "session_id": update.session_id}


def _handle_tool_call(call: MCPToolCall) -> MCPToolResult:
    if call.tool == "get_surface_state":
        session_id = call.arguments.get("session_id")
        if not session_id:
            return MCPToolResult(
                tool=call.tool,
                success=False,
                error="get_surface_state: missing required 'session_id'.",
            )
        snapshot = _SURFACE_STATE.get(session_id)
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
