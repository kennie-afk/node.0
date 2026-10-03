-- Self-serve signup, Sojaa's own subscription billing and the message queue.
-- Sojaa bills by active guards (a price per guard per month with a minimum), never by branch.
--
-- Tables that exist before an organisation does (signup_requests, outbound_messages,
-- unmatched_billing_payments) carry no org_id and are exempt from row-level security by design. Every
-- table that belongs to a tenant has org_id and the same forced policy as the rest.

CREATE TABLE signup_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name    text NOT NULL,
  contact_name     text NOT NULL,
  phone            text NOT NULL,
  expected_guards  int  NOT NULL DEFAULT 0 CHECK (expected_guards >= 0),
  registration_no  text,
  -- true: provision a separate sample organisation with sample data, never billed, instead of a real one
  sample           boolean NOT NULL DEFAULT false,
  notes            text,
  status           text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'onboarded', 'declined')),
  code_hash        text,
  code_expires_at  timestamptz,
  code_attempts    int NOT NULL DEFAULT 0,
  code_sent_at     timestamptz,
  resend_count     int NOT NULL DEFAULT 0,
  verified_at      timestamptz,
  -- the organisation this request became; deliberately NOT called org_id, because this table exists before any
  -- tenant does and is exempt from row-level security (the startup guard treats every org_id table as a tenant table)
  provisioned_org_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signup_requests_status_idx ON signup_requests (status, created_at DESC);
CREATE INDEX signup_requests_phone_idx ON signup_requests (phone, created_at DESC);

-- The queue in front of whatever provider delivers verification codes and reminders. The default provider only
-- logs, so an operator can relay a code by hand; a real SMS provider is a deliberate later integration.
CREATE TABLE outbound_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone    text NOT NULL,
  purpose     text NOT NULL,
  body        text NOT NULL,
  provider    text NOT NULL,
  status      text NOT NULL CHECK (status IN ('queued', 'sent', 'logged', 'failed')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbound_messages_created_idx ON outbound_messages (created_at DESC);

CREATE TABLE subscriptions (
  org_id                     uuid PRIMARY KEY REFERENCES organisations(id) ON DELETE RESTRICT,
  status                     text NOT NULL CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at              timestamptz NOT NULL,
  current_period_end         timestamptz,
  billing_ref                text NOT NULL UNIQUE,
  unit_price_override_cents  bigint CHECK (unit_price_override_cents IS NULL OR unit_price_override_cents >= 0),
  credit_cents               bigint NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
SELECT sojaa_protect('subscriptions');

CREATE SEQUENCE invoice_number_seq;

CREATE TABLE invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  number            text NOT NULL UNIQUE,
  period_start      timestamptz NOT NULL,
  period_end        timestamptz NOT NULL,
  unit_count        int NOT NULL CHECK (unit_count >= 0),
  plan_code         text NOT NULL,
  unit_price_cents  bigint NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents      bigint NOT NULL CHECK (amount_cents >= 0),
  status            text NOT NULL CHECK (status IN ('open', 'paid', 'void')),
  issued_at         timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz,
  -- one invoice per organisation per period: issuing twice is a no-op, which is what makes the runner safe
  UNIQUE (org_id, period_start)
);
CREATE INDEX invoices_org_idx ON invoices (org_id, issued_at DESC);
SELECT sojaa_protect('invoices');

CREATE TABLE billing_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  invoice_id     uuid REFERENCES invoices(id) ON DELETE RESTRICT,
  channel        text NOT NULL CHECK (channel IN ('mpesa', 'credit', 'manual')),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  -- the M-Pesa transaction id: a confirmation delivered twice cannot be applied twice
  external_ref   text NOT NULL UNIQUE,
  payer_msisdn   text,
  received_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_payments_org_idx ON billing_payments (org_id, received_at DESC);
CREATE INDEX billing_payments_invoice_idx ON billing_payments (invoice_id);
SELECT sojaa_protect('billing_payments');

-- Money that arrived on Sojaa's own shortcode with an account number nobody holds. Kept so an operator can
-- assign it; it has no tenant yet, so it has no org_id.
CREATE TABLE unmatched_billing_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref   text NOT NULL UNIQUE,
  reference      text NOT NULL,
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  payer_msisdn   text,
  received_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  assigned_org   uuid
);

-- Money records are facts: not edited or deleted by the application. Invoices keep UPDATE for the open -> paid move.
REVOKE DELETE ON invoices FROM sojaa_app;
REVOKE UPDATE, DELETE ON billing_payments FROM sojaa_app;
REVOKE DELETE ON subscriptions FROM sojaa_app;
REVOKE DELETE ON unmatched_billing_payments FROM sojaa_app;

-- Lookups that must work before a tenant is known; each returns an organisation id and nothing else.
CREATE OR REPLACE FUNCTION resolve_billing_ref(candidate text)
RETURNS TABLE (org_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.org_id FROM subscriptions s WHERE s.billing_ref = candidate LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_billing_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_billing_ref(text) TO sojaa_app;

CREATE OR REPLACE FUNCTION billing_org_ids()
RETURNS TABLE (org_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.org_id FROM subscriptions s JOIN organisations o ON o.id = s.org_id
   WHERE s.status <> 'cancelled' AND NOT o.is_demo ORDER BY s.org_id;
$$;
REVOKE ALL ON FUNCTION billing_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_org_ids() TO sojaa_app;

