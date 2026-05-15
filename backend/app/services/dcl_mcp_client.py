"""Console-side MCP client to DCL — speaks the MCP wire protocol over HTTP+SSE.

DCL exposes its real MCP server on port 8004 at:
  GET  /api/mcp/sse           — open SSE stream (Authorization: Bearer <token>)
  POST /api/mcp/messages/     — JSONRPC messages, addressed by session_id

We use the `mcp` SDK's HTTP+SSE client to wrap the wire protocol — same path
Mai (Platform) uses, but issued from Console as the MCP client. Token format
is the v1 HMAC-SHA256 shim documented in `dcl/backend/api/mcp_auth.py`; the
token secret is `DCL_MCP_TOKEN_SECRET` shared with DCL via env.

Exposed tools used:
  - query_triples  — value retrieval for the consumer drill-through
  - provenance     — source chain for any triple value

The client mints a fresh tenant-scoped token per call. v2 (Platform-side token
mint endpoint) is deferred per dcl_deferred_work.md #18.

No silent fallbacks: every failure raises ConsoleMCPClientError with the
endpoint URL, tool name, and the underlying cause. The caller is responsible
for surfacing that to the operator.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from typing import Any

import httpx
from mcp import ClientSession
from mcp.client.sse import sse_client

from backend.app import config

logger = logging.getLogger("console.dcl_mcp")


class ConsoleMCPClientError(RuntimeError):
    """Raised on any MCP-client failure (connection, auth, tool error)."""


_DEFAULT_TTL_SECONDS = 24 * 60 * 60


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _mint_token(tenant_id: str, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> str:
    """Mint a v1 MCP token using the shared HMAC secret.

    Matches the format DCL's verify_token() accepts. The shared secret is
    `DCL_MCP_TOKEN_SECRET` — both Console and DCL must read it from the same
    env. If the secret is unset, raise loudly per A1.
    """
    secret = os.environ.get("DCL_MCP_TOKEN_SECRET")
    if not secret:
        raise ConsoleMCPClientError(
            "DCL_MCP_TOKEN_SECRET is not set in Console env. "
            "Console MCP client cannot mint a tenant token without the "
            "shared secret. Set DCL_MCP_TOKEN_SECRET to match DCL's value."
        )
    if not tenant_id:
        raise ConsoleMCPClientError(
            "Console MCP client refuses to mint anonymous token (I2: identity required)."
        )
    payload = {
        "tenant_id": tenant_id,
        "exp": int(time.time()) + int(ttl_seconds),
        "scope": ["query_triples", "list_domains", "concept_lookup", "semantic_export", "provenance"],
        "nonce": secrets.token_hex(4),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return f"{_b64url_encode(payload_bytes)}.{sig}"


def _sse_url() -> str:
    """The DCL MCP SSE endpoint URL."""
    return f"{config.DCL_BASE_URL}/api/mcp/sse"


async def call_tool(tool: str, arguments: dict[str, Any], tenant_id: str, *,
                    timeout: float = 12.0) -> dict[str, Any]:
    """Open an MCP SSE session to DCL, call `tool` with `arguments`, return result.

    Each call opens a fresh session and closes it. Sessions are cheap because
    SSE keeps the stream warm; we don't pool them because the Console-side
    callers are short-lived FastAPI request handlers.

    Returns the parsed result content. Raises ConsoleMCPClientError on any
    failure — connection refused, auth rejected, tool error.
    """
    if not tenant_id:
        raise ConsoleMCPClientError(
            "call_tool: tenant_id is required (I2 — no silent fallback on missing identity)."
        )
    token = _mint_token(tenant_id)
    url = _sse_url()
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with asyncio.timeout(timeout):
            async with sse_client(url, headers=headers) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    result = await session.call_tool(name=tool, arguments=arguments)
    except asyncio.TimeoutError as exc:
        raise ConsoleMCPClientError(
            f"DCL MCP call timed out after {timeout:.1f}s — tool={tool} url={url}"
        ) from exc
    except httpx.ConnectError as exc:
        raise ConsoleMCPClientError(
            f"DCL MCP connection refused at {url} (tool={tool}) — DCL unreachable: {exc}"
        ) from exc
    except Exception as exc:
        raise ConsoleMCPClientError(
            f"DCL MCP call failed — tool={tool} url={url} — {type(exc).__name__}: {exc}"
        ) from exc

    # MCP returns CallToolResult with .content (list of TextContent / ImageContent / EmbeddedResource).
    # Tool responses from DCL are JSON-encoded text blocks per backend/engine/mcp_tools.py.
    if getattr(result, "isError", False):
        # Extract error message from content
        msgs = [c.text for c in (result.content or []) if hasattr(c, "text")]
        detail = "; ".join(msgs) or "unknown tool error"
        raise ConsoleMCPClientError(
            f"DCL MCP tool reported error — tool={tool} url={url} — {detail}"
        )
    blocks = [c for c in (result.content or []) if hasattr(c, "text")]
    if not blocks:
        raise ConsoleMCPClientError(
            f"DCL MCP tool returned no text content — tool={tool} url={url}"
        )
    raw = blocks[0].text
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ConsoleMCPClientError(
            f"DCL MCP tool returned non-JSON content — tool={tool} url={url} — {exc}"
        ) from exc


async def query_triples(tenant_id: str, *,
                        domain: str | None = None,
                        concept: str | None = None,
                        entity_id: str | None = None,
                        period: str | None = None,
                        limit: int = 100,
                        active_only: bool = True) -> dict[str, Any]:
    """Run the MCP `query_triples` tool. tenant_id is enforced server-side
    by the token; we still pass it explicitly so callers see the identity
    in the call site (I2).

    DCL requires at least one of `domain` or `concept`. The caller chooses
    which based on the consumer view's intent.
    """
    if not (domain or concept):
        raise ConsoleMCPClientError(
            "query_triples: at least one of 'domain' or 'concept' is required."
        )
    args: dict[str, Any] = {"limit": limit, "active_only": active_only}
    if domain:
        args["domain"] = domain
    if concept:
        args["concept"] = concept
    if entity_id:
        args["entity_id"] = entity_id
    if period:
        args["period"] = period
    return await call_tool("query_triples", args, tenant_id=tenant_id)


async def list_domains(tenant_id: str) -> dict[str, Any]:
    """Run the MCP `list_domains` tool — returns the domains the tenant can see."""
    return await call_tool("list_domains", {}, tenant_id=tenant_id)


async def provenance(*, tenant_id: str,
                     triple_id: str | None = None,
                     concept: str | None = None,
                     entity_id: str | None = None,
                     period: str | None = None) -> dict[str, Any]:
    """Run the MCP `provenance` tool.

    DCL's provenance tool accepts either a specific triple_id, or
    (concept, entity_id[, period]) to look up the latest matching triples'
    sources. Either path returns source_system, source_field, pipe_id,
    confidence_score per source row.
    """
    args: dict[str, Any] = {}
    if triple_id:
        args["triple_id"] = triple_id
    if concept:
        args["concept"] = concept
    if entity_id:
        args["entity_id"] = entity_id
    if period:
        args["period"] = period
    if not args:
        raise ConsoleMCPClientError(
            "provenance: must specify either triple_id or concept/entity_id."
        )
    return await call_tool("provenance", args, tenant_id=tenant_id)
