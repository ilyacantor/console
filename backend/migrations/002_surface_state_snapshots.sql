-- 002_surface_state_snapshots.sql
-- Persistent per-session surface snapshot store for Mai's get_surface_state tool.
-- Replaces the process-local _SURFACE_STATE dict in app/routes/mcp.py that was
-- lost on every console-backend pm2 restart, breaking Mai's "what do you see?"
-- path until the operator next navigated. Last-write-wins per session_id;
-- writes hash-deduped at the application layer so updated_at stays meaningful;
-- 24h TTL sweep on read keeps abandoned-tab rows from accumulating.
-- Resolves console_deferred_work.md #8.

CREATE TABLE IF NOT EXISTS console.surface_state_snapshots (
    session_id    TEXT PRIMARY KEY,
    tenant_id     TEXT,
    route         TEXT,
    payload       JSONB NOT NULL,
    payload_hash  TEXT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surface_state_snapshots_updated_at
    ON console.surface_state_snapshots (updated_at);

-- Down: DROP TABLE console.surface_state_snapshots;
