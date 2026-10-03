-- Self-serve onboarding, Forecourt's own subscription billing, sample data and day closes.
--
-- Tables that exist before an organisation does (outbound_messages, unmatched_billing_payments,
-- the verification columns on signup_requests) carry no org_id and are exempt from row-level
-- security, exactly as signup_requests already is. Every table that belongs to a tenant has
-- org_id, FORCE ROW LEVEL SECURITY and the same policy shape as migration 0002.

-- ---- signup verification -------------------------------------------------------------------
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS code_hash        text,
  ADD COLUMN IF NOT EXISTS code_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS code_attempts    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS code_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS resend_count     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_at      timestamptz,
  ADD COLUMN IF NOT EXISTS org_id           uuid;

CREATE INDEX IF NOT EXISTS signup_requests_phone_idx ON signup_requests (phone, created_at DESC);

-- ---- outbound messages (verification codes, reminders) -------------------------------------
-- The queue in front of whatever provider delivers them. The default provider only logs, so an
-- operator can relay a code by hand; a real SMS provider is a deliberate later integration.
CREATE TABLE IF NOT EXISTS outbound_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone    text NOT NULL,
  purpose     text NOT NULL,
  body        text NOT NULL,
  provider    text NOT NULL,
  status      text NOT NULL CHECK (status IN ('queued', 'sent', 'logged', 'failed')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbound_messages_created_idx ON outbound_messages (created_at DESC);

-- ---- sample data flags ---------------------------------------------------------------------
ALTER TABLE sites    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE users    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- ---- day closes: the record that a reconciliation actually ran -----------------------------
-- A clean day writes no discrepancy rows, so without this there is no trace that a day was ever
-- checked. It also gives the "what this found" summary figures that were computed, not re-derived.
CREATE TABLE IF NOT EXISTS day_closes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id             uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  business_day        date NOT NULL,
  cars_detected       int  NOT NULL,
  jobs_recorded       int  NOT NULL,
  expected_cents      bigint NOT NULL,
  received_cents      bigint NOT NULL,
  gap_cents           bigint NOT NULL,
  flags               int  NOT NULL,
  closed_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, business_day)
);
CREATE INDEX IF NOT EXISTS day_closes_org_idx ON day_closes (org_id, business_day DESC);

-- ---- subscriptions -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  org_id                     uuid PRIMARY KEY REFERENCES organisations(id) ON DELETE RESTRICT,
  status                     text NOT NULL CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at              timestamptz NOT NULL,
  -- end of the period that has been paid for; NULL until the first invoice is paid
  current_period_end         timestamptz,
  billing_ref                text NOT NULL UNIQUE,
  -- an agreed per-site price for plans the price list calls "talk to us"; NULL means list price
  unit_price_override_cents  bigint CHECK (unit_price_override_cents IS NULL OR unit_price_override_cents >= 0),
  credit_cents               bigint NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  number            text NOT NULL UNIQUE,
  period_start      timestamptz NOT NULL,
  period_end        timestamptz NOT NULL,
  site_count        int NOT NULL CHECK (site_count >= 0),
  plan_code         text NOT NULL,
  unit_price_cents  bigint NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents      bigint NOT NULL CHECK (amount_cents >= 0),
  status            text NOT NULL CHECK (status IN ('open', 'paid', 'void')),
  issued_at         timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz,
  -- one invoice per org per period: issuing twice is a no-op, which is what makes the runner safe
  UNIQUE (org_id, period_start)
);
CREATE INDEX IF NOT EXISTS invoices_org_idx ON invoices (org_id, issued_at DESC);

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

CREATE TABLE IF NOT EXISTS billing_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  invoice_id     uuid REFERENCES invoices(id) ON DELETE RESTRICT,
  channel        text NOT NULL CHECK (channel IN ('mpesa', 'credit', 'manual')),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  -- the M-Pesa transaction id: a callback delivered twice cannot be applied twice
  external_ref   text NOT NULL UNIQUE,
  payer_msisdn   text,
  received_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_payments_org_idx ON billing_payments (org_id, received_at DESC);
CREATE INDEX IF NOT EXISTS billing_payments_invoice_idx ON billing_payments (invoice_id);

-- Money that arrived on Forecourt's own shortcode with an account number nobody holds. Kept, not
-- dropped, so an operator can assign it; it has no tenant yet, so it has no org_id.
CREATE TABLE IF NOT EXISTS unmatched_billing_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref   text NOT NULL UNIQUE,
  reference      text NOT NULL,
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  payer_msisdn   text,
  received_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  assigned_org   uuid
);

-- Existing organisations (the demo, anything provisioned by hand) get a subscription that starts
-- its trial now. Idempotent. The application also creates a missing subscription on first use, so a
-- migration role that cannot see other tenants' rows (RLS is forced) does not leave anyone without one.
INSERT INTO subscriptions (org_id, status, trial_ends_at, billing_ref)
SELECT o.id, 'trial', now() + interval '14 days',
       'FC' || lpad((floor(random() * 900000) + 100000)::int::text, 6, '0')
  FROM organisations o
 WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.org_id = o.id)
ON CONFLICT DO NOTHING;

-- ---- row-level security on the tenant tables ----------------------------------------------
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['day_closes', 'invoices', 'billing_payments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (org_id = current_org()) WITH CHECK (org_id = current_org())',
      target || '_tenant_isolation', target
    );
  END LOOP;
END $$;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_tenant_isolation ON subscriptions
  USING (org_id = current_org()) WITH CHECK (org_id = current_org());

-- Money records are not edited or deleted by the application: a payment is a fact. (Invoices keep
-- UPDATE for the open -> paid move and DELETE is removed so history cannot vanish.)
REVOKE DELETE ON invoices FROM forecourt_app;
REVOKE UPDATE, DELETE ON billing_payments FROM forecourt_app;
REVOKE DELETE ON subscriptions FROM forecourt_app;
REVOKE DELETE ON unmatched_billing_payments FROM forecourt_app;

-- ---- lookups that must work before a tenant is known ---------------------------------------
-- An M-Pesa confirmation on the billing shortcode arrives with an account number and nothing else.
CREATE OR REPLACE FUNCTION resolve_billing_ref(candidate text)
RETURNS TABLE (org_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.org_id FROM subscriptions s WHERE s.billing_ref = candidate LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_billing_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_billing_ref(text) TO forecourt_app;

-- The billing runner walks every tenant; it only needs their ids, and it then enters each one
-- through the ordinary per-organisation path.
CREATE OR REPLACE FUNCTION billing_org_ids()
RETURNS TABLE (org_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.org_id FROM subscriptions s WHERE s.status <> 'cancelled' ORDER BY s.org_id;
$$;
REVOKE ALL ON FUNCTION billing_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_org_ids() TO forecourt_app;
