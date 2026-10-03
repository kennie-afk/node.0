-- Payroll: editable deduction tables the firm must confirm, monthly pay periods that close for good, payslips, and adjustments.
--
-- Sojaa asserts NO statutory rate as fact. Each deduction table (NSSF, SHA, housing levy, PAYE) starts unconfirmed with nothing in it;
-- the firm enters or adopts illustrative values and a named person confirms them. A period cannot be closed until every table is
-- confirmed (or marked not applicable). Closing is permanent: triggers refuse any later change to the period or its payslips. A
-- mistake found afterwards is corrected by an append-only adjustment paid in a later month.

CREATE TABLE rate_tables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  kind          text NOT NULL CHECK (kind IN ('nssf', 'sha', 'housing', 'paye')),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- illustrative_unverified: loaded from Sojaa's starter set, which nobody has verified; firm_entered: typed by the firm
  source        text NOT NULL DEFAULT 'none' CHECK (source IN ('none', 'illustrative_unverified', 'firm_entered')),
  status        text NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed', 'confirmed', 'not_applicable')),
  confirmed_by  uuid,
  confirmed_at  timestamptz,
  note          text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind)
);
SELECT sojaa_protect('rate_tables');

CREATE TABLE pay_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  month       text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at   timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz,
  closed_by   uuid,
  -- the settings and rate tables the figures were computed with, kept so the period can be explained years later
  snapshot    jsonb,
  UNIQUE (org_id, month)
);
SELECT sojaa_protect('pay_periods');

CREATE OR REPLACE FUNCTION sojaa_period_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a pay period cannot be deleted' USING ERRCODE = '23000';
  END IF;
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'pay period % is closed and cannot change', OLD.month USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pay_periods_immutable BEFORE UPDATE OR DELETE ON pay_periods FOR EACH ROW EXECUTE FUNCTION sojaa_period_immutable();

CREATE TABLE payslips (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  period_id               uuid NOT NULL REFERENCES pay_periods(id) ON DELETE RESTRICT,
  guard_id                uuid NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
  guard_no                text NOT NULL,
  guard_name              text NOT NULL,
  national_id             text,
  days_in_month           int NOT NULL,
  days_employed           int NOT NULL,
  basic_cents             bigint NOT NULL,
  allowance_cents         bigint NOT NULL,
  premium_cents           bigint NOT NULL DEFAULT 0,
  overtime_cents          bigint NOT NULL DEFAULT 0,
  adjustments_cents       bigint NOT NULL DEFAULT 0,
  gross_cents             bigint NOT NULL,
  deductions              jsonb NOT NULL DEFAULT '[]'::jsonb,
  employee_deductions_cents bigint NOT NULL DEFAULT 0,
  net_cents               bigint NOT NULL,
  employer_cost_cents     bigint NOT NULL,
  min_required_cents      bigint NOT NULL,
  below_minimum           boolean NOT NULL DEFAULT false,
  flags                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  breakdown               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, guard_id)
);
CREATE INDEX payslips_period_idx ON payslips (org_id, period_id);
CREATE INDEX payslips_guard_idx ON payslips (org_id, guard_id);
SELECT sojaa_protect('payslips');

-- payslips can be recomputed while the period is open and never after it closes
CREATE OR REPLACE FUNCTION sojaa_payslip_guard() RETURNS trigger AS $$
DECLARE
  pid uuid;
  st  text;
BEGIN
  pid := CASE WHEN TG_OP = 'DELETE' THEN OLD.period_id ELSE NEW.period_id END;
  SELECT status INTO st FROM pay_periods WHERE id = pid;
  IF st = 'closed' THEN
    RAISE EXCEPTION 'the pay period is closed; payslips cannot change' USING ERRCODE = '23000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER payslips_guard BEFORE INSERT OR UPDATE OR DELETE ON payslips FOR EACH ROW EXECUTE FUNCTION sojaa_payslip_guard();

-- A correction or arrears payment, positive or negative, paid in effective_month. Append-only: undoing one is another row.
CREATE TABLE payroll_adjustments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  guard_id         uuid NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
  effective_month  text NOT NULL CHECK (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount_cents     bigint NOT NULL CHECK (amount_cents <> 0),
  kind             text NOT NULL CHECK (kind IN ('correction', 'arrears', 'bonus', 'deduction', 'reversal')),
  reason           text NOT NULL CHECK (length(trim(reason)) >= 5),
  related_period_id uuid REFERENCES pay_periods(id) ON DELETE RESTRICT,
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payroll_adjustments_idx ON payroll_adjustments (org_id, effective_month, guard_id);
SELECT sojaa_protect('payroll_adjustments');
SELECT sojaa_append_only('payroll_adjustments');
