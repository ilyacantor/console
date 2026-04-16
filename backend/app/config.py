"""Console configuration — reads environment variables at module level."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("console.config")

# Database
SUPABASE_DB_URL: str = os.environ.get("SUPABASE_DB_URL", "")

# Module URLs — local defaults for development
AOD_BASE_URL: str = os.environ.get("AOD_BASE_URL", "http://localhost:8001").rstrip("/")
AAM_BASE_URL: str = os.environ.get("AAM_BASE_URL", "http://localhost:8002").rstrip("/")
FARM_BASE_URL: str = os.environ.get("FARM_BASE_URL", "http://localhost:8003").rstrip("/")
DCL_BASE_URL: str = os.environ.get("DCL_BASE_URL", "http://localhost:8004").rstrip("/")
NLQ_BASE_URL: str = os.environ.get("NLQ_BASE_URL", "http://localhost:8005").rstrip("/")
PLATFORM_BASE_URL: str = os.environ.get("PLATFORM_BASE_URL", "http://localhost:8006").rstrip("/")
CONVERGENCE_BASE_URL: str = os.environ.get("CONVERGENCE_BASE_URL", "http://localhost:8010").rstrip("/")

# Tenant
AOS_TENANT_ID: str = os.environ.get("AOS_TENANT_ID") or os.environ.get("AOS_DEV_TENANT_ID", "")

# Operator — single-operator dev mode until real SSO wires the identity surface.
AOS_OPERATOR_ID: str = os.environ.get("AOS_OPERATOR_ID", "dev-operator")

# Seed entities — from .env, not hardcoded in application code (F1 guard)
SEED_ACQUIRER_ENTITY: str = os.environ.get("SEED_ACQUIRER_ENTITY", "")
SEED_TARGET_ENTITY: str = os.environ.get("SEED_TARGET_ENTITY", "")
SEED_SECONDARY_TARGET: str = os.environ.get("SEED_SECONDARY_TARGET", "")

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


# ---------------------------------------------------------------------------
# Mai v8 Observability as Code (§8.0)
#
# Configuration lives in `console/config/mai_observability.yaml`. Loaded at
# import time so callers can read `MAI_OBSERVABILITY` / `MAI_OBSERVABILITY_SLOS`
# / `MAI_OBSERVABILITY_SURFACES` without an async hop. Missing or malformed
# file raises loudly — per §A1 no silent fallback.
# ---------------------------------------------------------------------------

MAI_OBSERVABILITY_PATH: Path = Path(__file__).resolve().parents[2] / "config" / "mai_observability.yaml"


def load_mai_observability(path: Path = MAI_OBSERVABILITY_PATH) -> dict[str, Any]:
    """Load and validate the Mai observability YAML. Raises on missing file,
    parse error, or missing required sections."""
    if not path.exists():
        raise FileNotFoundError(
            f"Mai observability config not found at {path}. "
            f"Create it per §8.0 before starting Console."
        )
    try:
        raw = yaml.safe_load(path.read_text())
    except yaml.YAMLError as exc:
        raise RuntimeError(f"Failed to parse {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise RuntimeError(f"{path} must contain a mapping at the top level.")
    for required in ("version", "slos", "surfaces"):
        if required not in raw:
            raise RuntimeError(
                f"{path} missing required key '{required}'. "
                f"Per §8.0 this config is non-optional."
            )
    logger.info(
        "Mai observability loaded — version=%s surfaces=%s",
        raw.get("version"), sorted(raw.get("surfaces", {}).keys()),
    )
    return raw


MAI_OBSERVABILITY: dict[str, Any] = load_mai_observability()
MAI_OBSERVABILITY_SLOS: dict[str, Any] = MAI_OBSERVABILITY.get("slos", {})
MAI_OBSERVABILITY_SURFACES: dict[str, Any] = MAI_OBSERVABILITY.get("surfaces", {})
