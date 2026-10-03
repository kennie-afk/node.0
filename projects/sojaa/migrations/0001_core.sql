-- Sojaa: tenants (a private security firm), branches (depots or regions), staff, and the row-level-security machinery every later migration uses.
--
-- Isolation model: every table that belongs to a tenant carries org_id, has row level security
-- ENABLED and FORCED, and one policy (org_id = current_org()). The application connects as sojaa_app
-- (NOSUPERUSER, NOBYPASSRLS, not the table owner) and binds the tenant per transaction with
-- set_config('sojaa.org_id', ..., true). sojaa_protect() is how a migration does all of that for a new
-- table in one call, and the API refuses to start in production if any org_id table is not covered.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sojaa_app') THEN
    CREATE ROLE sojaa_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN;
  ELSE
    ALTER ROLE sojaa_app NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO sojaa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sojaa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sojaa_app;

CREATE OR REPLACE FUNCTION current_org() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('sojaa.org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Turns row level security on, forces it (the owner is subject to it too), and installs the tenant policy.
-- key_column is org_id for every table except organisations itself, which is keyed by id.
CREATE OR REPLACE FUNCTION sojaa_protect(tbl regclass, key_column text DEFAULT 'org_id') RETURNS void AS $$
DECLARE
  rel text;
  policy_name text;
BEGIN
  SELECT relname INTO rel FROM pg_class WHERE oid = tbl;
  policy_name := rel || '_tenant_isolation';
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = rel AND policyname = policy_name) THEN
    EXECUTE format('CREATE POLICY %I ON %s USING (%I = current_org()) WITH CHECK (%I = current_org())',
                   policy_name, tbl, key_column, key_column);
  END IF;
END $$ LANGUAGE plpgsql;

-- Facts the application may add and read but never edit or delete (money history).
CREATE OR REPLACE FUNCTION sojaa_append_only(tbl regclass) RETURNS void AS $$
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM sojaa_app', tbl);
END $$ LANGUAGE plpgsql;

-- A sample organisation is a whole separate tenant (is_demo), so sample figures can never mix into real records and it is never billed.
-- psra_licence_no is DATA the firm types in: there is no public service Sojaa could use to verify it, and none is assumed.
CREATE TABLE organisations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  psra_licence_no  text,
  is_demo          boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now()
);
SELECT sojaa_protect('organisations', 'id');

CREATE TABLE branches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  code         text NOT NULL CHECK (code ~ '^[A-Z0-9]{2,8}$'),
  name         text NOT NULL,
  timezone     text NOT NULL DEFAULT 'Africa/Nairobi',
  is_demo      boolean NOT NULL DEFAULT false,
  archived     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
CREATE INDEX branches_org_idx ON branches (org_id);
SELECT sojaa_protect('branches');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  -- NULL means the person works across branches (an owner); otherwise they are confined to one
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  role          text NOT NULL CHECK (role IN ('owner', 'ops_manager', 'supervisor', 'payroll', 'auditor')),
  display_name  text NOT NULL,
  phone         text NOT NULL,
  staff_no      text,
  pin_hash      text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone)
);
CREATE INDEX users_org_idx ON users (org_id);
SELECT sojaa_protect('users');

-- Sign-in finds a person by phone before any tenant is known, so it is one narrow SECURITY DEFINER lookup.
CREATE OR REPLACE FUNCTION resolve_login(candidate text)
RETURNS TABLE (id uuid, org_id uuid, branch_id uuid, role text, display_name text, pin_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.org_id, u.branch_id, u.role, u.display_name, u.pin_hash
    FROM users u WHERE u.phone = candidate AND u.status = 'active' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_login(text) TO sojaa_app;

-- Append-only audit trail of who did what that matters (approvals, disbursements, write-offs, journals, access changes).
CREATE TABLE audit_events (
  id          bigserial PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,
  actor_id    uuid,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_org_idx ON audit_events (org_id, created_at DESC);
SELECT sojaa_protect('audit_events');
SELECT sojaa_append_only('audit_events');

-- One row per organisation: the rules the owner tunes. EVERY wage and hours figure here is a placeholder the firm must
-- confirm against the current Regulation of Wages order and its own contracts; Sojaa asserts none of them as law.
CREATE TABLE org_settings (
  org_id                          uuid PRIMARY KEY REFERENCES organisations(id) ON DELETE RESTRICT,
  -- monthly minimum, whole cents. 30,000 is the figure in the 2025 High Court ruling reported in the research; the
  -- current order must be checked by the firm (the console says so beside the figure)
  min_wage_cents                  bigint NOT NULL DEFAULT 3000000 CHECK (min_wage_cents >= 0),
  -- whether fixed allowances count toward the minimum is a legal question Sojaa does not answer; default: they do not
  allowances_count_toward_min     boolean NOT NULL DEFAULT false,
  -- divisor turning a monthly wage into an hourly rate for overtime and premiums (PLACEHOLDER, unverified)
  standard_monthly_hours          int NOT NULL DEFAULT 225 CHECK (standard_monthly_hours BETWEEN 50 AND 400),
  overtime_multiplier_bp          int NOT NULL DEFAULT 15000 CHECK (overtime_multiplier_bp >= 10000),
  rest_day_multiplier_bp          int NOT NULL DEFAULT 20000 CHECK (rest_day_multiplier_bp >= 10000),
  holiday_multiplier_bp           int NOT NULL DEFAULT 20000 CHECK (holiday_multiplier_bp >= 10000),
  -- attendance rules
  checkin_early_minutes           int NOT NULL DEFAULT 60 CHECK (checkin_early_minutes BETWEEN 0 AND 600),
  late_grace_minutes              int NOT NULL DEFAULT 10 CHECK (late_grace_minutes BETWEEN 0 AND 240),
  missed_after_minutes            int NOT NULL DEFAULT 60 CHECK (missed_after_minutes BETWEEN 5 AND 720),
  default_geofence_m              int NOT NULL DEFAULT 150 CHECK (default_geofence_m BETWEEN 20 AND 5000),
  -- roster limits: NULL means not enforced. Sojaa ships with none enforced and states no legal limit.
  max_hours_per_week              int CHECK (max_hours_per_week IS NULL OR max_hours_per_week BETWEEN 1 AND 168),
  min_rest_hours                  int CHECK (min_rest_hours IS NULL OR min_rest_hours BETWEEN 1 AND 24),
  -- client invoices bill: 'scheduled' = the scheduled hours of a shift that was verified present; 'actual' = verified hours
  bill_basis                      text NOT NULL DEFAULT 'scheduled' CHECK (bill_basis IN ('scheduled', 'actual')),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);
SELECT sojaa_protect('org_settings', 'org_id');
