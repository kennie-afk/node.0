'use strict';

const { enableTenantRls, dropTenantRls, makeAppendOnly } = require('../migrations-lib/tenant');

/**
 * The double-entry core. Everything that matters is enforced by the database itself, below the
 * application, so a bug or a hand-written UPDATE cannot quietly corrupt the books:
 *   - composite foreign keys keep every reference inside one church;
 *   - a deferred constraint trigger rejects, at COMMIT, any entry whose debits and credits do not
 *     balance overall AND within each fund;
 *   - a trigger refuses posting into a period that is not open;
 *   - journal lines and the audit log are append-only; an entry can only ever gain a
 *     `reversed_by_entry_id` and nothing else;
 *   - journal_lines is hash-partitioned by church, so every tenant query prunes to one partition.
 */
const PARTITIONS = 16;

const TABLES_WITH_RLS = [
  'finance_settings',
  'finance_chain',
  'funds',
  'accounts',
  'fiscal_years',
  'fiscal_periods',
  'journal_entries',
  'journal_lines',
  'ledger_balances',
  'audit_events',
  'idempotency_keys',
  'finance_counters'
];

module.exports = {
  async up(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE finance_settings (
          church_id integer PRIMARY KEY REFERENCES churches(id) ON DELETE RESTRICT,
          base_currency char(3) NOT NULL DEFAULT 'KES',
          fiscal_year_start_month smallint NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
          approval_threshold_minor bigint NOT NULL DEFAULT 0 CHECK (approval_threshold_minor >= 0),
          dual_approval_threshold_minor bigint NOT NULL DEFAULT 10000000 CHECK (dual_approval_threshold_minor >= 0),
          require_separation_of_duties boolean NOT NULL DEFAULT true,
          allow_restricted_overspend boolean NOT NULL DEFAULT false,
          receipt_prefix varchar(10) NOT NULL DEFAULT 'RCT',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);

      // One row per church. Locking it (SELECT ... FOR UPDATE) serialises ledger and audit
      // writes for that church only, which is what makes entry numbers gapless and the hash
      // chains linear without a global lock.
      await q(`
        CREATE TABLE finance_chain (
          church_id integer PRIMARY KEY REFERENCES churches(id) ON DELETE RESTRICT,
          next_entry_no bigint NOT NULL DEFAULT 1,
          last_entry_hash char(64) NOT NULL DEFAULT repeat('0', 64),
          next_audit_seq bigint NOT NULL DEFAULT 1,
          last_audit_hash char(64) NOT NULL DEFAULT repeat('0', 64),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);

      await q(`
        CREATE TABLE finance_counters (
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          name varchar(40) NOT NULL,
          value bigint NOT NULL DEFAULT 0,
          PRIMARY KEY (church_id, name)
        )`);

      await q(`
        CREATE TABLE funds (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          code varchar(20) NOT NULL,
          name varchar(120) NOT NULL,
          description varchar(500),
          restriction varchar(30) NOT NULL DEFAULT 'UNRESTRICTED'
            CHECK (restriction IN ('UNRESTRICTED','TEMPORARILY_RESTRICTED','PERMANENTLY_RESTRICTED')),
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, code),
          UNIQUE (church_id, id)
        )`);

      await q(`
        CREATE TABLE accounts (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          code varchar(12) NOT NULL,
          name varchar(150) NOT NULL,
          type varchar(10) NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
          parent_id bigint,
          is_postable boolean NOT NULL DEFAULT true,
          is_active boolean NOT NULL DEFAULT true,
          system_key varchar(40),
          description varchar(500),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, code),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, parent_id) REFERENCES accounts (church_id, id)
        )`);
      await q(`CREATE UNIQUE INDEX accounts_system_key_unique ON accounts (church_id, system_key) WHERE system_key IS NOT NULL`);

      await q(`
        CREATE TABLE fiscal_years (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          name varchar(40) NOT NULL,
          start_date date NOT NULL,
          end_date date NOT NULL,
          status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
          closed_at timestamptz,
          closed_by integer,
          closing_entry_id bigint,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CHECK (end_date > start_date),
          UNIQUE (church_id, name),
          UNIQUE (church_id, start_date),
          UNIQUE (church_id, id)
        )`);

      await q(`
        CREATE TABLE fiscal_periods (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          fiscal_year_id bigint NOT NULL,
          number smallint NOT NULL,
          name varchar(40) NOT NULL,
          start_date date NOT NULL,
          end_date date NOT NULL,
          status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','LOCKED')),
          closed_at timestamptz,
          closed_by integer,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CHECK (end_date >= start_date),
          UNIQUE (church_id, fiscal_year_id, number),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, fiscal_year_id) REFERENCES fiscal_years (church_id, id)
        )`);
      await q(`CREATE INDEX fiscal_periods_dates ON fiscal_periods (church_id, start_date, end_date)`);

      await q(`
        CREATE TABLE journal_entries (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          entry_no bigint NOT NULL,
          entry_date date NOT NULL,
          period_id bigint NOT NULL,
          memo varchar(500) NOT NULL,
          source_type varchar(30) NOT NULL,
          source_id varchar(40),
          reverses_entry_id bigint,
          reversed_by_entry_id bigint,
          total_minor bigint NOT NULL CHECK (total_minor > 0),
          created_by integer,
          posted_at timestamptz NOT NULL,
          idempotency_key varchar(80),
          prev_hash char(64) NOT NULL,
          hash char(64) NOT NULL,
          UNIQUE (church_id, entry_no),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, period_id) REFERENCES fiscal_periods (church_id, id),
          FOREIGN KEY (church_id, reverses_entry_id) REFERENCES journal_entries (church_id, id),
          FOREIGN KEY (church_id, reversed_by_entry_id) REFERENCES journal_entries (church_id, id)
        )`);
      await q(`CREATE UNIQUE INDEX journal_entries_idempotency ON journal_entries (church_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);
      await q(`CREATE INDEX journal_entries_date ON journal_entries (church_id, entry_date, id)`);
      await q(`CREATE INDEX journal_entries_source ON journal_entries (church_id, source_type, source_id)`);
      await q(`CREATE UNIQUE INDEX journal_entries_one_reversal ON journal_entries (church_id, reverses_entry_id) WHERE reverses_entry_id IS NOT NULL`);

      await q(`
        CREATE TABLE journal_lines (
          id bigserial,
          church_id integer NOT NULL,
          entry_id bigint NOT NULL,
          line_no smallint NOT NULL,
          account_id bigint NOT NULL,
          fund_id bigint NOT NULL,
          debit_minor bigint NOT NULL DEFAULT 0,
          credit_minor bigint NOT NULL DEFAULT 0,
          member_id integer,
          ministry_id integer,
          memo varchar(255),
          entry_date date NOT NULL,
          period_id bigint NOT NULL,
          PRIMARY KEY (church_id, id),
          CHECK (debit_minor >= 0 AND credit_minor >= 0),
          CHECK ((debit_minor = 0) <> (credit_minor = 0)),
          FOREIGN KEY (church_id, entry_id) REFERENCES journal_entries (church_id, id),
          FOREIGN KEY (church_id, account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id),
          FOREIGN KEY (church_id, period_id) REFERENCES fiscal_periods (church_id, id)
        ) PARTITION BY HASH (church_id)`);
      for (let i = 0; i < PARTITIONS; i += 1) {
        await q(`CREATE TABLE journal_lines_p${i} PARTITION OF journal_lines FOR VALUES WITH (MODULUS ${PARTITIONS}, REMAINDER ${i})`);
      }
      await q(`CREATE INDEX journal_lines_account ON journal_lines (church_id, account_id, entry_date, id)`);
      await q(`CREATE INDEX journal_lines_fund ON journal_lines (church_id, fund_id, entry_date)`);
      await q(`CREATE INDEX journal_lines_entry ON journal_lines (church_id, entry_id)`);
      await q(`CREATE INDEX journal_lines_member ON journal_lines (church_id, member_id, entry_date) WHERE member_id IS NOT NULL`);
      await q(`CREATE INDEX journal_lines_ministry ON journal_lines (church_id, ministry_id, entry_date) WHERE ministry_id IS NOT NULL`);

      // Running totals per (period, account, fund), maintained in the same transaction as every
      // posting, so statements read a few hundred rows instead of scanning the journal.
      await q(`
        CREATE TABLE ledger_balances (
          church_id integer NOT NULL,
          period_id bigint NOT NULL,
          account_id bigint NOT NULL,
          fund_id bigint NOT NULL,
          debit_minor bigint NOT NULL DEFAULT 0,
          credit_minor bigint NOT NULL DEFAULT 0,
          PRIMARY KEY (church_id, period_id, account_id, fund_id),
          FOREIGN KEY (church_id, period_id) REFERENCES fiscal_periods (church_id, id),
          FOREIGN KEY (church_id, account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id)
        )`);
      await q(`CREATE INDEX ledger_balances_account ON ledger_balances (church_id, account_id, fund_id)`);

      await q(`
        CREATE TABLE audit_events (
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          seq bigint NOT NULL,
          actor_id integer,
          action varchar(60) NOT NULL,
          entity_type varchar(40) NOT NULL,
          entity_id varchar(40),
          data jsonb NOT NULL DEFAULT '{}'::jsonb,
          occurred_at timestamptz NOT NULL,
          prev_hash char(64) NOT NULL,
          hash char(64) NOT NULL,
          PRIMARY KEY (church_id, seq)
        )`);
      await q(`CREATE INDEX audit_events_entity ON audit_events (church_id, entity_type, entity_id)`);

      await q(`
        CREATE TABLE idempotency_keys (
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          key varchar(80) NOT NULL,
          method varchar(10) NOT NULL,
          path varchar(200) NOT NULL,
          request_hash char(64) NOT NULL,
          status_code smallint NOT NULL,
          response jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (church_id, key)
        )`);
      await q(`CREATE INDEX idempotency_keys_age ON idempotency_keys (created_at)`);

      // ---- Invariants enforced by the database -------------------------------------------

      await q(`
        CREATE OR REPLACE FUNCTION journal_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE p record;
        BEGIN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'journal entries can never be deleted; post a reversal instead' USING ERRCODE = '42501';
          END IF;
          IF TG_OP = 'UPDATE' THEN
            IF NEW.reversed_by_entry_id IS NOT NULL AND OLD.reversed_by_entry_id IS NULL
               AND (to_jsonb(NEW) - 'reversed_by_entry_id') = (to_jsonb(OLD) - 'reversed_by_entry_id') THEN
              RETURN NEW;
            END IF;
            RAISE EXCEPTION 'a posted journal entry is immutable; post a reversal instead' USING ERRCODE = '42501';
          END IF;
          SELECT status, start_date, end_date INTO p FROM fiscal_periods
           WHERE church_id = NEW.church_id AND id = NEW.period_id;
          IF p.status IS DISTINCT FROM 'OPEN' THEN
            RAISE EXCEPTION 'fiscal period is % and cannot take postings', COALESCE(p.status, 'missing') USING ERRCODE = '55000';
          END IF;
          IF NEW.entry_date < p.start_date OR NEW.entry_date > p.end_date THEN
            RAISE EXCEPTION 'entry date % is outside the fiscal period', NEW.entry_date USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END $$;`);
      await q(`CREATE TRIGGER journal_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
                 FOR EACH ROW EXECUTE FUNCTION journal_entry_guard()`);

      await q(`
        CREATE OR REPLACE FUNCTION journal_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE bad record; totals record;
        BEGIN
          SELECT COALESCE(SUM(debit_minor),0) AS d, COALESCE(SUM(credit_minor),0) AS c, COUNT(*) AS n
            INTO totals FROM journal_lines WHERE church_id = NEW.church_id AND entry_id = NEW.id;
          IF totals.n < 2 THEN
            RAISE EXCEPTION 'journal entry % needs at least two lines', NEW.entry_no USING ERRCODE = '23514';
          END IF;
          IF totals.d <> totals.c OR totals.d <> NEW.total_minor THEN
            RAISE EXCEPTION 'journal entry % is unbalanced (debits %, credits %, header %)',
              NEW.entry_no, totals.d, totals.c, NEW.total_minor USING ERRCODE = '23514';
          END IF;
          SELECT fund_id, SUM(debit_minor) AS d, SUM(credit_minor) AS c INTO bad
            FROM journal_lines WHERE church_id = NEW.church_id AND entry_id = NEW.id
           GROUP BY fund_id HAVING SUM(debit_minor) <> SUM(credit_minor) LIMIT 1;
          IF FOUND THEN
            RAISE EXCEPTION 'journal entry % does not balance within fund % (debits %, credits %); use an interfund transfer',
              NEW.entry_no, bad.fund_id, bad.d, bad.c USING ERRCODE = '23514';
          END IF;
          RETURN NULL;
        END $$;`);
      await q(`CREATE CONSTRAINT TRIGGER journal_entry_balanced AFTER INSERT ON journal_entries
                 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced()`);

      await makeAppendOnly(qi, 'journal_lines', { transaction });
      await makeAppendOnly(qi, 'audit_events', { transaction });

      for (const table of TABLES_WITH_RLS) {
        await enableTenantRls(qi, table, { transaction });
      }
      for (let i = 0; i < PARTITIONS; i += 1) {
        await enableTenantRls(qi, `journal_lines_p${i}`, { transaction });
      }
    });
  },

  async down(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });
      for (const table of [
        'idempotency_keys', 'audit_events', 'ledger_balances', 'journal_lines', 'journal_entries',
        'fiscal_periods', 'fiscal_years', 'accounts', 'funds', 'finance_counters', 'finance_chain',
        'finance_settings'
      ]) {
        await q(`DROP TABLE IF EXISTS ${table} CASCADE`);
      }
      await q('DROP FUNCTION IF EXISTS journal_entry_guard() CASCADE');
      await q('DROP FUNCTION IF EXISTS journal_entry_balanced() CASCADE');
      await q('DROP FUNCTION IF EXISTS journal_lines_append_only() CASCADE');
      await q('DROP FUNCTION IF EXISTS audit_events_append_only() CASCADE');
    });
  }
};
