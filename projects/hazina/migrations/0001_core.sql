-- Hazina: tenants (a SACCO or a non-bank lender), branches, staff, and the row-level-security machinery every later migration uses.
--
-- Isolation model: every table that belongs to a tenant carries org_id, has row level security
-- ENABLED and FORCED, and one policy (org_id = current_org()). The application connects as hazina_app
-- (NOSUPERUSER, NOBYPASSRLS, not the table owner) and binds the tenant per transaction with
-- set_config('hazina.org_id', ..., true). hazina_protect() is how a migration does all of that for a new
-- table in one call, and the API refuses to start in production if any org_id table is not covered.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hazina_app') THEN
    CREATE ROLE hazina_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN;
  ELSE
    ALTER ROLE hazina_app NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO hazina_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hazina_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hazina_app;

CREATE OR REPLACE FUNCTION current_org() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('hazina.org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Turns row level security on, forces it (the owner is subject to it too), and installs the tenant policy.
-- key_column is org_id for every table except organisations itself, which is keyed by id.
CREATE OR REPLACE FUNCTION hazina_protect(tbl regclass, key_column text DEFAULT 'org_id') RETURNS void AS $$
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
CREATE OR REPLACE FUNCTION hazina_append_only(tbl regclass) RETURNS void AS $$
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM hazina_app', tbl);
END $$ LANGUAGE plpgsql;

-- kind decides what the organisation may do: a SACCO takes member savings, shares and deposits; a non-bank lender
-- is a non-deposit-taking credit provider and the API refuses to book a deposit for it. A sample organisation is a
-- whole separate tenant (is_demo), so sample figures can never mix into a real ledger and it is never billed.
CREATE TABLE organisations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  kind             text NOT NULL DEFAULT 'sacco' CHECK (kind IN ('sacco', 'lender')),
  registration_no  text,
  is_demo          boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now()
);
SELECT hazina_protect('organisations', 'id');

CREATE TABLE branches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  code         text NOT NULL CHECK (code ~ '^[A-Z0-9]{2,8}$'),
  name         text NOT NULL,
  -- the M-Pesa paybill this branch takes confirmations on; globally unique so a payment finds one branch
  paybill_number  text,
  timezone     text NOT NULL DEFAULT 'Africa/Nairobi',
  is_demo      boolean NOT NULL DEFAULT false,
  archived     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
CREATE UNIQUE INDEX branches_paybill_unique ON branches (paybill_number) WHERE paybill_number IS NOT NULL;
CREATE INDEX branches_org_idx ON branches (org_id);
SELECT hazina_protect('branches');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  -- NULL means the person works across branches (an owner); otherwise they are confined to one
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  role          text NOT NULL CHECK (role IN ('owner', 'manager', 'loan_officer', 'teller', 'accountant', 'auditor')),
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
SELECT hazina_protect('users');

-- Sign-in finds a person by phone before any tenant is known, so it is one narrow SECURITY DEFINER lookup.
CREATE OR REPLACE FUNCTION resolve_login(candidate text)
RETURNS TABLE (id uuid, org_id uuid, branch_id uuid, role text, display_name text, pin_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.org_id, u.branch_id, u.role, u.display_name, u.pin_hash
    FROM users u WHERE u.phone = candidate AND u.status = 'active' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_login(text) TO hazina_app;

-- An M-Pesa confirmation arrives with a paybill and no tenant.
CREATE OR REPLACE FUNCTION resolve_paybill(candidate text)
RETURNS TABLE (org_id uuid, branch_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.org_id, b.id FROM branches b WHERE b.paybill_number = candidate AND NOT b.archived LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_paybill(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_paybill(text) TO hazina_app;

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
SELECT hazina_protect('audit_events');
SELECT hazina_append_only('audit_events');

-- One row per organisation: the rules the owner tunes. Defaults are conservative and PROVISIONAL.
CREATE TABLE org_settings (
  org_id                       uuid PRIMARY KEY REFERENCES organisations(id) ON DELETE RESTRICT,
  -- strict: a loan's applicant, appraiser and approver must be three different people. relaxed: an owner may hold
  -- more than one of those roles, and every such step is written to the audit trail.
  maker_checker                text NOT NULL DEFAULT 'strict' CHECK (maker_checker IN ('strict', 'relaxed')),
  -- a savings withdrawal at or above this needs a second person (whole cents); 0 means every withdrawal does
  withdrawal_approval_cents    bigint NOT NULL DEFAULT 5000000 CHECK (withdrawal_approval_cents >= 0),
  -- indicative repayment capacity used by statement analysis: this share of average monthly inflow (basis points)
  capacity_share_bp            int NOT NULL DEFAULT 3000 CHECK (capacity_share_bp BETWEEN 100 AND 10000),
  financial_year_start_month   int NOT NULL DEFAULT 1 CHECK (financial_year_start_month BETWEEN 1 AND 12),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);
SELECT hazina_protect('org_settings', 'org_id');
