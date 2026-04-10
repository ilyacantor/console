"""Console configuration — reads environment variables at module level."""

import os

from dotenv import load_dotenv

load_dotenv()

# Database
SUPABASE_DB_URL: str = os.environ.get("SUPABASE_DB_URL", "")

# Module URLs — required env vars, no dev-host fallbacks. Console is the
# central hub and points at every AOS service; a missing env var would
# silently route every health check, proxy request, and pipeline kickoff
# to a bogus host. main.py raises at boot if any of these is unset.
AOD_BASE_URL: str = os.environ.get("AOD_BASE_URL", "").rstrip("/")
AAM_BASE_URL: str = os.environ.get("AAM_BASE_URL", "").rstrip("/")
FARM_BASE_URL: str = os.environ.get("FARM_BASE_URL", "").rstrip("/")
DCL_BASE_URL: str = os.environ.get("DCL_BASE_URL", "").rstrip("/")
NLQ_BASE_URL: str = os.environ.get("NLQ_BASE_URL", "").rstrip("/")
PLATFORM_BASE_URL: str = os.environ.get("PLATFORM_BASE_URL", "").rstrip("/")
CONVERGENCE_BASE_URL: str = os.environ.get("CONVERGENCE_BASE_URL", "").rstrip("/")

REQUIRED_MODULE_URLS: dict[str, str] = {
    "AOD_BASE_URL": AOD_BASE_URL,
    "AAM_BASE_URL": AAM_BASE_URL,
    "FARM_BASE_URL": FARM_BASE_URL,
    "DCL_BASE_URL": DCL_BASE_URL,
    "NLQ_BASE_URL": NLQ_BASE_URL,
    "PLATFORM_BASE_URL": PLATFORM_BASE_URL,
    "CONVERGENCE_BASE_URL": CONVERGENCE_BASE_URL,
}

# Tenant
AOS_TENANT_ID: str = os.environ.get("AOS_TENANT_ID") or os.environ.get("AOS_DEV_TENANT_ID", "")

# Seed entities — from .env, not hardcoded in application code (F1 guard)
SEED_ACQUIRER_ENTITY: str = os.environ.get("SEED_ACQUIRER_ENTITY", "")
SEED_TARGET_ENTITY: str = os.environ.get("SEED_TARGET_ENTITY", "")
SEED_SECONDARY_TARGET: str = os.environ.get("SEED_SECONDARY_TARGET", "")

# CORS — required env var, no dev-host fallback. main.py raises at boot
# if this is unset (same pattern as the module URLs above).
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "").split(",")
    if o.strip()
]

# Default baselines (seconds) for pipeline steps
DEFAULT_BASELINES = {
    "farm_gen": 2,
    "dcl_verify": 2,
    "cofa_unification": 80,
    "total_se": 6,
    "total_me": 86,
}

# Default module URLs for console_config seeding
DEFAULT_MODULE_URLS = {
    "aod": "https://aodv3-1.onrender.com",
    "aam": "https://aos-aam.onrender.com",
    "dcl": "https://aos-dclv2.onrender.com",
    "nlq": "https://aos-nlq.onrender.com",
    "farm": "https://farmv2.onrender.com",
}
