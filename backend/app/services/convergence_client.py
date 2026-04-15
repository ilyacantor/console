"""
HTTP client for Convergence engagement API.

After the engagement-move, all engagement state lives in Convergence.
Console reads/writes engagement data via these functions.

All functions raise on error — no silent fallbacks.
"""

import os

import httpx

CONVERGENCE_BASE_URL = os.environ.get("CONVERGENCE_BASE_URL", "http://localhost:8010").rstrip("/")

_TIMEOUT = 10.0


async def create_engagement(acquirer_entity_id: str, target_entity_id: str,
                            engagement_type: str = "MA", tenant_id: str | None = None) -> dict:
    tid = tenant_id or os.environ.get("AOS_TENANT_ID")
    if not tid:
        raise RuntimeError("No tenant_id and AOS_TENANT_ID not set")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            f"{CONVERGENCE_BASE_URL}/api/convergence/engagements",
            json={
                "tenant_id": tid,
                "acquirer_entity_id": acquirer_entity_id,
                "target_entity_id": target_entity_id,
                "engagement_type": engagement_type,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def get_engagement(engagement_id: str) -> dict | None:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{CONVERGENCE_BASE_URL}/api/convergence/engagements/{engagement_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


async def list_engagements(
    tenant_id: str | None = None,
    lifecycle_stage: str | None = None,
) -> list[dict]:
    tid = tenant_id or os.environ.get("AOS_TENANT_ID")
    if not tid:
        raise RuntimeError("No tenant_id and AOS_TENANT_ID not set")
    params: dict[str, str] = {"tenant_id": tid}
    if lifecycle_stage:
        params["lifecycle_stage"] = lifecycle_stage
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{CONVERGENCE_BASE_URL}/api/convergence/engagements",
            params=params,
        )
        resp.raise_for_status()
        return resp.json()


async def update_engagement(engagement_id: str, lifecycle_stage: str | None = None,
                            state: dict | None = None) -> dict | None:
    body: dict = {}
    if lifecycle_stage:
        body["lifecycle_stage"] = lifecycle_stage
    if state is not None:
        body["state"] = state
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.patch(
            f"{CONVERGENCE_BASE_URL}/api/convergence/engagements/{engagement_id}",
            json=body,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


async def get_engagement_history(engagement_id: str, limit: int = 50) -> list[dict]:
    """Engagement history — reads from Convergence run ledger."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{CONVERGENCE_BASE_URL}/api/convergence/engagements/{engagement_id}/runs",
        )
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        runs = resp.json()
        return runs[:limit] if isinstance(runs, list) else []


async def get_conflicts(engagement_id: str) -> list[dict]:
    """COFA conflicts — reads from Convergence merge conflicts."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{CONVERGENCE_BASE_URL}/api/convergence/merge/conflicts",
            params={"engagement_id": engagement_id},
        )
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
        return data.get("conflicts", data) if isinstance(data, dict) else data


async def get_active_engagement(tenant_id: str) -> dict | None:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{CONVERGENCE_BASE_URL}/api/convergence/engagements/active",
            params={"tenant_id": tenant_id},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


async def get_merge_overview(
    acquirer_id: str | None = None,
    target_id: str | None = None,
) -> dict:
    params: dict[str, str] = {}
    if acquirer_id:
        params["acquirer_id"] = acquirer_id
    if target_id:
        params["target_id"] = target_id
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{CONVERGENCE_BASE_URL}/api/convergence/merge/overview",
            params=params,
        )
        resp.raise_for_status()
        return resp.json()


async def get_pnl_income_statement(
    tenant_id: str | None = None,
    pipeline_run_id: str | None = None,
    period: str | None = None,
) -> dict:
    params: dict[str, str] = {}
    if tenant_id:
        params["tenant_id"] = tenant_id
    if pipeline_run_id:
        params["pipeline_run_id"] = pipeline_run_id
    if period:
        params["period"] = period
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{CONVERGENCE_BASE_URL}/api/convergence/reports/v2/combining/income-statement",
            params=params,
        )
        resp.raise_for_status()
        return resp.json()


async def get_qoe_combined(
    tenant_id: str | None = None,
    pipeline_run_id: str | None = None,
) -> dict:
    params: dict[str, str] = {}
    if tenant_id:
        params["tenant_id"] = tenant_id
    if pipeline_run_id:
        params["pipeline_run_id"] = pipeline_run_id
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{CONVERGENCE_BASE_URL}/api/convergence/reports/v2/qoe/combined",
            params=params,
        )
        resp.raise_for_status()
        return resp.json()
