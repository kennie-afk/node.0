-- M-Pesa paybill reconciliation, statement intake for lenders, document checks, and the returns template engine.

-- Every confirmation Daraja delivers to one of our paybills. The M-Pesa transaction id is unique across the system, so a
-- confirmation delivered twice is applied once. A payment whose account reference names nobody waits in the unmatched
-- queue for a person to assign it; nothing is ever dropped silently once the paybill is known.
CREATE TABLE mpesa_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id        uuid REFERENCES branches(id) ON DELETE SET NULL,
  external_ref     text NOT NULL UNIQUE,
  shortcode        text NOT NULL,
  bill_ref         text NOT NULL DEFAULT '',
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
  payer_msisdn     text,
  received_at      timestamptz NOT NULL,
  status           text NOT NULL CHECK (status IN ('applied', 'unmatched', 'assigned', 'ignored')),
  applied_to_type  text CHECK (applied_to_type IN ('savings', 'shares', 'deposits', 'loan')),
  applied_to_id    uuid,
  unapplied_cents  bigint NOT NULL DEFAULT 0 CHECK (unapplied_cents >= 0),
  note             text,
  resolved_by      uuid,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mpesa_payments_org_idx ON mpesa_payments (org_id, received_at DESC);
CREATE INDEX mpesa_payments_unmatched_idx ON mpesa_payments (org_id) WHERE status = 'unmatched';
SELECT hazina_protect('mpesa_payments');
REVOKE DELETE ON mpesa_payments FROM hazina_app;

CREATE TABLE statement_uploads (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  member_id      uuid REFERENCES members(id) ON DELETE RESTRICT,
  loan_id        uuid REFERENCES loans(id) ON DELETE RESTRICT,
  filename       text NOT NULL,
  sha256         text NOT NULL,
  format         text NOT NULL CHECK (format IN ('csv', 'pdf', 'unknown')),
  status         text NOT NULL CHECK (status IN ('parsed', 'failed')),
  error          text,
  period_start   date,
  period_end     date,
  txn_count      int NOT NULL DEFAULT 0,
  summary        jsonb NOT NULL DEFAULT '{}'::jsonb,
  flags          jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by    uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX statement_uploads_sha_unique ON statement_uploads (org_id, member_id, sha256) WHERE status = 'parsed';
CREATE INDEX statement_uploads_member_idx ON statement_uploads (org_id, member_id, created_at DESC);
SELECT hazina_protect('statement_uploads');
SELECT hazina_append_only('statement_uploads');

CREATE TABLE statement_txns (
  id              bigserial PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  upload_id       uuid NOT NULL REFERENCES statement_uploads(id) ON DELETE RESTRICT,
  receipt_no      text,
  completed_at    timestamptz NOT NULL,
  details         text NOT NULL,
  txn_status      text,
  paid_in_cents   bigint NOT NULL DEFAULT 0 CHECK (paid_in_cents >= 0),
  withdrawn_cents bigint NOT NULL DEFAULT 0 CHECK (withdrawn_cents >= 0),
  balance_cents   bigint
);
CREATE INDEX statement_txns_upload_idx ON statement_txns (org_id, upload_id, completed_at);
SELECT hazina_protect('statement_txns');
SELECT hazina_append_only('statement_txns');

CREATE TABLE document_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  member_id   uuid REFERENCES members(id) ON DELETE RESTRICT,
  loan_id     uuid REFERENCES loans(id) ON DELETE RESTRICT,
  kind        text NOT NULL CHECK (kind IN ('payslip', 'national_id')),
  input       jsonb NOT NULL,
  flags       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_checks_member_idx ON document_checks (org_id, member_id, created_at DESC);
SELECT hazina_protect('document_checks');
SELECT hazina_append_only('document_checks');

-- Return templates. A template is data: a list of rows, each a measure from a fixed vocabulary (no SQL, ever). The
-- ones shipped are GENERIC periodic returns and are never presented as an official regulator return: is_official is
-- constrained to false, because Hazina does not know the real CBK, SASRA or Co-operatives Commissioner formats.
CREATE TABLE return_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  code         text NOT NULL CHECK (code ~ '^[A-Z0-9-]{3,40}$'),
  name         text NOT NULL,
  version      int NOT NULL DEFAULT 1 CHECK (version >= 1),
  definition   jsonb NOT NULL,
  is_official  boolean NOT NULL DEFAULT false CHECK (is_official = false),
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code, version)
);
SELECT hazina_protect('return_templates');
SELECT hazina_append_only('return_templates');

CREATE TABLE returns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  template_id   uuid NOT NULL REFERENCES return_templates(id) ON DELETE RESTRICT,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  payload       jsonb NOT NULL,
  generated_by  uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX returns_org_idx ON returns (org_id, created_at DESC);
SELECT hazina_protect('returns');
SELECT hazina_append_only('returns');
