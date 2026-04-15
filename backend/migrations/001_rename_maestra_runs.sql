-- 001_rename_maestra_runs.sql
-- Rename console.maestra_runs -> console.mai_runs.
-- Idempotent: each rename guarded by existence check on the OLD name.
-- Brain-A part 2b per mai_blueprint_v8.md §1.2 rename charter.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'console' AND tablename = 'maestra_runs'
    ) THEN
        ALTER TABLE console.maestra_runs RENAME TO mai_runs;
    END IF;
END $$;

-- Down: ALTER TABLE console.mai_runs RENAME TO maestra_runs;
