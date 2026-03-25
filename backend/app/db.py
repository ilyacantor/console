"""Console database layer — asyncpg pool with schema setup."""

import json
import logging
from datetime import datetime, timezone
from typing import Any

import asyncpg

from backend.app import config

logger = logging.getLogger("console.db")

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    """Create the asyncpg connection pool and ensure schema exists."""
    global _pool

    dsn = config.SUPABASE_DB_URL
    if not dsn:
        logger.warning(
            "SUPABASE_DB_URL not set — database features disabled. "
            "Pipeline runs will not persist."
        )
        return

    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=1,
        max_size=5,
        command_timeout=30,
    )
    await _ensure_schema()
    await _seed_config()
    logger.info("Database pool initialized, schema verified")


async def close_pool() -> None:
    """Close the connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")


def get_pool() -> asyncpg.Pool | None:
    return _pool


async def _ensure_schema() -> None:
    """Create console schema and tables if they don't exist."""
    if not _pool:
        return

    async with _pool.acquire() as conn:
        await conn.execute("CREATE SCHEMA IF NOT EXISTS console")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.pipeline_runs (
                run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                mode VARCHAR(10) NOT NULL,
                entity_ids TEXT[] NOT NULL,
                steps JSONB NOT NULL,
                total_duration_s FLOAT,
                total_triples INTEGER,
                status VARCHAR(20) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.console_config (
                key VARCHAR(200) PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)


async def _seed_config() -> None:
    """Seed default config values if not already present."""
    if not _pool:
        return

    defaults = {
        "baselines": config.DEFAULT_BASELINES,
        "module_urls": config.DEFAULT_MODULE_URLS,
    }
    async with _pool.acquire() as conn:
        for key, value in defaults.items():
            await conn.execute(
                """
                INSERT INTO console.console_config (key, value, updated_at)
                VALUES ($1, $2::jsonb, NOW())
                ON CONFLICT (key) DO NOTHING
                """,
                key,
                json.dumps(value),
            )


async def save_run(
    run_id: str,
    mode: str,
    entity_ids: list[str],
    steps: list[dict],
    total_duration_s: float,
    total_triples: int,
    status: str,
) -> None:
    """Store a pipeline run result."""
    if not _pool:
        logger.error(
            "Cannot save pipeline run — database not available. "
            f"run_id={run_id}, mode={mode}, status={status}"
        )
        return

    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO console.pipeline_runs
                (run_id, mode, entity_ids, steps, total_duration_s, total_triples, status)
            VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7)
            """,
            run_id,
            mode,
            entity_ids,
            json.dumps(steps),
            total_duration_s,
            total_triples,
            status,
        )


async def get_runs(limit: int = 20) -> list[dict[str, Any]]:
    """Fetch recent pipeline runs."""
    if not _pool:
        return []

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT run_id, mode, entity_ids, steps, total_duration_s,
                   total_triples, status, created_at
            FROM console.pipeline_runs
            ORDER BY created_at DESC
            LIMIT $1
            """,
            limit,
        )
        return [
            {
                "run_id": str(r["run_id"]),
                "mode": r["mode"],
                "entity_ids": r["entity_ids"],
                "steps": json.loads(r["steps"]),
                "total_duration_s": r["total_duration_s"],
                "total_triples": r["total_triples"],
                "status": r["status"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


async def get_run(run_id: str) -> dict[str, Any] | None:
    """Fetch a single pipeline run by ID."""
    if not _pool:
        return None

    async with _pool.acquire() as conn:
        r = await conn.fetchrow(
            """
            SELECT run_id, mode, entity_ids, steps, total_duration_s,
                   total_triples, status, created_at
            FROM console.pipeline_runs
            WHERE run_id = $1::uuid
            """,
            run_id,
        )
        if not r:
            return None
        return {
            "run_id": str(r["run_id"]),
            "mode": r["mode"],
            "entity_ids": r["entity_ids"],
            "steps": json.loads(r["steps"]),
            "total_duration_s": r["total_duration_s"],
            "total_triples": r["total_triples"],
            "status": r["status"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }


async def get_config(key: str) -> Any | None:
    """Get a config value by key."""
    if not _pool:
        return None

    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT value FROM console.console_config WHERE key = $1",
            key,
        )
        if row:
            return json.loads(row["value"])
        return None


async def set_config(key: str, value: Any) -> None:
    """Set a config value (upsert)."""
    if not _pool:
        logger.error(f"Cannot save config — database not available. key={key}")
        return

    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO console.console_config (key, value, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value, updated_at = NOW()
            """,
            key,
            json.dumps(value),
        )
