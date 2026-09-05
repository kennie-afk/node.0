ALTER TABLE telemetry_minute DROP CONSTRAINT IF EXISTS telemetry_minute_pkey;
ALTER TABLE telemetry_hour   DROP CONSTRAINT IF EXISTS telemetry_hour_pkey;

ALTER TABLE telemetry_minute ADD COLUMN IF NOT EXISTS bay_key uuid
  GENERATED ALWAYS AS (COALESCE(bay_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;
ALTER TABLE telemetry_hour ADD COLUMN IF NOT EXISTS bay_key uuid
  GENERATED ALWAYS AS (COALESCE(bay_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS telemetry_minute_unique
  ON telemetry_minute (site_id, bucket, metric, bay_key);
CREATE UNIQUE INDEX IF NOT EXISTS telemetry_hour_unique
  ON telemetry_hour (site_id, bucket, metric, bay_key);

ALTER TABLE telemetry_minute ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_minute FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telemetry_minute_tenant_isolation ON telemetry_minute;
CREATE POLICY telemetry_minute_tenant_isolation ON telemetry_minute
  USING (org_id = current_org()) WITH CHECK (org_id = current_org());

ALTER TABLE telemetry_hour ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_hour FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telemetry_hour_tenant_isolation ON telemetry_hour;
CREATE POLICY telemetry_hour_tenant_isolation ON telemetry_hour
  USING (org_id = current_org()) WITH CHECK (org_id = current_org());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forecourt_app') THEN
    CREATE ROLE forecourt_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN;
  ELSE
    ALTER ROLE forecourt_app NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO forecourt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forecourt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forecourt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forecourt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO forecourt_app;

REVOKE INSERT, UPDATE, DELETE ON job_events FROM forecourt_app;
GRANT INSERT, SELECT ON job_events TO forecourt_app;
