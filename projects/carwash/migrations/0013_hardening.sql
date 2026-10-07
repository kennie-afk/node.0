-- Hardening pass: tenant isolation for job_services, session revocation, payment reversals,
-- device age, per-service consumables and a variance authoriser on cash.
--
-- Everything here is additive and idempotent where PostgreSQL allows it.

-- ---- job_services gets org_id and the same forced row-level security as every other tenant table ----
ALTER TABLE job_services ADD COLUMN IF NOT EXISTS org_id uuid;

-- jobs has FORCE ROW LEVEL SECURITY, which also binds the table owner. A migration role that is not a
-- superuser would therefore see no jobs at all and leave org_id NULL, so enforcement is lifted for the
-- length of this backfill (the migration runs in one transaction) and restored straight after.
ALTER TABLE jobs NO FORCE ROW LEVEL SECURITY;
UPDATE job_services js SET org_id = j.org_id FROM jobs j WHERE j.id = js.job_id AND js.org_id IS NULL;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE job_services ALTER COLUMN org_id SET NOT NULL;
-- A caller that forgets org_id still gets the one RLS would demand, instead of a surprise failure.
ALTER TABLE job_services ALTER COLUMN org_id SET DEFAULT current_org();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_services_org_fk') THEN
    ALTER TABLE job_services ADD CONSTRAINT job_services_org_fk
      FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS job_services_org_idx ON job_services (org_id);

ALTER TABLE job_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_services FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_services_tenant_isolation ON job_services;
CREATE POLICY job_services_tenant_isolation ON job_services
  USING (org_id = current_org()) WITH CHECK (org_id = current_org());

-- ---- sessions: a token is honoured only while its version matches the account ----
-- Bumped by sign-out, PIN change or reset, and any change of role, site or status.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_changed_at timestamptz;

-- ---- devices: when it was registered, so a rule never blames a device for days before it existed ----
ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- ---- services: the consumables one wash is expected to draw, {"detergent": 0.05} per wash ----
-- Without it supply_pilferage has no baseline and can never fire.
ALTER TABLE services ADD COLUMN IF NOT EXISTS consumables jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---- cash: who authorised an amount that differs from the quoted price ----
ALTER TABLE payments ADD COLUMN IF NOT EXISTS variance_authorised_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- ---- refunds and voids: the payment stays as a fact, a reversal row cancels it ----
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

CREATE TABLE IF NOT EXISTS payment_reversals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  payment_id    uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  job_id        uuid REFERENCES jobs(id) ON DELETE SET NULL,
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  reason        text NOT NULL,
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id)
);
CREATE INDEX IF NOT EXISTS payment_reversals_org_idx ON payment_reversals (org_id, created_at DESC);
ALTER TABLE payment_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reversals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_reversals_tenant_isolation ON payment_reversals;
CREATE POLICY payment_reversals_tenant_isolation ON payment_reversals
  USING (org_id = current_org()) WITH CHECK (org_id = current_org());
-- append only, like job_events
REVOKE UPDATE, DELETE ON payment_reversals FROM forecourt_app;

-- ---- indexes the new filters and keyset paging lean on ----
CREATE INDEX IF NOT EXISTS payments_org_received_idx ON payments (org_id, received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS jobs_org_created_idx ON jobs (org_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS jobs_worker_created_idx ON jobs (worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS discrepancies_org_day_idx ON discrepancies (org_id, business_day DESC, id DESC);
CREATE INDEX IF NOT EXISTS job_events_org_ts_idx ON job_events (org_id, server_ts DESC);
CREATE INDEX IF NOT EXISTS telemetry_device_ts_idx ON telemetry (device_id, ts DESC);

-- ---- day_closes remembers how many payments the day had, so the overview needs no table scans ----
ALTER TABLE day_closes ADD COLUMN IF NOT EXISTS payments_count int NOT NULL DEFAULT 0;

-- payments is forced-RLS too; lifted for the backfill only (see the note on jobs above)
ALTER TABLE payments NO FORCE ROW LEVEL SECURITY;
UPDATE day_closes dc
   SET payments_count = (
     SELECT count(*) FROM payments p
      WHERE p.site_id = dc.site_id AND p.received_at >= dc.business_day AND p.received_at < dc.business_day + 1
        AND p.reversed_at IS NULL
   )
 WHERE dc.payments_count = 0;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
