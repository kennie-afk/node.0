-- Electronic dispensing records and the controlled-drug register.

-- One row per prescription line dispensed: who it was for, who prescribed it, who dispensed it. Never edited.
CREATE TABLE dispensing_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id         uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sale_id           uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  sale_line_id      uuid NOT NULL REFERENCES sale_lines(id) ON DELETE RESTRICT,
  product_id        uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty               int NOT NULL CHECK (qty > 0),
  patient_name      text NOT NULL,
  patient_phone     text,
  patient_age_years int CHECK (patient_age_years IS NULL OR (patient_age_years >= 0 AND patient_age_years <= 130)),
  patient_sex       text CHECK (patient_sex IS NULL OR patient_sex IN ('female', 'male', 'other')),
  prescriber_name   text NOT NULL,
  prescriber_reg_no text,
  prescription_ref  text,
  directions        text,
  dispensed_by      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  witness_id        uuid REFERENCES users(id) ON DELETE RESTRICT,
  dispensed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispensing_branch_time_idx ON dispensing_records (branch_id, dispensed_at DESC);
CREATE INDEX dispensing_product_idx ON dispensing_records (org_id, product_id);
SELECT dawa_protect('dispensing_records');
SELECT dawa_append_only('dispensing_records');

-- Running balance per controlled product per branch. The row is locked while a movement is written, so the
-- balance_after recorded on every register entry is always the true one.
CREATE TABLE controlled_balances (
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  balance     int NOT NULL DEFAULT 0 CHECK (balance >= 0),
  PRIMARY KEY (branch_id, product_id)
);
SELECT dawa_protect('controlled_balances');

CREATE TABLE controlled_register (
  id            bigserial PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  kind          text NOT NULL CHECK (kind IN ('receive', 'dispense', 'adjustment', 'writeoff')),
  qty_delta     int NOT NULL CHECK (qty_delta <> 0),
  balance_after int NOT NULL CHECK (balance_after >= 0),
  batch_no      text,
  patient_name  text,
  prescriber    text,
  ref_type      text,
  ref_id        uuid,
  reason        text,
  actor_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- the second person who confirmed the entry: always someone other than the actor
  witness_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (witness_id <> actor_id)
);
CREATE INDEX controlled_register_product_idx ON controlled_register (branch_id, product_id, id);
SELECT dawa_protect('controlled_register');
SELECT dawa_append_only('controlled_register');
