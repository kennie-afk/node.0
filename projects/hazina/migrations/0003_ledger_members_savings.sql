-- The double-entry ledger, members (borrowers for a lender), and savings/shares/deposits.
--
-- The ledger is the single source of truth for money. Journal entries and their lines are append-only (the application
-- role cannot UPDATE or DELETE them), an entry cannot be unbalanced (a deferred trigger checks it at commit), an entry
-- cannot gain lines after it was written (a BEFORE trigger counts them against the line_count it declared), and entry
-- numbers per organisation have no gaps (they come from a counter row that is locked until the transaction ends).
-- A mistake is corrected by posting a reversing entry, never by editing history.

CREATE TABLE org_counters (
  org_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name    text NOT NULL,
  value   bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, name)
);
SELECT hazina_protect('org_counters');

CREATE TABLE accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  code        text NOT NULL CHECK (code ~ '^[0-9]{4,8}$'),
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  -- system accounts are the ones the product posts to; they cannot be deactivated
  is_system   boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
SELECT hazina_protect('accounts');

CREATE TABLE members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  member_no      text NOT NULL,
  full_name      text NOT NULL,
  id_number      text,
  phone          text,
  kra_pin        text,
  date_of_birth  date,
  gender         text CHECK (gender IN ('female', 'male', 'other')),
  employer       text,
  occupation     text,
  next_of_kin    jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dormant', 'exited')),
  joined_on      date NOT NULL DEFAULT current_date,
  exited_on      date,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, member_no)
);
CREATE UNIQUE INDEX members_id_number_unique ON members (org_id, id_number) WHERE id_number IS NOT NULL;
CREATE INDEX members_org_name_idx ON members (org_id, lower(full_name));
CREATE INDEX members_org_phone_idx ON members (org_id, phone);
SELECT hazina_protect('members');

CREATE TABLE journal_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  seq          bigint NOT NULL,
  entry_date   date NOT NULL,
  memo         text NOT NULL,
  source_type  text NOT NULL,
  source_id    uuid,
  line_count   int NOT NULL CHECK (line_count >= 2),
  total_cents  bigint NOT NULL CHECK (total_cents > 0),
  posted_by    uuid,
  -- set on a reversing entry: the entry it cancels. An entry can be reversed once.
  reverses     uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, seq)
);
CREATE UNIQUE INDEX journal_entries_reversed_once ON journal_entries (org_id, reverses) WHERE reverses IS NOT NULL;
CREATE INDEX journal_entries_date_idx ON journal_entries (org_id, entry_date, seq);
CREATE INDEX journal_entries_source_idx ON journal_entries (org_id, source_type, source_id);
SELECT hazina_protect('journal_entries');
SELECT hazina_append_only('journal_entries');

CREATE TABLE journal_lines (
  id            bigserial PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  entry_id      uuid NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  line_no       int NOT NULL,
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  -- the sub-ledger: whose savings, whose loan. Nullable for lines that belong to no one in particular.
  member_id     uuid REFERENCES members(id) ON DELETE RESTRICT,
  loan_id       uuid,
  debit_cents   bigint NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents  bigint NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  CHECK ((debit_cents > 0) <> (credit_cents > 0)),
  UNIQUE (entry_id, line_no)
);
CREATE INDEX journal_lines_account_idx ON journal_lines (org_id, account_id);
CREATE INDEX journal_lines_member_idx ON journal_lines (org_id, member_id, account_id) WHERE member_id IS NOT NULL;
CREATE INDEX journal_lines_loan_idx ON journal_lines (org_id, loan_id, account_id) WHERE loan_id IS NOT NULL;
SELECT hazina_protect('journal_lines');
SELECT hazina_append_only('journal_lines');

-- No line may be added to an entry that already has all the lines it declared.
CREATE OR REPLACE FUNCTION journal_line_before_insert() RETURNS trigger AS $$
DECLARE
  declared int;
  existing int;
BEGIN
  SELECT line_count INTO declared FROM journal_entries WHERE id = NEW.entry_id;
  IF declared IS NULL THEN
    RAISE EXCEPTION 'journal line refers to an unknown entry' USING ERRCODE = '23503';
  END IF;
  SELECT count(*) INTO existing FROM journal_lines WHERE entry_id = NEW.entry_id;
  IF existing >= declared THEN
    RAISE EXCEPTION 'journal entry % already has its % lines; history is not edited', NEW.entry_id, declared USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER journal_lines_before_insert BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION journal_line_before_insert();

-- At commit, every entry touched must be complete and balanced.
CREATE OR REPLACE FUNCTION journal_entry_is_balanced() RETURNS trigger AS $$
DECLARE
  declared int;
  declared_total bigint;
  lines int;
  debits bigint;
  credits bigint;
BEGIN
  SELECT line_count, total_cents INTO declared, declared_total FROM journal_entries WHERE id = NEW.entry_id;
  SELECT count(*), COALESCE(sum(debit_cents), 0), COALESCE(sum(credit_cents), 0) INTO lines, debits, credits
    FROM journal_lines WHERE entry_id = NEW.entry_id;
  IF lines <> declared THEN
    RAISE EXCEPTION 'journal entry % declared % lines but has %', NEW.entry_id, declared, lines USING ERRCODE = '23514';
  END IF;
  IF debits <> credits OR debits <> declared_total THEN
    RAISE EXCEPTION 'journal entry % is not balanced (debits %, credits %, declared %)', NEW.entry_id, debits, credits, declared_total USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_is_balanced();

-- Savings, shares and deposits. The ledger holds the balance; this table is the member-facing record and the
-- approval queue for large withdrawals (a second person approves, and only then does the ledger entry exist).
CREATE TABLE savings_txns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  member_id         uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  product           text NOT NULL CHECK (product IN ('savings', 'shares', 'deposits')),
  kind              text NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
  amount_cents      bigint NOT NULL CHECK (amount_cents > 0),
  channel           text NOT NULL CHECK (channel IN ('cash', 'mpesa', 'bank', 'transfer')),
  reference         text,
  status            text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'pending_approval', 'rejected')),
  requested_by      uuid,
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text,
  journal_entry_id  uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  occurred_on       date NOT NULL DEFAULT current_date,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX savings_txns_member_idx ON savings_txns (org_id, member_id, created_at DESC);
CREATE INDEX savings_txns_pending_idx ON savings_txns (org_id) WHERE status = 'pending_approval';
SELECT hazina_protect('savings_txns');
REVOKE DELETE ON savings_txns FROM hazina_app;
