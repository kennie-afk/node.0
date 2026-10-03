-- Loan products, applications, the maker-checker workflow, repayment schedules, repayments and penalties.
-- Money is whole cents. Rates are basis points a year (1200 = 12.00% a year). The formulas are in docs/ACCOUNTING.md.

CREATE TABLE loan_products (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name                 text NOT NULL,
  -- flat: interest = principal x rate x months / 12, spread evenly. reducing: equal instalments on the falling balance.
  method               text NOT NULL CHECK (method IN ('flat', 'reducing')),
  annual_rate_bp       int  NOT NULL CHECK (annual_rate_bp BETWEEN 0 AND 100000),
  min_amount_cents     bigint NOT NULL DEFAULT 0 CHECK (min_amount_cents >= 0),
  max_amount_cents     bigint NOT NULL CHECK (max_amount_cents > 0),
  min_term_months      int NOT NULL DEFAULT 1 CHECK (min_term_months >= 1),
  max_term_months      int NOT NULL CHECK (max_term_months >= 1 AND max_term_months <= 360),
  -- one-off fees as basis points of principal, taken out of the cash paid at disbursement
  processing_fee_bp    int NOT NULL DEFAULT 0 CHECK (processing_fee_bp BETWEEN 0 AND 5000),
  insurance_fee_bp     int NOT NULL DEFAULT 0 CHECK (insurance_fee_bp BETWEEN 0 AND 5000),
  -- penalty charged once a month on what is overdue, basis points of the overdue instalment
  penalty_rate_bp      int NOT NULL DEFAULT 0 CHECK (penalty_rate_bp BETWEEN 0 AND 10000),
  grace_days           int NOT NULL DEFAULT 0 CHECK (grace_days BETWEEN 0 AND 90),
  -- SACCO rule: a member may borrow up to this many times their savings plus deposits (0 = no such limit)
  max_multiple_of_savings  int NOT NULL DEFAULT 0 CHECK (max_multiple_of_savings >= 0),
  guarantors_required  int NOT NULL DEFAULT 0 CHECK (guarantors_required BETWEEN 0 AND 10),
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (max_amount_cents >= min_amount_cents),
  CHECK (max_term_months >= min_term_months)
);
SELECT hazina_protect('loan_products');

CREATE TABLE loans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  loan_no          text NOT NULL,
  member_id        uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  product_id       uuid NOT NULL REFERENCES loan_products(id) ON DELETE RESTRICT,
  branch_id        uuid REFERENCES branches(id) ON DELETE SET NULL,
  -- the terms are copied from the product when the loan is applied for, so a later product edit never changes a loan
  method           text NOT NULL CHECK (method IN ('flat', 'reducing')),
  annual_rate_bp   int NOT NULL,
  principal_cents  bigint NOT NULL CHECK (principal_cents > 0),
  term_months      int NOT NULL CHECK (term_months >= 1),
  processing_fee_bp int NOT NULL DEFAULT 0,
  insurance_fee_bp  int NOT NULL DEFAULT 0,
  penalty_rate_bp   int NOT NULL DEFAULT 0,
  grace_days        int NOT NULL DEFAULT 0,
  purpose          text,
  status           text NOT NULL DEFAULT 'applied' CHECK (status IN
                     ('applied', 'appraised', 'approved', 'rejected', 'disbursed', 'closed', 'written_off', 'restructured')),
  applied_by       uuid,
  appraised_by     uuid,
  appraised_at     timestamptz,
  appraisal        jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text,
  disbursed_by     uuid,
  disbursed_on     date,
  disbursed_channel text CHECK (disbursed_channel IN ('cash', 'mpesa', 'bank', 'transfer')),
  disbursement_ref text,
  first_due_date   date,
  closed_on        date,
  written_off_on   date,
  -- a restructured loan points at the loan that replaced it
  restructured_into uuid,
  restructured_from uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, loan_no)
);
CREATE INDEX loans_member_idx ON loans (org_id, member_id);
CREATE INDEX loans_status_idx ON loans (org_id, status, created_at DESC);
SELECT hazina_protect('loans');
REVOKE DELETE ON loans FROM hazina_app;

ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_loan_fk FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE RESTRICT;

CREATE TABLE loan_guarantors (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  loan_id                uuid NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  guarantor_member_id    uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  guaranteed_cents       bigint NOT NULL CHECK (guaranteed_cents > 0),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, guarantor_member_id)
);
SELECT hazina_protect('loan_guarantors');

CREATE TABLE loan_schedule (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  loan_id          uuid NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  installment_no   int NOT NULL CHECK (installment_no >= 1),
  due_date         date NOT NULL,
  principal_cents  bigint NOT NULL CHECK (principal_cents >= 0),
  interest_cents   bigint NOT NULL CHECK (interest_cents >= 0),
  paid_principal_cents bigint NOT NULL DEFAULT 0 CHECK (paid_principal_cents >= 0 AND paid_principal_cents <= principal_cents),
  paid_interest_cents  bigint NOT NULL DEFAULT 0 CHECK (paid_interest_cents >= 0 AND paid_interest_cents <= interest_cents),
  penalty_cents        bigint NOT NULL DEFAULT 0 CHECK (penalty_cents >= 0),
  paid_penalty_cents   bigint NOT NULL DEFAULT 0 CHECK (paid_penalty_cents >= 0 AND paid_penalty_cents <= penalty_cents),
  UNIQUE (loan_id, installment_no)
);
CREATE INDEX loan_schedule_due_idx ON loan_schedule (org_id, due_date);
SELECT hazina_protect('loan_schedule');
REVOKE DELETE ON loan_schedule FROM hazina_app;

-- A repayment is a fact: it is never edited. If it was wrong, a reversing journal entry and a new repayment fix it.
CREATE TABLE loan_repayments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  loan_id           uuid NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  amount_cents      bigint NOT NULL CHECK (amount_cents > 0),
  channel           text NOT NULL CHECK (channel IN ('cash', 'mpesa', 'bank', 'transfer')),
  -- an M-Pesa transaction id or a bank slip number; unique per organisation so a repayment cannot be applied twice
  external_ref      text,
  penalty_cents     bigint NOT NULL DEFAULT 0,
  interest_cents    bigint NOT NULL DEFAULT 0,
  principal_cents   bigint NOT NULL DEFAULT 0,
  unapplied_cents   bigint NOT NULL DEFAULT 0,
  -- money received on a loan already written off: income (a recovery), not a repayment of what was lent
  recovery_cents    bigint NOT NULL DEFAULT 0,
  received_on       date NOT NULL,
  received_by       uuid,
  journal_entry_id  uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (penalty_cents + interest_cents + principal_cents + unapplied_cents + recovery_cents = amount_cents)
);
CREATE UNIQUE INDEX loan_repayments_ref_unique ON loan_repayments (org_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX loan_repayments_loan_idx ON loan_repayments (org_id, loan_id, received_on);
SELECT hazina_protect('loan_repayments');
SELECT hazina_append_only('loan_repayments');

-- Penalties are charged at most once per instalment per month: the unique key is what makes the accrual run idempotent.
CREATE TABLE loan_penalties (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  loan_id          uuid NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  installment_no   int NOT NULL,
  period_month     text NOT NULL CHECK (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  charged_on       date NOT NULL,
  UNIQUE (loan_id, installment_no, period_month)
);
SELECT hazina_protect('loan_penalties');
SELECT hazina_append_only('loan_penalties');
