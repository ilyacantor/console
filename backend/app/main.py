"""Console backend — FastAPI application."""

import asyncio
import logging
import socket
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.app import config, db
from backend.app.routes.changes import router as changes_router
from backend.app.routes.config import router as config_router
from backend.app.routes.engagements import router as engagements_router
from backend.app.routes.health import router as health_router
from backend.app.routes.instrumentation import router as instrumentation_router
from backend.app.routes.narrative import router as narrative_router
from backend.app.routes.operator_feed import router as operator_feed_router
from backend.app.routes.pipeline import router as pipeline_router
from backend.app.routes.proxy import router as proxy_router
from backend.app.routes.upload import router as upload_router
from backend.app.services import cron_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("console")

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"

# Boot-time validation: every required env var must be set. Console is the
# central hub — a missing module URL would silently route every health
# check, proxy request, and pipeline kickoff to a bogus host. Refuse to
# boot rather than ship a half-wired Console to Render.
_missing_module_urls = [name for name, value in config.REQUIRED_MODULE_URLS.items() if not value]
if _missing_module_urls:
    raise RuntimeError(
        f"Console cannot start — required env vars are unset: {', '.join(_missing_module_urls)}. "
        f"Console proxies to every AOS module; missing URLs would silently break health checks, "
        f"the proxy router, and pipeline orchestration."
    )

if not config.CORS_ORIGINS:
    raise RuntimeError(
        "Console cannot start — CORS_ORIGINS env var is unset. Set it to a comma-separated "
        "list of allowed frontend origins (e.g. https://console.example.com)."
    )


# Probe targets: every downstream service Console talks to. Health path
# matches the same convention used by health_aggregator.py.
_PROBE_TARGETS: list[tuple[str, str, str]] = [
    ("AOD", config.AOD_BASE_URL, "/health"),
    ("AAM", config.AAM_BASE_URL, "/health"),
    ("DCL", config.DCL_BASE_URL, "/api/health"),
    ("NLQ", config.NLQ_BASE_URL, "/api/v1/health"),
    ("Farm", config.FARM_BASE_URL, "/health"),
    ("Platform", config.PLATFORM_BASE_URL, "/health"),
    ("Convergence", config.CONVERGENCE_BASE_URL, "/api/health"),
]


async def _probe_one(client: httpx.AsyncClient, name: str, base_url: str, health_path: str) -> str | None:
    """Probe a single downstream — DNS resolve + GET /health. Returns error string or None."""
    try:
        parsed = urlparse(base_url)
        host = parsed.hostname
        if not host:
            return f"{name}: cannot parse hostname from {base_url}"
        try:
            await asyncio.get_running_loop().run_in_executor(None, socket.gethostbyname, host)
        except socket.gaierror as exc:
            return f"{name}: DNS resolution failed for {host}: {exc}"
        try:
            resp = await client.get(f"{base_url}{health_path}")
        except httpx.ConnectError as exc:
            return f"{name}: connection refused at {base_url}{health_path}: {exc}"
        except httpx.TimeoutException:
            return f"{name}: timeout reaching {base_url}{health_path} after 2s"
        if resp.status_code != 200:
            return f"{name}: HTTP {resp.status_code} from {base_url}{health_path}"
        return None
    except Exception as exc:
        return f"{name}: unexpected error probing {base_url}: {type(exc).__name__}: {exc}"


async def _probe_downstreams() -> None:
    """Boot-time validation of every downstream Console depends on.

    Converts a runtime bug (Console boots, proxy/orchestration requests fail
    with cryptic errors) into a deploy-time bug (Render marks the deploy
    failed before flipping traffic). Any unreachable downstream → refuse
    to boot.
    """
    async with httpx.AsyncClient(timeout=2.0) as client:
        results = await asyncio.gather(
            *[_probe_one(client, name, url, path) for name, url, path in _PROBE_TARGETS]
        )
    failures = [r for r in results if r]
    if failures:
        raise RuntimeError(
            "Console cannot start — downstream probes failed:\n  " + "\n  ".join(failures)
        )
    logger.info("Console downstream probes succeeded for %d services", len(_PROBE_TARGETS))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Console starting up")
    await _probe_downstreams()
    await db.init_pool()
    await cron_scheduler.start_scheduler()

    yield

    await cron_scheduler.stop_scheduler()
    await db.close_pool()
    logger.info("Console shut down")


app = FastAPI(
    title="AOS Console",
    description="Single production surface for all AOS user types",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(pipeline_router, prefix="/api/pipeline", tags=["Pipeline"])
app.include_router(proxy_router, prefix="/api/proxy", tags=["Proxy"])
app.include_router(engagements_router, prefix="/api/engagements", tags=["Engagements"])
app.include_router(changes_router, prefix="/api/changes", tags=["Changes"])
app.include_router(config_router, prefix="/api/config", tags=["Config"])
app.include_router(upload_router, prefix="/api/upload", tags=["Upload"])
app.include_router(instrumentation_router, prefix="/api/instrumentation", tags=["Instrumentation"])
app.include_router(narrative_router, prefix="/api/narrative", tags=["Narrative"])
app.include_router(operator_feed_router, prefix="/api/operator-feed", tags=["Operator Feed"])


@app.get("/health")
async def root_health():
    """Lightweight health check for Render."""
    return {"status": "ok", "service": "console"}


# Serve frontend static files if built
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}")
    async def serve_spa(request: Request, path: str):
        """Serve the SPA — return index.html for all non-API routes."""
        # Don't serve SPA for API routes
        if path.startswith("api/"):
            return JSONResponse(
                status_code=404,
                content={"detail": f"API endpoint /{path} not found"},
            )

        # Try to serve a static file first
        static_path = STATIC_DIR / path
        if static_path.exists() and static_path.is_file():
            return FileResponse(static_path)

        # Fall back to index.html for SPA routing
        index = STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(index)

        return JSONResponse(
            status_code=404,
            content={"detail": "Frontend not built. Run 'npm run build' in frontend/"},
        )
