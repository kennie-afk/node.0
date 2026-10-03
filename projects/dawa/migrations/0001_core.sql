-- Dawa: tenants, branches, staff, and the row-level-security machinery every later migration uses.
--
-- Isolation model: every table that belongs to a tenant carries org_id, has row level security
-- ENABLED and FORCED, and one policy (org_id = current_org()). The application connects as dawa_app
-- (NOSUPERUSER, NOBYPASSRLS, not the table owner) and binds the tenant per transaction with
-- set_config('dawa.org_id', ..., true). dawa_protect() is how a migration does all of that for a new
-- table in one call, and the API refuses to start in production if any org_id table is not covered.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dawa_app') THEN
    CREATE ROLE dawa_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN;
  ELSE
    ALTER ROLE dawa_app NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO dawa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dawa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dawa_app;

CREATE OR REPLACE FUNCTION current_org() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('dawa.org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Turns row level security on, forces it (the owner is subject to it too), and installs the tenant policy.
-- key_column is org_id for every table except organisations itself, which is keyed by id.
CREATE OR REPLACE FUNCTION dawa_protect(tbl regclass, key_column text DEFAULT 'org_id') RETURNS void AS $$
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

-- Facts the application may add and read but never edit or delete (stock and money history).
CREATE OR REPLACE FUNCTION dawa_append_only(tbl regclass) RETURNS void AS $$
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM dawa_app', tbl);
END $$ LANGUAGE plpgsql;

CREATE TABLE organisations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now()
);
SELECT dawa_protect('organisations', 'id');

CREATE TABLE branches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  code         text NOT NULL CHECK (code ~ '^[A-Z0-9]{2,8}$'),
  name         text NOT NULL,
  -- the M-Pesa till/paybill this branch takes confirmations on; globally unique so a payment finds one branch
  till_number  text,
  timezone     text NOT NULL DEFAULT 'Africa/Nairobi',
  -- sample branches are never billed and never mixed into real reports
  is_demo      boolean NOT NULL DEFAULT false,
  archived     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
CREATE UNIQUE INDEX branches_till_unique ON branches (till_number) WHERE till_number IS NOT NULL;
CREATE INDEX branches_org_idx ON branches (org_id);
SELECT dawa_protect('branches');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  -- NULL means the person works across branches (an owner); otherwise they are confined to one
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  role          text NOT NULL CHECK (role IN ('owner', 'manager', 'pharmacist', 'cashier')),
  display_name  text NOT NULL,
  phone         text NOT NULL,
  -- a pharmacist's professional registration number, printed on dispensing records
  licence_no    text,
  pin_hash      text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone)
);
CREATE INDEX users_org_idx ON users (org_id);
SELECT dawa_protect('users');

-- Sign-in finds a person by phone before any tenant is known, so it is one narrow SECURITY DEFINER lookup.
CREATE OR REPLACE FUNCTION resolve_login(candidate text)
RETURNS TABLE (id uuid, org_id uuid, branch_id uuid, role text, display_name text, pin_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.org_id, u.branch_id, u.role, u.display_name, u.pin_hash
    FROM users u WHERE u.phone = candidate AND u.status = 'active' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_login(text) TO dawa_app;

-- An M-Pesa confirmation arrives with a shortcode and no tenant.
CREATE OR REPLACE FUNCTION resolve_till(candidate text)
RETURNS TABLE (org_id uuid, branch_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.org_id, b.id FROM branches b WHERE b.till_number = candidate AND NOT b.archived LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_till(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_till(text) TO dawa_app;

-- Append-only audit trail of who did what that matters (voids, adjustments, controlled drugs, access changes).
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
SELECT dawa_protect('audit_events');
SELECT dawa_append_only('audit_events');
