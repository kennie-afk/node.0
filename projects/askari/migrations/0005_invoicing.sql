-- Client invoicing from verified shifts, credit notes, payments, and the debtors view.
-- Invoices, lines, the shifts they bill, credit notes, payments and allocations are append-only: money history is corrected by a credit
-- note or a new entry, never an edit. A shift can be billed exactly once (a unique key on shift_id).

CREATE TABLE site_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id        uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  -- NULL = the whole site; a post's own rate beats the site's
  post_id        uuid REFERENCES posts(id) ON DELETE RESTRICT,
  basis          text NOT NULL CHECK (basis IN ('per_shift', 'per_hour')),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  effective_from date NOT NULL,
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_rates_idx ON site_rates (org_id, site_id, effective_from DESC, id DESC);
SELECT askari_protect('site_rates');
SELECT askari_append_only('site_rates');

CREATE TABLE client_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  number        text NOT NULL,
  month         text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  issue_date    date NOT NULL,
  due_date      date NOT NULL,
  total_cents   bigint NOT NULL CHECK (total_cents >= 0),
  verified_shifts int NOT NULL DEFAULT 0,
  unverified_shifts int NOT NULL DEFAULT 0,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
CREATE INDEX client_invoices_client_idx ON client_invoices (org_id, client_id, issue_date DESC);
SELECT askari_protect('client_invoices');
SELECT askari_append_only('client_invoices');

CREATE TABLE client_invoice_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  invoice_id   uuid NOT NULL REFERENCES client_invoices(id) ON DELETE RESTRICT,
  site_id      uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  post_id      uuid REFERENCES posts(id) ON DELETE RESTRICT,
  description  text NOT NULL,
  basis        text NOT NULL,
  quantity     numeric(12, 2) NOT NULL,
  unit_cents   bigint NOT NULL,
  amount_cents bigint NOT NULL
);
CREATE INDEX client_invoice_lines_idx ON client_invoice_lines (invoice_id);
SELECT askari_protect('client_invoice_lines');
SELECT askari_append_only('client_invoice_lines');

-- The evidence: which verified shifts an invoice bills. shift_id is unique, so no shift is ever billed twice.
CREATE TABLE client_invoice_shifts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  invoice_id      uuid NOT NULL REFERENCES client_invoices(id) ON DELETE RESTRICT,
  line_id         uuid NOT NULL REFERENCES client_invoice_lines(id) ON DELETE RESTRICT,
  shift_id        uuid NOT NULL UNIQUE REFERENCES shifts(id) ON DELETE RESTRICT,
  verified_minutes int NOT NULL,
  billed_cents    bigint NOT NULL
);
CREATE INDEX client_invoice_shifts_idx ON client_invoice_shifts (invoice_id);
SELECT askari_protect('client_invoice_shifts');
SELECT askari_append_only('client_invoice_shifts');

CREATE TABLE client_invoice_events (
  id          bigserial PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  invoice_id  uuid NOT NULL REFERENCES client_invoices(id) ON DELETE RESTRICT,
  kind        text NOT NULL CHECK (kind IN ('dispute', 'resolve', 'note')),
  body        text NOT NULL CHECK (length(trim(body)) >= 3),
  by_user     uuid NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_invoice_events_idx ON client_invoice_events (invoice_id, id);
SELECT askari_protect('client_invoice_events');
SELECT askari_append_only('client_invoice_events');

CREATE TABLE client_credit_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  invoice_id   uuid NOT NULL REFERENCES client_invoices(id) ON DELETE RESTRICT,
  number       text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason       text NOT NULL CHECK (length(trim(reason)) >= 5),
  created_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
CREATE INDEX client_credit_notes_idx ON client_credit_notes (invoice_id);
SELECT askari_protect('client_credit_notes');
SELECT askari_append_only('client_credit_notes');

CREATE TABLE client_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  received_on  date NOT NULL,
  method       text NOT NULL CHECK (method IN ('mpesa', 'bank', 'cash', 'cheque')),
  reference    text,
  created_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX client_payments_ref_unique ON client_payments (org_id, client_id, method, reference) WHERE reference IS NOT NULL;
CREATE INDEX client_payments_idx ON client_payments (org_id, client_id, received_on DESC);
SELECT askari_protect('client_payments');
SELECT askari_append_only('client_payments');

CREATE TABLE client_payment_allocations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  payment_id   uuid NOT NULL REFERENCES client_payments(id) ON DELETE RESTRICT,
  invoice_id   uuid NOT NULL REFERENCES client_invoices(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0)
);
CREATE INDEX client_payment_allocations_invoice_idx ON client_payment_allocations (invoice_id);
CREATE INDEX client_payment_allocations_payment_idx ON client_payment_allocations (payment_id);
SELECT askari_protect('client_payment_allocations');
SELECT askari_append_only('client_payment_allocations');
