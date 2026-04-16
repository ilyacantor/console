"""Console backend — FastAPI application."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.app import config, db
from backend.app.routes.changes import router as changes_router
from backend.app.routes.config import router as config_router
from backend.app.routes.engagements import router as engagements_router
from backend.app.routes.health import router as health_router
from backend.app.routes.identity import router as identity_router
from backend.app.routes.instrumentation import router as instrumentation_router
from backend.app.routes.mcp import router as mcp_router
from backend.app.routes.narrative import router as narrative_router
from backend.app.routes.operator_feed import router as operator_feed_router
from backend.app.routes.pipeline import router as pipeline_router
from backend.app.routes.proxy import router as proxy_router
from backend.app.services import cron_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("console")

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Console starting up")
    try:
        await db.init_pool()
        await cron_scheduler.start_scheduler()
    except Exception as exc:
        logger.warning(f"Database initialization failed — running without DB: {exc}")

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
app.include_router(instrumentation_router, prefix="/api/instrumentation", tags=["Instrumentation"])
app.include_router(narrative_router, prefix="/api/narrative", tags=["Narrative"])
app.include_router(operator_feed_router, prefix="/api/operator-feed", tags=["Operator Feed"])
app.include_router(identity_router, prefix="/api/auth", tags=["Identity"])
app.include_router(mcp_router, prefix="/api/mcp", tags=["MCP"])


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
