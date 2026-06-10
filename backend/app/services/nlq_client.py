"""HTTP client for NLQ post-pipeline verification.

Console calls NLQ to confirm data landed in the query/dashboard surfaces
before marking the SE pipeline complete. No silent fallbacks — every call
raises on connection failure or non-200 response with a message naming the
URL and HTTP status.
"""

import httpx

from backend.app import config

_TIMEOUT = 10.0
# The Ask probe is a data-visibility check, not a latency SLA — under suite
# load NLQ resolves against a fat dev DCL and can exceed 10s. NLQ's own perf
# suites own its latency ceilings.
_QUERY_TIMEOUT = 60.0


async def pipeline_status(client: httpx.AsyncClient) -> dict:
    url = f"{config.NLQ_BASE_URL}/api/v1/pipeline/status"
    resp = await client.get(url, timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


async def schema(client: httpx.AsyncClient) -> dict:
    url = f"{config.NLQ_BASE_URL}/api/v1/schema"
    resp = await client.get(url, timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


async def query(
    client: httpx.AsyncClient,
    question: str,
    entity_id: str | None = None,
) -> dict:
    """Ask a question against NLQ.

    entity_id is passed as a structured field so the question text stays
    generic (F1: no hardcoded entity names in application code).
    """
    url = f"{config.NLQ_BASE_URL}/api/v1/query"
    payload: dict = {"question": question}
    if entity_id:
        payload["entity_id"] = entity_id
    resp = await client.post(
        url,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=_QUERY_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()
