-- M-Pesa money is booked to a suspense liability the moment it is received; applying it clears the suspense.
-- receipt_entry_id is that first entry. Payments received before this migration have none and are applied the old way.
ALTER TABLE mpesa_payments ADD COLUMN receipt_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT;
CREATE INDEX mpesa_payments_day_idx ON mpesa_payments (org_id, received_at, id);

-- Cumulative balance of every account as at the end of a date (month end). A report for a date adds only the lines after the
-- latest snapshot instead of scanning the whole journal. Snapshots exist only for dates inside a locked period, where the
-- ledger refuses new entries, so they cannot go stale; unlocking a period deletes the snapshots it covered.
CREATE TABLE ledger_snapshots (
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  as_of         date NOT NULL,
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  debit_cents   bigint NOT NULL,
  credit_cents  bigint NOT NULL,
  PRIMARY KEY (org_id, as_of, account_id)
);
SELECT hazina_protect('ledger_snapshots');
