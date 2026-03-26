"""Console configuration — reads environment variables at module level."""

import os

# Database
SUPABASE_DB_URL: str = os.environ.get("SUPABASE_DB_URL", "")

# Module URLs — local defaults for development
AOD_BASE_URL: str = os.environ.get("AOD_BASE_URL", "http://localhost:8001").rstrip("/")
AAM_BASE_URL: str = os.environ.get("AAM_BASE_URL", "http://localhost:8002").rstrip("/")
FARM_BASE_URL: str = os.environ.get("FARM_BASE_URL", "http://localhost:8003").rstrip("/")
DCL_BASE_URL: str = os.environ.get("DCL_BASE_URL", "http://localhost:8004").rstrip("/")
NLQ_BASE_URL: str = os.environ.get("NLQ_BASE_URL", "http://localhost:8005").rstrip("/")
PLATFORM_BASE_URL: str = os.environ.get("PLATFORM_BASE_URL", "http://localhost:8006").rstrip("/")

# Tenant
AOS_DEV_TENANT_ID: str = os.environ.get("AOS_DEV_TENANT_ID", "")

# CORS
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3009").split(",")
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
