-- Catalogue, suppliers, batch-level stock with expiry, unit serials, and the stock ledger.

CREATE TABLE products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  generic_name        text,
  strength            text,
  form                text,
  pack_size           text,
  -- GS1 GTIN normalised to 14 digits (an EAN-13 on the box is left-padded with a zero)
  gtin                text CHECK (gtin IS NULL OR gtin ~ '^[0-9]{14}$'),
  -- How the owner has classified the item. otc: sold over the counter. prescription: needs a dispensing
  -- record. controlled: also goes in the controlled-drug register with a witness. The classification is
  -- the pharmacy's own; Dawa does not decide what the law classifies a medicine as.
  category            text NOT NULL DEFAULT 'otc' CHECK (category IN ('otc', 'prescription', 'controlled')),
  unit                text NOT NULL DEFAULT 'unit',
  reorder_level       int NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  list_price_cents    bigint NOT NULL DEFAULT 0 CHECK (list_price_cents >= 0),
  active              boolean NOT NULL DEFAULT true,
  is_demo             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_gtin_unique ON products (org_id, gtin) WHERE gtin IS NOT NULL;
CREATE INDEX products_org_idx ON products (org_id, active);
CREATE INDEX products_name_trgm ON products USING gin (name gin_trgm_ops);
SELECT dawa_protect('products');

CREATE TABLE suppliers (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name      text NOT NULL,
  phone     text,
  active    boolean NOT NULL DEFAULT true,
  is_demo   boolean NOT NULL DEFAULT false,
  UNIQUE (org_id, name)
);
SELECT dawa_protect('suppliers');

CREATE TABLE supplier_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id       uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  supplier_id     uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  invoice_number  text NOT NULL,
  invoice_date    date NOT NULL,
  due_date        date,
  total_cents     bigint NOT NULL CHECK (total_cents >= 0),
  created_by      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, supplier_id, invoice_number)
);
CREATE INDEX supplier_invoices_org_idx ON supplier_invoices (org_id, invoice_date DESC);
SELECT dawa_protect('supplier_invoices');
SELECT dawa_append_only('supplier_invoices');

CREATE TABLE supplier_payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  supplier_invoice_id  uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  amount_cents         bigint NOT NULL CHECK (amount_cents > 0),
  method               text NOT NULL CHECK (method IN ('cash', 'mpesa', 'bank', 'other')),
  reference            text,
  paid_at              timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX supplier_payments_invoice_idx ON supplier_payments (supplier_invoice_id);
SELECT dawa_protect('supplier_payments');
SELECT dawa_append_only('supplier_payments');

-- One row per physical batch of a product at a branch. qty_on_hand can never go below zero: that CHECK
-- is the last line of defence behind the row locks the sale path takes, so an oversell cannot be committed.
CREATE TABLE stock_batches (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id            uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id           uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_no             text NOT NULL,
  expiry_date          date NOT NULL,
  qty_on_hand          int NOT NULL CHECK (qty_on_hand >= 0),
  qty_received         int NOT NULL CHECK (qty_received > 0),
  unit_cost_cents      bigint NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  supplier_invoice_id  uuid REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  received_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, product_id, batch_no, expiry_date)
);
CREATE INDEX stock_batches_fefo_idx ON stock_batches (branch_id, product_id, expiry_date) WHERE qty_on_hand > 0;
CREATE INDEX stock_batches_org_idx ON stock_batches (org_id);
SELECT dawa_protect('stock_batches');

-- Unit-level serial numbers captured from a scanned GS1 code (AI 21). A serial is unique per product, so a
-- second sale of the same serial, or a receipt of one already held, is refused and reported.
CREATE TABLE serial_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id    uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
  serial      text NOT NULL,
  status      text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'sold')),
  sold_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, product_id, serial)
);
CREATE INDEX serial_units_batch_idx ON serial_units (batch_id, status);
SELECT dawa_protect('serial_units');

-- Every change to stock is a row here; qty_on_hand on the batch is its running total and a test proves they agree.
CREATE TABLE stock_movements (
  id               bigserial PRIMARY KEY,
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id        uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id         uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
  kind             text NOT NULL CHECK (kind IN ('receive', 'sale', 'sale_return', 'adjustment', 'expiry_writeoff', 'stocktake_variance')),
  qty_delta        int NOT NULL CHECK (qty_delta <> 0),
  unit_cost_cents  bigint NOT NULL DEFAULT 0,
  ref_type         text,
  ref_id           uuid,
  reason           text,
  actor_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_batch_idx ON stock_movements (batch_id);
CREATE INDEX stock_movements_org_time_idx ON stock_movements (org_id, branch_id, created_at DESC);
SELECT dawa_protect('stock_movements');
SELECT dawa_append_only('stock_movements');
