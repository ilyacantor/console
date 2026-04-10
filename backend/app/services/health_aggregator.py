"""Health aggregation — parallel checks across all AOS modules."""

import asyncio
import logging
import os
import time
from dataclasses import asdict, dataclass

import httpx

from backend.app import config

logger = logging.getLogger("console.health")

SERVICES = [
    ("AOD", config.AOD_BASE_URL, "/health"),
    ("AAM", config.AAM_BASE_URL, "/health"),
    ("DCL", config.DCL_BASE_URL, "/api/health"),
    ("NLQ", config.NLQ_BASE_URL, "/api/v1/health"),
    ("Farm", config.FARM_BASE_URL, "/health"),
    ("Convergence", config.CONVERGENCE_BASE_URL, "/api/health"),
]

# Standalone "open in new tab" URLs per service. In production on Render
# every service's frontend and backend share a host, so the base URL IS
# the standalone UI URL. A prior version of this dict rewrote backend
# dev ports to frontend dev ports for local development, which (a) broke
# in prod and (b) hardcoded dev-host literals. If you need separate
# frontend URLs in dev, set them explicitly via STANDALONE_<NAME>_URL
# env vars below.
STANDALONE_URLS = {
    "AOD": os.environ.get("STANDALONE_AOD_URL", config.AOD_BASE_URL),
    "AAM": os.environ.get("STANDALONE_AAM_URL", config.AAM_BASE_URL),
    "DCL": os.environ.get("STANDALONE_DCL_URL", config.DCL_BASE_URL),
    "NLQ": os.environ.get("STANDALONE_NLQ_URL", config.NLQ_BASE_URL),
    "Farm": os.environ.get("STANDALONE_FARM_URL", config.FARM_BASE_URL),
    "Convergence": os.environ.get("STANDALONE_CONVERGENCE_URL", config.CONVERGENCE_BASE_URL),
}


@dataclass
class ServiceStatus:
    name: str
    url: str
    status: str  # up, degraded, down
    response_time_s: float | None
    detail: str | None = None
    standalone_url: str | None = None


async def _check_one(
    client: httpx.AsyncClient, name: str, base_url: str, health_path: str
) -> ServiceStatus:
    """Check a single service's health endpoint."""
    url = f"{base_url}{health_path}"
    standalone = STANDALONE_URLS.get(name, base_url)
    t0 = time.monotonic()

    try:
        resp = await client.get(url)
        elapsed = round(time.monotonic() - t0, 2)

        if resp.status_code == 200:
            # For DCL: HTTP 200 is not enough — inspect functional readiness fields.
            # DCL always returns 200 even in degraded/warming state with no graph.
            if name == "DCL":
                body: dict = {}
                try:
                    body = resp.json()
                except Exception:
                    pass
                phase = body.get("phase", "ready")
                graph_ready = body.get("graph_ready", True)
                pg_ok = body.get("postgres_available", True)
                error = body.get("error")
                if phase not in ("ready", "degraded") or not graph_ready or not pg_ok:
                    return ServiceStatus(
                        name=name,
                        url=url,
                        status="degraded",
                        response_time_s=elapsed,
                        detail=error or f"phase={phase}, graph_ready={graph_ready}, postgres={pg_ok}",
                        standalone_url=standalone,
                    )
            return ServiceStatus(
                name=name,
                url=url,
                status="up",
                response_time_s=elapsed,
                standalone_url=standalone,
            )
        else:
            return ServiceStatus(
                name=name,
                url=url,
                status="degraded",
                response_time_s=elapsed,
                detail=f"HTTP {resp.status_code}",
                standalone_url=standalone,
            )
    except httpx.ConnectError:
        elapsed = round(time.monotonic() - t0, 2)
        return ServiceStatus(
            name=name,
            url=url,
            status="down",
            response_time_s=elapsed,
            detail=f"Connection refused at {url}",
            standalone_url=standalone,
        )
    except httpx.TimeoutException:
        return ServiceStatus(
            name=name,
            url=url,
            status="down",
            response_time_s=10.0,
            detail=f"Timeout after 10s reaching {url}",
            standalone_url=standalone,
        )
    except Exception as exc:
        elapsed = round(time.monotonic() - t0, 2)
        return ServiceStatus(
            name=name,
            url=url,
            status="down",
            response_time_s=elapsed,
            detail=f"{type(exc).__name__}: {exc}",
            standalone_url=standalone,
        )


async def check_all(timeout: float = 10.0) -> dict:
    """Check all module health endpoints in parallel."""
    async with httpx.AsyncClient(timeout=timeout) as client:
        tasks = [
            _check_one(client, name, base_url, health_path)
            for name, base_url, health_path in SERVICES
        ]
        results = await asyncio.gather(*tasks)

    # Console is always up if this endpoint responds
    console_status = ServiceStatus(
        name="Console",
        url="/api/health",
        status="up",
        response_time_s=0.0,
        standalone_url=None,
    )
    all_services = list(results) + [console_status]

    up_count = sum(1 for s in all_services if s.status == "up")
    total = len(all_services)

    if up_count == total:
        overall = "healthy"
    elif up_count == 0:
        overall = "unhealthy"
    else:
        overall = "degraded"

    return {
        "services": [asdict(s) for s in all_services],
        "overall": overall,
        "up_count": up_count,
        "total": total,
    }
