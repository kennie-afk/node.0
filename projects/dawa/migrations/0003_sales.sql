-- Customers with credit accounts, price lists, sales, payments and returns.

CREATE TABLE price_lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name       text NOT NULL,
  UNIQUE (org_id, name)
);
SELECT dawa_protect('price_lists');

CREATE TABLE price_list_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  price_list_id  uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_cents    bigint NOT NULL CHECK (price_cents >= 0),
  UNIQUE (price_list_id, product_id)
);
SELECT dawa_protect('price_list_items');

CREATE TABLE customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  phone               text,
  credit_limit_cents  bigint NOT NULL DEFAULT 0 CHECK (credit_limit_cents >= 0),
  price_list_id       uuid REFERENCES price_lists(id) ON DELETE SET NULL,
  active              boolean NOT NULL DEFAULT true,
  is_demo             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_org_idx ON customers (org_id);
SELECT dawa_protect('customers');

-- A customer's balance is the sum of this ledger: a sale on credit adds, a payment subtracts. Never edited.
CREATE TABLE customer_ledger (
  id            bigserial PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('sale', 'payment', 'return', 'adjustment')),
  amount_cents  bigint NOT NULL CHECK (amount_cents <> 0),
  ref_type      text,
  ref_id        uuid,
  note          text,
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_ledger_customer_idx ON customer_ledger (customer_id);
SELECT dawa_protect('customer_ledger');
SELECT dawa_append_only('customer_ledger');

-- Sale numbers are per branch and per day: MAIN-261003-0007. The counter row is the lock that makes them gap-free.
CREATE TABLE sale_counters (
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_day date NOT NULL,
  last_number  int NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, business_day)
);
SELECT dawa_protect('sale_counters');

CREATE TABLE sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id      uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  number         text NOT NULL,
  business_day   date NOT NULL,
  cashier_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  -- pending_payment: goods released, money not yet complete (an M-Pesa payment still to arrive)
  status         text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'completed', 'voided')),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents    bigint NOT NULL CHECK (total_cents >= 0),
  discount_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  void_reason    text,
  voided_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  voided_at      timestamptz,
  is_demo        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
CREATE INDEX sales_branch_day_idx ON sales (branch_id, business_day);
CREATE INDEX sales_pending_idx ON sales (branch_id, created_at) WHERE status = 'pending_payment';
SELECT dawa_protect('sales');

CREATE TABLE sale_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  sale_id          uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty              int NOT NULL CHECK (qty > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents >= 0),
  -- cost of what was actually taken from the batches, for margin
  cost_cents       bigint NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  returned_qty     int NOT NULL DEFAULT 0 CHECK (returned_qty >= 0 AND returned_qty <= qty)
);
CREATE INDEX sale_lines_sale_idx ON sale_lines (sale_id);
CREATE INDEX sale_lines_product_idx ON sale_lines (org_id, product_id);
SELECT dawa_protect('sale_lines');

-- Which batches a line was taken from (FEFO may span several), so a return goes back where it came from.
CREATE TABLE sale_line_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  sale_line_id     uuid NOT NULL REFERENCES sale_lines(id) ON DELETE CASCADE,
  batch_id         uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
  qty              int NOT NULL CHECK (qty > 0),
  returned_qty     int NOT NULL DEFAULT 0 CHECK (returned_qty >= 0 AND returned_qty <= qty),
  unit_cost_cents  bigint NOT NULL DEFAULT 0
);
CREATE INDEX sale_line_batches_line_idx ON sale_line_batches (sale_line_id);
SELECT dawa_protect('sale_line_batches');

-- Money received for a sale. external_ref is the M-Pesa TransID: a confirmation delivered twice is applied once.
CREATE TABLE sale_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id      uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sale_id        uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  method         text NOT NULL CHECK (method IN ('cash', 'mpesa', 'credit')),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  external_ref   text,
  payer_msisdn   text,
  received_at    timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sale_payments_external_unique ON sale_payments (external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX sale_payments_sale_idx ON sale_payments (sale_id);
CREATE INDEX sale_payments_branch_time_idx ON sale_payments (branch_id, received_at);
SELECT dawa_protect('sale_payments');
SELECT dawa_append_only('sale_payments');

-- M-Pesa money that reached a branch till but matched no sale: kept for the manager to assign, never dropped.
CREATE TABLE mpesa_unmatched (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  external_ref  text NOT NULL UNIQUE,
  reference     text,
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  payer_msisdn  text,
  received_at   timestamptz NOT NULL,
  assigned_sale uuid REFERENCES sales(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
SELECT dawa_protect('mpesa_unmatched');

CREATE TABLE sale_returns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sale_id       uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  sale_line_id  uuid NOT NULL REFERENCES sale_lines(id) ON DELETE RESTRICT,
  qty           int NOT NULL CHECK (qty > 0),
  refund_cents  bigint NOT NULL CHECK (refund_cents >= 0),
  refund_method text NOT NULL CHECK (refund_method IN ('cash', 'mpesa', 'credit')),
  reason        text NOT NULL,
  -- whether the units went back on the shelf; damaged or expired returns do not
  restocked     boolean NOT NULL,
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_returns_sale_idx ON sale_returns (sale_id);
SELECT dawa_protect('sale_returns');
SELECT dawa_append_only('sale_returns');
