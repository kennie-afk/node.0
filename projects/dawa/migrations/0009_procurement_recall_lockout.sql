-- Procurement (purchase orders, supplier returns, credit notes, voiding a wrongly entered invoice), batch
-- recall/quarantine, sign-in lockout that survives restarts, and trigram indexes for the free-text searches.

-- ---- free-text search: ILIKE '%x%' on these columns was a sequential scan ----
CREATE INDEX IF NOT EXISTS dispensing_patient_trgm ON dispensing_records USING gin (patient_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_generic_trgm ON products USING gin (generic_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm ON customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops);

-- ---- batch recall / quarantine ----
-- A quarantined or recalled batch stays on the books (it is still physically there) but is never sold.
ALTER TABLE stock_batches
  ADD COLUMN status             text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'quarantined', 'recalled')),
  ADD COLUMN status_reason      text,
  ADD COLUMN status_changed_at  timestamptz,
  ADD COLUMN status_changed_by  uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX stock_batches_held_idx ON stock_batches (branch_id) WHERE status <> 'available';

ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check
  CHECK (kind IN ('receive', 'sale', 'sale_return', 'adjustment', 'expiry_writeoff', 'stocktake_variance', 'supplier_return', 'invoice_void'));

-- ---- voiding a wrongly entered supplier invoice ----
-- Invoices stay append-only for everything that matters (amount, supplier, number). Only the three void
-- columns may be written, once, by the application role, and a voided invoice releases its number so the
-- corrected one can be entered.
ALTER TABLE supplier_invoices
  ADD COLUMN voided_at   timestamptz,
  ADD COLUMN void_reason text,
  ADD COLUMN voided_by   uuid REFERENCES users(id) ON DELETE SET NULL;
GRANT UPDATE (voided_at, void_reason, voided_by) ON supplier_invoices TO dawa_app;
ALTER TABLE supplier_invoices DROP CONSTRAINT supplier_invoices_org_id_supplier_id_invoice_number_key;
CREATE UNIQUE INDEX supplier_invoices_number_unique ON supplier_invoices (org_id, supplier_id, invoice_number) WHERE voided_at IS NULL;

-- ---- supplier credit notes: reduce what is owed on one invoice ----
CREATE TABLE supplier_credit_notes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  supplier_id          uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_invoice_id  uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  note_number          text,
  amount_cents         bigint NOT NULL CHECK (amount_cents > 0),
  reason               text NOT NULL,
  created_by           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_credit_notes_invoice_idx ON supplier_credit_notes (supplier_invoice_id);
SELECT dawa_protect('supplier_credit_notes');
SELECT dawa_append_only('supplier_credit_notes');

-- ---- supplier returns: stock sent back, optionally with the credit note it earned ----
CREATE TABLE supplier_returns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id        uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  supplier_id      uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  batch_id         uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty              int NOT NULL CHECK (qty > 0),
  unit_cost_cents  bigint NOT NULL DEFAULT 0,
  reason           text NOT NULL,
  credit_note_id   uuid REFERENCES supplier_credit_notes(id) ON DELETE RESTRICT,
  actor_id         uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_returns_branch_idx ON supplier_returns (branch_id, created_at DESC);
SELECT dawa_protect('supplier_returns');
SELECT dawa_append_only('supplier_returns');

-- ---- purchase orders ----
CREATE TABLE purchase_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id      uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  supplier_id    uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  number         text NOT NULL,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'received', 'cancelled')),
  expected_date  date,
  note           text,
  cancel_reason  text,
  created_by     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz,
  UNIQUE (org_id, number)
);
CREATE INDEX purchase_orders_branch_idx ON purchase_orders (branch_id, created_at DESC);
SELECT dawa_protect('purchase_orders');

CREATE TABLE purchase_order_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  purchase_order_id   uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty_ordered         int NOT NULL CHECK (qty_ordered > 0),
  qty_received        int NOT NULL DEFAULT 0 CHECK (qty_received >= 0 AND qty_received <= qty_ordered),
  unit_cost_cents     bigint NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0)
);
CREATE INDEX purchase_order_lines_po_idx ON purchase_order_lines (purchase_order_id);
SELECT dawa_protect('purchase_order_lines');

-- which supplier invoices a purchase order was received against (one order can arrive in several deliveries)
CREATE TABLE purchase_order_receipts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  purchase_order_id    uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  supplier_invoice_id  uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_order_receipts_po_idx ON purchase_order_receipts (purchase_order_id);
SELECT dawa_protect('purchase_order_receipts');
SELECT dawa_append_only('purchase_order_receipts');

-- ---- sign-in lockout ----
-- Keyed by phone number, not by IP address and not by process: every replica reads and writes the same row, so a
-- six-digit PIN cannot be guessed N times faster by spreading attempts over N replicas. It is not tenant data
-- (the person is not identified yet when it is written), so it has no org_id and no RLS.
CREATE TABLE login_lockouts (
  phone            text PRIMARY KEY,
  failures         int NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_failure_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_lockouts_last_idx ON login_lockouts (last_failure_at);
