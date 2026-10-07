-- Interest accrual, loan loss provisioning, period locks, savings interest / dividends, guarantee calls, SMS reminders and
-- a log of penalty runs. New ledger accounts (1120, 1190, 2310, 5150, 5500) are created on first use per organisation
-- (see LATE_SYSTEM_ACCOUNTS in src/ledger/chart.ts), so no cross-tenant data change is needed here.

-- When an instalment's interest was accrued (booked to accrued interest receivable). NULL = not yet accrued: any interest
-- paid on it so far was recognised on receipt, so the income already booked is paid_interest_cents.
ALTER TABLE loan_schedule ADD COLUMN interest_accrued_on date;
CREATE INDEX loan_schedule_unaccrued_idx ON loan_schedule (org_id, due_date) WHERE interest_accrued_on IS NULL;

-- Provision percentages by ageing bucket, basis points of the exposure. ILLUSTRATIVE DEFAULTS, NOT REGULATORY GUIDANCE:
-- an accountant sets the real ones. They are configuration, never code.
ALTER TABLE org_settings ADD COLUMN provision_rates_bp jsonb NOT NULL
  DEFAULT '{"current":100,"1-30":500,"31-60":2500,"61-90":5000,"91-180":7500,"180+":10000}'::jsonb;

CREATE TABLE provision_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  as_of            date NOT NULL,
  required_cents   bigint NOT NULL CHECK (required_cents >= 0),
  before_cents     bigint NOT NULL,
  adjustment_cents bigint NOT NULL,
  buckets          jsonb NOT NULL,
  rates_bp         jsonb NOT NULL,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  run_by           uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provision_runs_idx ON provision_runs (org_id, as_of DESC, created_at DESC);
SELECT hazina_protect('provision_runs');
SELECT hazina_append_only('provision_runs');

-- Everything dated on or before locked_through is closed: the ledger refuses new entries in it.
CREATE TABLE period_locks (
  org_id         uuid PRIMARY KEY REFERENCES organisations(id) ON DELETE RESTRICT,
  locked_through date NOT NULL,
  locked_by      uuid,
  locked_at      timestamptz NOT NULL DEFAULT now(),
  note           text
);
SELECT hazina_protect('period_locks');

-- One run per kind per period end: the unique key is what makes the run idempotent.
CREATE TABLE dividend_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  kind          text NOT NULL CHECK (kind IN ('savings_interest', 'share_dividend')),
  period_end    date NOT NULL,
  rate_bp       int NOT NULL CHECK (rate_bp > 0 AND rate_bp <= 100000),
  members       int NOT NULL,
  total_cents   bigint NOT NULL,
  run_by        uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, period_end)
);
SELECT hazina_protect('dividend_runs');
SELECT hazina_append_only('dividend_runs');

-- A guarantor's savings applied to a defaulted loan.
CREATE TABLE guarantee_calls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  loan_id             uuid NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  guarantor_member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  amount_cents        bigint NOT NULL CHECK (amount_cents > 0),
  repayment_id        uuid REFERENCES loan_repayments(id) ON DELETE RESTRICT,
  called_on           date NOT NULL,
  called_by           uuid,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guarantee_calls_loan_idx ON guarantee_calls (org_id, loan_id);
SELECT hazina_protect('guarantee_calls');
SELECT hazina_append_only('guarantee_calls');

-- Set when a guarantee stops binding (the loan was repaid in full); the exposure then drops out of the guarantor's capacity.
ALTER TABLE loan_guarantors ADD COLUMN released_on date;

-- One reminder per instalment per kind per day, whatever the provider does with it. The row is claimed (status 'queued')
-- before sending and updated with the outcome, so two runs at once cannot both send it.
CREATE TABLE sms_reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  loan_id       uuid NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  installment_no int NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('upcoming', 'arrears')),
  sent_on       date NOT NULL,
  to_phone      text NOT NULL,
  body          text NOT NULL,
  provider      text NOT NULL,
  status        text NOT NULL,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, installment_no, kind, sent_on)
);
SELECT hazina_protect('sms_reminders');
REVOKE DELETE ON sms_reminders FROM hazina_app;

-- The daily penalty run, one row per organisation per day: what the scheduler checks to skip a day already done.
CREATE TABLE penalty_runs (
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  run_date     date NOT NULL,
  loans_seen   int NOT NULL DEFAULT 0,
  charged      int NOT NULL DEFAULT 0,
  total_cents  bigint NOT NULL DEFAULT 0,
  skipped_busy int NOT NULL DEFAULT 0,
  finished_at  timestamptz,
  -- set by the scheduler when the whole day's jobs (accrual, penalties, reminders) finished; a manual penalty run does not set it
  daily_jobs_done_at timestamptz,
  PRIMARY KEY (org_id, run_date)
);
SELECT hazina_protect('penalty_runs');

-- The scheduler has no tenant yet: a narrow lookup of the organisations that have loans to look after.
CREATE OR REPLACE FUNCTION lending_org_ids() RETURNS TABLE (org_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id FROM organisations o WHERE NOT o.is_demo ORDER BY o.id;
$$;
REVOKE ALL ON FUNCTION lending_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lending_org_ids() TO hazina_app;
