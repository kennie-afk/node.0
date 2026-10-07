-- Leave, and an absence deduction that is the employer's own choice.
-- Nothing here is a statement of what the Employment Act requires: the annual entitlement is a figure the firm sets (21 is a
-- PLACEHOLDER the firm must check against its contracts and the Act), sick leave has no cap unless the firm sets one, and the
-- absence deduction is OFF until the firm switches it on.

ALTER TABLE org_settings
  ADD COLUMN annual_leave_days int NOT NULL DEFAULT 21 CHECK (annual_leave_days BETWEEN 0 AND 366),
  ADD COLUMN sick_leave_days int CHECK (sick_leave_days IS NULL OR sick_leave_days BETWEEN 0 AND 366),
  -- off: leave is recorded but pay never changes for an absence
  -- unpaid_leave: approved unpaid-leave days reduce basic pay and allowances (calendar-day proration, as for a guard hired mid-month)
  -- unpaid_leave_and_missed: the same, plus one day for each calendar day with a missed shift (no check-in) that is not covered by approved leave
  ADD COLUMN absence_deduction text NOT NULL DEFAULT 'off' CHECK (absence_deduction IN ('off', 'unpaid_leave', 'unpaid_leave_and_missed'));

ALTER TABLE payslips ADD COLUMN absence_deduction_cents bigint NOT NULL DEFAULT 0 CHECK (absence_deduction_cents >= 0);

CREATE TABLE leave_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  guard_id       uuid NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
  kind           text NOT NULL CHECK (kind IN ('annual', 'sick', 'unpaid')),
  start_day      date NOT NULL,
  end_day        date NOT NULL,
  -- calendar days, both ends included
  days           int GENERATED ALWAYS AS (end_day - start_day + 1) STORED,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason         text,
  decided_by     uuid,
  decided_at     timestamptz,
  decision_note  text,
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (end_day >= start_day),
  CHECK (end_day - start_day < 366),
  -- a guard cannot have two live requests for the same day
  CONSTRAINT leave_no_overlap EXCLUDE USING gist (guard_id WITH =, daterange(start_day, end_day, '[]') WITH &&) WHERE (status IN ('pending', 'approved'))
);
CREATE INDEX leave_guard_idx ON leave_requests (org_id, guard_id, start_day);
CREATE INDEX leave_status_idx ON leave_requests (org_id, status, start_day);
SELECT sojaa_protect('leave_requests');
