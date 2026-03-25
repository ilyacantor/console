"""Health endpoints — aggregated module health checks."""

from fastapi import APIRouter

from backend.app.services import health_aggregator

router = APIRouter()


@router.get("/health")
async def aggregated_health():
    """Check health of all AOS modules in parallel."""
    return await health_aggregator.check_all()
