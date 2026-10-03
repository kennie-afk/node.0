-- Stock-takes with variance, the day close, and the log of what a track-and-trace report would contain.

CREATE TABLE stocktakes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'cancelled')),
  note         text,
  started_by   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at   timestamptz NOT NULL DEFAULT now(),
  approved_by  uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at  timestamptz
);
-- one count at a time per branch
CREATE UNIQUE INDEX stocktakes_one_open ON stocktakes (branch_id) WHERE status = 'open';
SELECT dawa_protect('stocktakes');

CREATE TABLE stocktake_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  stocktake_id  uuid NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  batch_id      uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
  expected_qty  int NOT NULL CHECK (expected_qty >= 0),
  counted_qty   int CHECK (counted_qty IS NULL OR counted_qty >= 0),
  UNIQUE (stocktake_id, batch_id)
);
SELECT dawa_protect('stocktake_lines');

-- A closed day: what the till should hold against what was counted, per cashier and in total.
CREATE TABLE day_closes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id           uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  business_day        date NOT NULL,
  sales_count         int NOT NULL,
  voids_count         int NOT NULL,
  expected_cash_cents bigint NOT NULL,
  counted_cash_cents  bigint NOT NULL CHECK (counted_cash_cents >= 0),
  cash_variance_cents bigint NOT NULL,
  mpesa_cents         bigint NOT NULL,
  credit_cents        bigint NOT NULL,
  pending_cents       bigint NOT NULL,
  note                text,
  closed_by           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  closed_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, business_day)
);
CREATE INDEX day_closes_org_idx ON day_closes (org_id, business_day DESC);
SELECT dawa_protect('day_closes');
SELECT dawa_append_only('day_closes');

CREATE TABLE day_close_cashiers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  day_close_id        uuid NOT NULL REFERENCES day_closes(id) ON DELETE CASCADE,
  cashier_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expected_cash_cents bigint NOT NULL,
  counted_cash_cents  bigint NOT NULL CHECK (counted_cash_cents >= 0),
  variance_cents      bigint NOT NULL
);
SELECT dawa_protect('day_close_cashiers');
SELECT dawa_append_only('day_close_cashiers');

-- What a track-and-trace report WOULD contain, captured in the same transaction as the stock change that
-- causes it. NOTHING IN THIS TABLE IS SENT ANYWHERE. No national platform's interface has been published to
-- Dawa, so status stays 'pending' and the table is an exportable internal log, not an official format.
CREATE TABLE ntts_outbox (
  id           bigserial PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  event_type   text NOT NULL CHECK (event_type IN ('receipt', 'dispense', 'sale', 'return', 'adjustment', 'writeoff')),
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  gtin         text,
  batch_no     text,
  expiry_date  date,
  serial       text,
  qty          int NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending')),
  ref_id       uuid
);
CREATE INDEX ntts_outbox_org_idx ON ntts_outbox (org_id, occurred_at DESC);
SELECT dawa_protect('ntts_outbox');
SELECT dawa_append_only('ntts_outbox');
