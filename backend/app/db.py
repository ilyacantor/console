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


def is_connected() -> bool:
    """Return True if the database pool is initialized and available."""
    return _pool is not None



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
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.engagements (
                engagement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                acquirer_entity_id VARCHAR(100) NOT NULL,
                target_entity_id VARCHAR(100) NOT NULL,
                tenant_id VARCHAR(100),
                engagement_type VARCHAR(10) NOT NULL,
                lifecycle_stage VARCHAR(20) DEFAULT 'upload',
                state_json JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        # Migrations: add columns that may be missing from older schema versions
        await conn.execute("""
            ALTER TABLE console.engagements
            ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100)
        """)
        await conn.execute("""
            ALTER TABLE console.engagements
            ADD COLUMN IF NOT EXISTS acquirer_entity_id VARCHAR(100)
        """)
        await conn.execute("""
            ALTER TABLE console.engagements
            ADD COLUMN IF NOT EXISTS target_entity_id VARCHAR(100)
        """)
        # Backfill acquirer/target from legacy entity_ids array if present
        try:
            await conn.execute("""
                UPDATE console.engagements
                SET acquirer_entity_id = entity_ids[1],
                    target_entity_id = entity_ids[2]
                WHERE acquirer_entity_id IS NULL
                  AND entity_ids IS NOT NULL
                  AND array_length(entity_ids, 1) >= 2
            """)
        except Exception:
            pass  # entity_ids column may not exist in newer schema
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.change_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                source_module VARCHAR(10) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                entity_id VARCHAR(100),
                summary TEXT NOT NULL,
                detail TEXT,
                severity VARCHAR(10) NOT NULL,
                payload JSONB DEFAULT '{}',
                acknowledged BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_change_events_timestamp
            ON console.change_events(timestamp DESC)
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_change_events_severity
            ON console.change_events(severity)
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.cron_runs (
                run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                module VARCHAR(10) NOT NULL,
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMPTZ,
                duration_s FLOAT,
                events_detected INTEGER DEFAULT 0,
                status VARCHAR(20) NOT NULL,
                error_detail TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.maestra_runs (
                run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                engagement_id UUID,
                step_name VARCHAR(100) NOT NULL,
                run_tag VARCHAR(100),
                model_version VARCHAR(50),
                constitution_version VARCHAR(50),
                duration_s FLOAT,
                tokens_in INTEGER,
                tokens_out INTEGER,
                cost_usd FLOAT,
                status VARCHAR(20) NOT NULL,
                error_detail TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.conflicts (
                id VARCHAR(20) PRIMARY KEY,
                engagement_id UUID NOT NULL,
                name VARCHAR(200) NOT NULL,
                impact_dollars BIGINT NOT NULL,
                impact_label VARCHAR(20) NOT NULL,
                severity VARCHAR(10) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                treatment VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_conflicts_engagement
            ON console.conflicts(engagement_id)
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.uploads (
                upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                engagement_id UUID,
                entity_id VARCHAR(100) NOT NULL,
                file_name VARCHAR(500) NOT NULL,
                file_type VARCHAR(10) NOT NULL,
                file_size INTEGER,
                file_content BYTEA,
                parse_result JSONB,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.pipeline_jobs (
                job_id VARCHAR(20) PRIMARY KEY,
                pipeline_mode VARCHAR(10) NOT NULL,
                execution_mode VARCHAR(10) NOT NULL,
                status VARCHAR(30) NOT NULL,
                started_at TIMESTAMPTZ NOT NULL,
                completed_at TIMESTAMPTZ,
                steps JSONB NOT NULL,
                current_step INTEGER DEFAULT 0,
                total_steps INTEGER NOT NULL,
                message TEXT,
                config JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS console.recon_history (
                id SERIAL PRIMARY KEY,
                job_id TEXT NOT NULL,
                pipeline_mode TEXT NOT NULL,
                entity_id TEXT,
                run_id TEXT,
                provenance_tag TEXT,
                overall TEXT NOT NULL,
                checks JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)


async def _seed_config() -> None:
    """Seed default config values if not already present."""
    if not _pool:
        return

    defaults = {
        "baselines": config.DEFAULT_BASELINES,
        "module_urls": config.DEFAULT_MODULE_URLS,
        "cron_schedules": {
            "aod_discovery": {"interval_minutes": 360, "enabled": True},
            "aam_drift": {"interval_minutes": 15, "enabled": True},
            "dcl_coverage": {"interval_minutes": 15, "enabled": True},
            "health_check": {"interval_minutes": 5, "enabled": True},
        },
        "detection_thresholds": {
            "coverage_drop_critical": 10,
            "coverage_drop_warning": 5,
            "confidence_shift_warning": 0.10,
            "source_stale_hours": 48,
        },
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

    await _seed_engagements()
    await _seed_conflicts()
    await _seed_change_events()
    await _seed_maestra_runs()
    await _seed_narrative()


async def _seed_engagements() -> None:
    """Seed a default M&A engagement for Meridian + Cascadia."""
    if not _pool:
        return

    demo_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    state = {
        "conflicts_resolved": 3,
        "conflicts_total": 6,
        "deliverables_ready": 6,
        "total_cost": 14.20,
        "total_runs": 9,
        "total_tokens": 47000,
    }
    demo_id_2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901"
    state_2 = {
        "conflicts_resolved": 0,
        "conflicts_total": 0,
        "deliverables_ready": 0,
        "total_cost": 0,
        "total_runs": 0,
        "total_tokens": 0,
    }

    tenant_id = config.AOS_TENANT_ID or None

    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO console.engagements
                (engagement_id, acquirer_entity_id, target_entity_id,
                 tenant_id, engagement_type, lifecycle_stage, state_json)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)
            ON CONFLICT (engagement_id) DO UPDATE
                SET tenant_id = COALESCE(console.engagements.tenant_id, EXCLUDED.tenant_id)
            """,
            demo_id,
            "meridian",
            "cascadia",
            tenant_id,
            "MA",
            "review",
            json.dumps(state),
        )
        await conn.execute(
            """
            INSERT INTO console.engagements
                (engagement_id, acquirer_entity_id, target_entity_id,
                 tenant_id, engagement_type, lifecycle_stage, state_json)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)
            ON CONFLICT (engagement_id) DO UPDATE
                SET tenant_id = COALESCE(console.engagements.tenant_id, EXCLUDED.tenant_id)
            """,
            demo_id_2,
            "meridian",
            "techflow",
            tenant_id,
            "MA",
            "upload",
            json.dumps(state_2),
        )


async def _seed_conflicts() -> None:
    """Seed COFA conflicts for the demo Meridian + Cascadia engagement."""
    if not _pool:
        return

    demo_eng_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    conflicts = [
        ("COFA-001", "Revenue gross/net recognition", 340_000_000, "$340M", "high", "pending", None),
        ("COFA-002", "Benefits loading (COGS vs OpEx)", 89_000_000, "$89M", "medium", "pending", None),
        ("COFA-004", "Recruiting capitalization", 12_000_000, "$12M", "medium", "pending", None),
        ("COFA-003", "S&M bundling", 28_000_000, "$28M", "low", "resolved", "Acq. treatment"),
        ("COFA-005", "Automation capitalization", 8_000_000, "$8M", "low", "resolved", "Keep both"),
        ("COFA-006", "Depreciation method", 4_000_000, "$4M", "low", "resolved", "Post-close"),
    ]

    async with _pool.acquire() as conn:
        for c in conflicts:
            await conn.execute(
                """
                INSERT INTO console.conflicts
                    (id, engagement_id, name, impact_dollars,
                     impact_label, severity, status, treatment)
                VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
                """,
                c[0], demo_eng_id, c[1], c[2], c[3], c[4], c[5], c[6],
            )


async def _seed_change_events() -> None:
    """Seed representative change events if table is empty."""
    if not _pool:
        return

    async with _pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM console.change_events")
        if count > 0:
            return

    from backend.app.services.seed_events import SEED_EVENTS
    await save_change_events_batch(SEED_EVENTS)


# --- Pipeline runs ---


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


# --- Engagements ---


async def create_engagement(
    acquirer_entity_id: str,
    target_entity_id: str,
    engagement_type: str = "MA",
) -> str:
    """Create a new engagement. Returns engagement_id."""
    if not _pool:
        logger.error("Cannot create engagement — database not available")
        return ""

    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO console.engagements
                (acquirer_entity_id, target_entity_id, engagement_type,
                 lifecycle_stage, state_json)
            VALUES ($1, $2, $3, 'upload', '{}')
            RETURNING engagement_id
            """,
            acquirer_entity_id,
            target_entity_id,
            engagement_type,
        )
        return str(row["engagement_id"]) if row else ""


async def get_engagements() -> list[dict[str, Any]]:
    """Fetch all engagements."""
    if not _pool:
        return []

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT engagement_id, acquirer_entity_id, target_entity_id,
                   tenant_id, engagement_type, lifecycle_stage,
                   state_json, created_at, updated_at
            FROM console.engagements
            ORDER BY created_at DESC
            """
        )
        return [_engagement_row_to_dict(r) for r in rows]


async def get_engagement(engagement_id: str) -> dict[str, Any] | None:
    """Fetch a single engagement by ID."""
    if not _pool:
        return None

    async with _pool.acquire() as conn:
        r = await conn.fetchrow(
            """
            SELECT engagement_id, acquirer_entity_id, target_entity_id,
                   tenant_id, engagement_type, lifecycle_stage,
                   state_json, created_at, updated_at
            FROM console.engagements
            WHERE engagement_id = $1::uuid
            """,
            engagement_id,
        )
        if not r:
            return None
        return _engagement_row_to_dict(r)


async def update_engagement(
    engagement_id: str,
    lifecycle_stage: str | None = None,
    state_json: dict | None = None,
) -> None:
    """Update engagement fields."""
    if not _pool:
        logger.error(f"Cannot update engagement — database not available. id={engagement_id}")
        return

    async with _pool.acquire() as conn:
        if lifecycle_stage is not None:
            await conn.execute(
                """
                UPDATE console.engagements
                SET lifecycle_stage = $2, updated_at = NOW()
                WHERE engagement_id = $1::uuid
                """,
                engagement_id,
                lifecycle_stage,
            )
        if state_json is not None:
            await conn.execute(
                """
                UPDATE console.engagements
                SET state_json = $2::jsonb, updated_at = NOW()
                WHERE engagement_id = $1::uuid
                """,
                engagement_id,
                json.dumps(state_json),
            )


def _engagement_row_to_dict(r: Any) -> dict[str, Any]:
    return {
        "engagement_id": str(r["engagement_id"]),
        "acquirer_entity_id": r["acquirer_entity_id"],
        "target_entity_id": r["target_entity_id"],
        "tenant_id": r["tenant_id"],
        "engagement_type": r["engagement_type"],
        "lifecycle_stage": r["lifecycle_stage"],
        "state_json": json.loads(r["state_json"]) if isinstance(r["state_json"], str) else r["state_json"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
    }


async def get_conflicts(engagement_id: str) -> list[dict[str, Any]]:
    """Get COFA conflicts for an engagement."""
    if not _pool:
        return []

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, engagement_id, name, impact_dollars, impact_label,
                   severity, status, treatment, created_at
            FROM console.conflicts
            WHERE engagement_id = $1::uuid
            ORDER BY id
            """,
            engagement_id,
        )
        return [
            {
                "id": r["id"],
                "engagement_id": str(r["engagement_id"]),
                "name": r["name"],
                "impact_dollars": r["impact_dollars"],
                "impact_label": r["impact_label"],
                "severity": r["severity"],
                "status": r["status"],
                "treatment": r["treatment"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


async def get_engagement_history(engagement_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """Get chronological history from cron_runs, pipeline_runs, and maestra_runs."""
    if not _pool:
        return []

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            (
                SELECT created_at AS ts, 'pipeline' AS source,
                       'Pipeline run: ' || mode || ' — ' || status AS description
                FROM console.pipeline_runs
                WHERE $1::uuid = ANY(
                    SELECT e.engagement_id FROM console.engagements e
                    WHERE e.engagement_id = $1::uuid
                )
                ORDER BY created_at DESC LIMIT $2
            )
            UNION ALL
            (
                SELECT created_at AS ts, 'maestra' AS source,
                       step_name || ' — ' || status AS description
                FROM console.maestra_runs
                WHERE engagement_id = $1::uuid
                ORDER BY created_at DESC LIMIT $2
            )
            UNION ALL
            (
                SELECT created_at AS ts, 'cron' AS source,
                       module || ' detection — ' || status
                           || CASE WHEN events_detected > 0
                              THEN ' (' || events_detected || ' events)'
                              ELSE '' END AS description
                FROM console.cron_runs
                ORDER BY created_at DESC LIMIT $2
            )
            ORDER BY ts DESC LIMIT $2
            """,
            engagement_id,
            limit,
        )
        return [
            {
                "timestamp": r["ts"].isoformat() if r["ts"] else None,
                "source": r["source"],
                "description": r["description"],
            }
            for r in rows
        ]


# --- Change events ---


async def save_change_event(
    source_module: str,
    event_type: str,
    summary: str,
    severity: str,
    timestamp: datetime | None = None,
    entity_id: str | None = None,
    detail: str | None = None,
    payload: dict | None = None,
) -> str:
    """Save a single change event. Returns the event ID."""
    if not _pool:
        logger.error(f"Cannot save change event — database not available. module={source_module}")
        return ""

    ts = timestamp or datetime.now(timezone.utc)
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO console.change_events
                (timestamp, source_module, event_type, entity_id, summary, detail, severity, payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
            RETURNING id
            """,
            ts,
            source_module,
            event_type,
            entity_id,
            summary,
            detail,
            severity,
            json.dumps(payload or {}),
        )
        return str(row["id"]) if row else ""


async def save_change_events_batch(events: list[dict]) -> int:
    """Save multiple change events. Returns count saved."""
    if not _pool:
        return 0

    count = 0
    async with _pool.acquire() as conn:
        for e in events:
            ts = e.get("timestamp", datetime.now(timezone.utc))
            await conn.execute(
                """
                INSERT INTO console.change_events
                    (timestamp, source_module, event_type, entity_id,
                     summary, detail, severity, payload)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
                """,
                ts,
                e["source_module"],
                e["event_type"],
                e.get("entity_id"),
                e["summary"],
                e.get("detail"),
                e["severity"],
                json.dumps(e.get("payload", {})),
            )
            count += 1
    return count


async def get_change_events(
    since: datetime | None = None,
    severity: str | None = None,
    module: str | None = None,
    acknowledged: bool | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Query change events with optional filters."""
    if not _pool:
        return []

    conditions = []
    params: list[Any] = []
    idx = 1

    if since:
        conditions.append(f"timestamp >= ${idx}")
        params.append(since)
        idx += 1
    if severity:
        conditions.append(f"severity = ${idx}")
        params.append(severity)
        idx += 1
    if module:
        conditions.append(f"source_module = ${idx}")
        params.append(module)
        idx += 1
    if acknowledged is not None:
        conditions.append(f"acknowledged = ${idx}")
        params.append(acknowledged)
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT id, timestamp, source_module, event_type, entity_id,
                   summary, detail, severity, payload, acknowledged, created_at
            FROM console.change_events
            {where}
            ORDER BY timestamp DESC
            LIMIT ${idx}
            """,
            *params,
        )
        return [_change_event_to_dict(r) for r in rows]


async def acknowledge_event(event_id: str) -> bool:
    """Set acknowledged=true for a change event. Returns success."""
    if not _pool:
        return False

    async with _pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE console.change_events
            SET acknowledged = TRUE
            WHERE id = $1::uuid
            """,
            event_id,
        )
        return result == "UPDATE 1"


async def get_change_summary() -> dict[str, Any]:
    """Get counts by severity and last scan time."""
    if not _pool:
        return {"critical": 0, "warning": 0, "info": 0, "last_scan": None}

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT severity, COUNT(*) as cnt
            FROM console.change_events
            WHERE acknowledged = FALSE
            GROUP BY severity
            """
        )
        counts = {r["severity"]: r["cnt"] for r in rows}

        last_scan = await conn.fetchval(
            """
            SELECT MAX(completed_at) FROM console.cron_runs
            WHERE status = 'success'
            """
        )

    return {
        "critical": counts.get("critical", 0),
        "warning": counts.get("warning", 0),
        "info": counts.get("info", 0),
        "last_scan": last_scan.isoformat() if last_scan else None,
    }


def _change_event_to_dict(r: Any) -> dict[str, Any]:
    payload = r["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    return {
        "id": str(r["id"]),
        "timestamp": r["timestamp"].isoformat() if r["timestamp"] else None,
        "source_module": r["source_module"],
        "event_type": r["event_type"],
        "entity_id": r["entity_id"],
        "summary": r["summary"],
        "detail": r["detail"],
        "severity": r["severity"],
        "payload": payload,
        "acknowledged": r["acknowledged"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
    }


# --- Cron runs ---


async def save_cron_run(
    module: str,
    events_detected: int,
    status: str,
    error_detail: str | None = None,
    started_at: datetime | None = None,
    duration_s: float | None = None,
) -> str:
    """Log a cron run. Returns run_id."""
    if not _pool:
        return ""

    now = datetime.now(timezone.utc)
    start = started_at or now
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO console.cron_runs
                (module, started_at, completed_at, duration_s, events_detected, status, error_detail)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING run_id
            """,
            module,
            start,
            now,
            duration_s,
            events_detected,
            status,
            error_detail,
        )
        return str(row["run_id"]) if row else ""


async def get_last_cron_runs() -> dict[str, str | None]:
    """Get the most recent completed_at timestamp per cron module."""
    if not _pool:
        return {}

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (module) module, completed_at
            FROM console.cron_runs
            WHERE status = 'success'
            ORDER BY module, completed_at DESC
            """
        )
        return {
            r["module"]: r["completed_at"].isoformat() if r["completed_at"] else None
            for r in rows
        }


# --- Uploads ---


async def save_upload(
    entity_id: str,
    file_name: str,
    file_type: str,
    file_size: int,
    engagement_id: str | None = None,
    file_content: bytes | None = None,
) -> str:
    """Create an upload record. Returns upload_id."""
    if not _pool:
        logger.error("Cannot save upload — database not available")
        return ""

    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO console.uploads
                (engagement_id, entity_id, file_name, file_type, file_size, file_content, status)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, 'parsing')
            RETURNING upload_id
            """,
            engagement_id,
            entity_id,
            file_name,
            file_type,
            file_size,
            file_content,
        )
        return str(row["upload_id"]) if row else ""


async def get_upload(upload_id: str) -> dict[str, Any] | None:
    """Fetch a single upload by ID."""
    if not _pool:
        return None

    async with _pool.acquire() as conn:
        r = await conn.fetchrow(
            """
            SELECT upload_id, engagement_id, entity_id, file_name, file_type,
                   file_size, parse_result, status, created_at
            FROM console.uploads
            WHERE upload_id = $1::uuid
            """,
            upload_id,
        )
        if not r:
            return None
        parse_result = r["parse_result"]
        if isinstance(parse_result, str):
            parse_result = json.loads(parse_result)
        return {
            "upload_id": str(r["upload_id"]),
            "engagement_id": str(r["engagement_id"]) if r["engagement_id"] else None,
            "entity_id": r["entity_id"],
            "file_name": r["file_name"],
            "file_type": r["file_type"],
            "file_size": r["file_size"],
            "parse_result": parse_result,
            "status": r["status"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }


async def update_upload(upload_id: str, status: str, parse_result: dict | None = None) -> None:
    """Update upload status and optionally parse_result."""
    if not _pool:
        return

    async with _pool.acquire() as conn:
        if parse_result is not None:
            await conn.execute(
                """
                UPDATE console.uploads
                SET status = $2, parse_result = $3::jsonb
                WHERE upload_id = $1::uuid
                """,
                upload_id,
                status,
                json.dumps(parse_result),
            )
        else:
            await conn.execute(
                """
                UPDATE console.uploads SET status = $2 WHERE upload_id = $1::uuid
                """,
                upload_id,
                status,
            )


# --- Maestra runs ---


async def get_maestra_runs(
    engagement_id: str | None = None,
    step_name: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Query maestra runs with optional filters."""
    if not _pool:
        return []

    conditions = []
    params: list[Any] = []
    idx = 1

    if engagement_id:
        conditions.append(f"engagement_id = ${idx}::uuid")
        params.append(engagement_id)
        idx += 1
    if step_name:
        conditions.append(f"step_name = ${idx}")
        params.append(step_name)
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT run_id, engagement_id, step_name, run_tag, model_version,
                   constitution_version, duration_s, tokens_in, tokens_out,
                   cost_usd, status, error_detail, created_at
            FROM console.maestra_runs
            {where}
            ORDER BY created_at DESC
            LIMIT ${idx}
            """,
            *params,
        )
        return [
            {
                "run_id": str(r["run_id"]),
                "engagement_id": str(r["engagement_id"]) if r["engagement_id"] else None,
                "step_name": r["step_name"],
                "run_tag": r["run_tag"],
                "model_version": r["model_version"],
                "constitution_version": r["constitution_version"],
                "duration_s": r["duration_s"],
                "tokens_in": r["tokens_in"],
                "tokens_out": r["tokens_out"],
                "cost_usd": r["cost_usd"],
                "status": r["status"],
                "error_detail": r["error_detail"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


async def get_maestra_summary(engagement_id: str | None = None) -> dict[str, Any]:
    """Aggregate maestra run stats."""
    if not _pool:
        return {"total_runs": 0, "total_tokens": 0, "total_cost": 0.0, "avg_duration_s": 0.0}

    where = ""
    params: list[Any] = []
    if engagement_id:
        where = "WHERE engagement_id = $1::uuid"
        params.append(engagement_id)

    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            SELECT
                COUNT(*) as total_runs,
                COALESCE(SUM(tokens_in + tokens_out), 0) as total_tokens,
                COALESCE(SUM(cost_usd), 0) as total_cost,
                COALESCE(AVG(duration_s), 0) as avg_duration_s
            FROM console.maestra_runs
            {where}
            """,
            *params,
        )

    return {
        "total_runs": row["total_runs"],
        "total_tokens": row["total_tokens"],
        "total_cost": round(float(row["total_cost"]), 2),
        "avg_duration_s": round(float(row["avg_duration_s"]), 1),
    }


# --- Config (all keys) ---


async def get_all_config() -> dict[str, Any]:
    """Fetch all config entries as a dict."""
    if not _pool:
        return {}

    async with _pool.acquire() as conn:
        rows = await conn.fetch("SELECT key, value FROM console.console_config")
        return {r["key"]: json.loads(r["value"]) if isinstance(r["value"], str) else r["value"] for r in rows}


# --- Seed helpers ---


async def _seed_maestra_runs() -> None:
    """Seed representative maestra run data if table is empty."""
    if not _pool:
        return

    async with _pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM console.maestra_runs")
        if count > 0:
            return

    demo_engagement = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    now = datetime.now(timezone.utc)
    runs = [
        {"step": "cofa-map", "tag": "cofa-run-001", "dur": 12.3, "tin": 4200, "tout": 1800, "cost": 0.18, "status": "success", "mins_ago": 180},
        {"step": "cofa-map", "tag": "cofa-run-001", "dur": 11.8, "tin": 3900, "tout": 1650, "cost": 0.16, "status": "success", "mins_ago": 175},
        {"step": "cofa-map", "tag": "cofa-run-001", "dur": 14.1, "tin": 5100, "tout": 2200, "cost": 0.22, "status": "success", "mins_ago": 170},
        {"step": "cofa-resolve", "tag": "cofa-run-001", "dur": 8.4, "tin": 3200, "tout": 1400, "cost": 0.14, "status": "success", "mins_ago": 160},
        {"step": "cofa-resolve", "tag": "cofa-run-001", "dur": 9.1, "tin": 3500, "tout": 1500, "cost": 0.15, "status": "success", "mins_ago": 155},
        {"step": "cofa-resolve", "tag": "cofa-run-001", "dur": 7.6, "tin": 2800, "tout": 1200, "cost": 0.12, "status": "success", "mins_ago": 150},
        {"step": "chat", "tag": "chat-001", "dur": 3.2, "tin": 1200, "tout": 800, "cost": 0.06, "status": "success", "mins_ago": 120},
        {"step": "chat", "tag": "chat-002", "dur": 4.1, "tin": 1500, "tout": 950, "cost": 0.07, "status": "success", "mins_ago": 90},
        {"step": "chat", "tag": "chat-003", "dur": 2.8, "tin": 1100, "tout": 700, "cost": 0.05, "status": "success", "mins_ago": 60},
        {"step": "cofa-map", "tag": "cofa-run-002", "dur": 0.0, "tin": 500, "tout": 0, "cost": 0.01, "status": "failed", "mins_ago": 45},
    ]
    from datetime import timedelta

    async with _pool.acquire() as conn:
        for r in runs:
            ts = now - timedelta(minutes=r["mins_ago"])
            await conn.execute(
                """
                INSERT INTO console.maestra_runs
                    (engagement_id, step_name, run_tag, model_version,
                     constitution_version, duration_s, tokens_in, tokens_out,
                     cost_usd, status, error_detail, created_at)
                VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                """,
                demo_engagement,
                r["step"],
                r["tag"],
                "claude-opus-4-20250514",
                "v3.1",
                r["dur"],
                r["tin"],
                r["tout"],
                r["cost"],
                r["status"],
                "Context window exceeded" if r["status"] == "failed" else None,
                ts,
            )


async def _seed_narrative() -> None:
    """Seed default demo narrative into console_config if not present."""
    if not _pool:
        return

    existing = await get_config("demo_narrative")
    if existing:
        return

    default_narrative = {
        "steps": [
            {
                "id": "step-1",
                "title": "Discovery",
                "phase": "onboard",
                "description": "AOD discovers source systems and classifies data assets.",
                "messages": [
                    {"text": "Starting discovery across enterprise systems...", "delay_ms": 2000},
                    {"text": "Found 14 source systems, 847 tables, 12,400 columns.", "delay_ms": 3000},
                ],
            },
            {
                "id": "step-2",
                "title": "Connection Mapping",
                "phase": "onboard",
                "description": "AAM creates pipe blueprints from discovered assets.",
                "messages": [
                    {"text": "Generating pipe blueprints for discovered sources...", "delay_ms": 2000},
                    {"text": "42 pipes created. 3 require manual review.", "delay_ms": 3000},
                ],
            },
            {
                "id": "step-3",
                "title": "Data Generation",
                "phase": "model",
                "description": "Farm generates synthetic financial data for both entities.",
                "messages": [
                    {"text": "Generating financial model for Meridian...", "delay_ms": 2000},
                    {"text": "Generating financial model for Cascadia...", "delay_ms": 2000},
                    {"text": "9,350 triples generated and pushed to PG.", "delay_ms": 3000},
                ],
            },
            {
                "id": "step-4",
                "title": "COFA Unification",
                "phase": "combine",
                "description": "Maestra performs chart-of-accounts unification across entities.",
                "messages": [
                    {"text": "Beginning COFA mapping...", "delay_ms": 2000},
                    {"text": "6 conflicts identified. 3 resolved automatically.", "delay_ms": 3000},
                    {"text": "3 conflicts require human review.", "delay_ms": 2000},
                ],
            },
            {
                "id": "step-5",
                "title": "Conflict Resolution",
                "phase": "review",
                "description": "VP Finance reviews and resolves remaining conflicts.",
                "messages": [
                    {"text": "Presenting conflicts ranked by materiality...", "delay_ms": 2000},
                    {"text": "Revenue gross/net recognition: $340M impact.", "delay_ms": 3000},
                ],
            },
            {
                "id": "step-6",
                "title": "Deliverables",
                "phase": "deliver",
                "description": "Combined financial statements and QofE analysis generated.",
                "messages": [
                    {"text": "Generating combining P&L, BS, and CF statements...", "delay_ms": 3000},
                    {"text": "All 10 deliverables ready.", "delay_ms": 2000},
                ],
            },
        ],
    }
    await set_config("demo_narrative", default_narrative)


# --- Pipeline jobs (new orchestrator) ---


def _parse_dt(val: str | datetime | None) -> datetime | None:
    """Convert ISO string to datetime for asyncpg timestamptz params."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    return datetime.fromisoformat(val.replace("Z", "+00:00"))


async def save_pipeline_job(job) -> None:
    """Upsert a pipeline job (from the orchestrator's PipelineJob model)."""
    if not _pool:
        logger.error(
            f"Cannot save pipeline job — database not available. "
            f"job_id={job.job_id}"
        )
        return

    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO console.pipeline_jobs
                (job_id, pipeline_mode, execution_mode, status, started_at,
                 completed_at, steps, current_step, total_steps, message, config)
            VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz,
                    $7::jsonb, $8, $9, $10, $11::jsonb)
            ON CONFLICT (job_id) DO UPDATE
                SET status = EXCLUDED.status,
                    completed_at = EXCLUDED.completed_at,
                    steps = EXCLUDED.steps,
                    current_step = EXCLUDED.current_step,
                    message = EXCLUDED.message
            """,
            job.job_id,
            job.pipeline_mode.value if hasattr(job.pipeline_mode, 'value') else job.pipeline_mode,
            job.execution_mode.value if hasattr(job.execution_mode, 'value') else job.execution_mode,
            job.status,
            _parse_dt(job.started_at),
            _parse_dt(job.completed_at),
            json.dumps([s.model_dump() for s in job.steps]),
            job.current_step,
            job.total_steps,
            job.message,
            json.dumps(job.config),
        )


async def get_pipeline_jobs(limit: int = 20) -> list[dict[str, Any]]:
    """Fetch recent pipeline jobs from Postgres."""
    if not _pool:
        return []

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT job_id, pipeline_mode, execution_mode, status,
                   started_at, completed_at, steps, current_step,
                   total_steps, message, config, created_at
            FROM console.pipeline_jobs
            ORDER BY created_at DESC
            LIMIT $1
            """,
            limit,
        )
        return [
            {
                "job_id": r["job_id"],
                "pipeline_mode": r["pipeline_mode"],
                "execution_mode": r["execution_mode"],
                "status": r["status"],
                "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
                "steps": json.loads(r["steps"]) if isinstance(r["steps"], str) else r["steps"],
                "current_step": r["current_step"],
                "total_steps": r["total_steps"],
                "message": r["message"],
                "config": json.loads(r["config"]) if isinstance(r["config"], str) else r["config"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


async def get_pipeline_job(job_id: str) -> dict[str, Any] | None:
    """Fetch a single pipeline job by ID."""
    if not _pool:
        return None

    async with _pool.acquire() as conn:
        r = await conn.fetchrow(
            """
            SELECT job_id, pipeline_mode, execution_mode, status,
                   started_at, completed_at, steps, current_step,
                   total_steps, message, config, created_at
            FROM console.pipeline_jobs
            WHERE job_id = $1
            """,
            job_id,
        )
        if not r:
            return None
        return {
            "job_id": r["job_id"],
            "pipeline_mode": r["pipeline_mode"],
            "execution_mode": r["execution_mode"],
            "status": r["status"],
            "started_at": r["started_at"].isoformat() if r["started_at"] else None,
            "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
            "steps": json.loads(r["steps"]) if isinstance(r["steps"], str) else r["steps"],
            "current_step": r["current_step"],
            "total_steps": r["total_steps"],
            "message": r["message"],
            "config": json.loads(r["config"]) if isinstance(r["config"], str) else r["config"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }


# --- DCL Recon history ---


async def save_recon(
    job_id: str,
    pipeline_mode: str,
    entity_id: str | None,
    run_id: str | None,
    provenance_tag: str | None,
    overall: str,
    checks: list,
) -> int | None:
    """Write a recon snapshot to recon_history. Returns the row id."""
    if not _pool:
        logger.error(f"Cannot save recon — database not available. job_id={job_id}")
        return None

    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO console.recon_history
                (job_id, pipeline_mode, entity_id, run_id, provenance_tag, overall, checks)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING id
            """,
            job_id, pipeline_mode, entity_id, run_id,
            provenance_tag, overall, json.dumps(checks),
        )
        return row["id"] if row else None


async def get_recon_history(limit: int = 20) -> list[dict[str, Any]]:
    """Return recent recon history entries."""
    if not _pool:
        return []

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, job_id, entity_id, provenance_tag, overall, created_at
            FROM console.recon_history
            ORDER BY created_at DESC
            LIMIT $1
            """,
            min(limit, 100),
        )
        return [
            {
                "id": r["id"],
                "job_id": r["job_id"],
                "entity_id": r["entity_id"],
                "provenance_tag": r["provenance_tag"],
                "overall": r["overall"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


async def get_recon_snapshot(history_id: int) -> dict[str, Any] | None:
    """Return a full recon snapshot including the checks JSONB."""
    if not _pool:
        return None

    async with _pool.acquire() as conn:
        r = await conn.fetchrow(
            """
            SELECT id, job_id, pipeline_mode, entity_id, run_id,
                   provenance_tag, overall, checks, created_at
            FROM console.recon_history
            WHERE id = $1
            """,
            history_id,
        )
        if not r:
            return None
        return {
            "history_id": r["id"],
            "job_id": r["job_id"],
            "pipeline_mode": r["pipeline_mode"],
            "entity_id": r["entity_id"],
            "run_id": r["run_id"],
            "provenance_tag": r["provenance_tag"],
            "overall": r["overall"],
            "checks": json.loads(r["checks"]) if isinstance(r["checks"], str) else r["checks"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
