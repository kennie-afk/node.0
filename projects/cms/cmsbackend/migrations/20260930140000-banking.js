'use strict';

const { enableTenantRls } = require('../migrations-lib/tenant');

const TABLES = ['bank_accounts', 'bank_statements', 'bank_statement_lines', 'reconciliations', 'bank_matches'];

/**
 * Bank and cash accounts, imported statements, matching of statement lines to ledger lines, and
 * reconciliations. A finalised reconciliation, and every match inside one, is immutable: the
 * database refuses the edit even if the application is bypassed.
 */
module.exports = {
  async up(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE bank_accounts (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          name varchar(120) NOT NULL,
          kind varchar(14) NOT NULL CHECK (kind IN ('CASH','BANK','MPESA_PAYBILL','MPESA_TILL','PETTY_CASH')),
          gl_account_id bigint NOT NULL,
          account_number varchar(40),
          currency char(3) NOT NULL DEFAULT 'KES',
          float_minor bigint CHECK (float_minor IS NULL OR float_minor >= 0),
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          UNIQUE (church_id, gl_account_id),
          UNIQUE (church_id, name),
          FOREIGN KEY (church_id, gl_account_id) REFERENCES accounts (church_id, id)
        )`);

      await q(`
        CREATE TABLE bank_statements (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          bank_account_id bigint NOT NULL,
          label varchar(120),
          period_start date,
          period_end date,
          opening_balance_minor bigint,
          closing_balance_minor bigint,
          source varchar(8) NOT NULL DEFAULT 'JSON' CHECK (source IN ('JSON','CSV')),
          line_count integer NOT NULL DEFAULT 0,
          imported_by integer,
          imported_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, bank_account_id) REFERENCES bank_accounts (church_id, id)
        )`);

      await q(`
        CREATE TABLE reconciliations (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          bank_account_id bigint NOT NULL,
          statement_date date NOT NULL,
          statement_balance_minor bigint NOT NULL,
          opening_balance_minor bigint NOT NULL DEFAULT 0,
          status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FINALIZED')),
          cleared_balance_minor bigint,
          difference_minor bigint,
          created_by integer,
          finalized_by integer,
          finalized_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, bank_account_id) REFERENCES bank_accounts (church_id, id)
        )`);
      await q(`CREATE UNIQUE INDEX reconciliations_one_open ON reconciliations (church_id, bank_account_id) WHERE status = 'OPEN'`);
      await q(`CREATE UNIQUE INDEX reconciliations_date ON reconciliations (church_id, bank_account_id, statement_date) WHERE status = 'FINALIZED'`);

      await q(`
        CREATE TABLE bank_statement_lines (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          statement_id bigint NOT NULL,
          bank_account_id bigint NOT NULL,
          txn_date date NOT NULL,
          description varchar(300) NOT NULL DEFAULT '',
          reference varchar(80),
          amount_minor bigint NOT NULL CHECK (amount_minor <> 0),
          balance_minor bigint,
          dedupe_key varchar(90) NOT NULL,
          status varchar(10) NOT NULL DEFAULT 'UNMATCHED' CHECK (status IN ('UNMATCHED','MATCHED','IGNORED','RECONCILED')),
          ignore_reason varchar(300),
          reconciliation_id bigint,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          UNIQUE (church_id, bank_account_id, dedupe_key),
          FOREIGN KEY (church_id, statement_id) REFERENCES bank_statements (church_id, id),
          FOREIGN KEY (church_id, bank_account_id) REFERENCES bank_accounts (church_id, id),
          FOREIGN KEY (church_id, reconciliation_id) REFERENCES reconciliations (church_id, id)
        )`);
      await q(`CREATE INDEX bank_lines_status ON bank_statement_lines (church_id, bank_account_id, status, txn_date)`);
      await q(`CREATE INDEX bank_lines_date ON bank_statement_lines (church_id, bank_account_id, txn_date DESC, id DESC)`);

      // A statement line can match several ledger lines (one deposit, many receipts), but a
      // ledger line clears against at most one statement line.
      await q(`
        CREATE TABLE bank_matches (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          statement_line_id bigint NOT NULL,
          journal_line_id bigint NOT NULL,
          amount_minor bigint NOT NULL,
          reconciliation_id bigint,
          matched_by integer,
          matched_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, journal_line_id),
          FOREIGN KEY (church_id, statement_line_id) REFERENCES bank_statement_lines (church_id, id) ON DELETE CASCADE,
          FOREIGN KEY (church_id, journal_line_id) REFERENCES journal_lines (church_id, id),
          FOREIGN KEY (church_id, reconciliation_id) REFERENCES reconciliations (church_id, id)
        )`);
      await q(`CREATE INDEX bank_matches_line ON bank_matches (church_id, statement_line_id)`);

      await q(`
        CREATE OR REPLACE FUNCTION reconciliation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            IF OLD.status = 'FINALIZED' THEN
              RAISE EXCEPTION 'a finalized reconciliation cannot be deleted' USING ERRCODE = '42501';
            END IF;
            RETURN OLD;
          END IF;
          IF OLD.status = 'FINALIZED' THEN
            RAISE EXCEPTION 'a finalized reconciliation is immutable' USING ERRCODE = '42501';
          END IF;
          RETURN NEW;
        END $$;`);
      await q(`CREATE TRIGGER reconciliation_guard BEFORE UPDATE OR DELETE ON reconciliations FOR EACH ROW EXECUTE FUNCTION reconciliation_guard()`);

      await q(`
        CREATE OR REPLACE FUNCTION bank_match_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.reconciliation_id IS NOT NULL AND (TG_OP = 'DELETE' OR NEW.reconciliation_id IS DISTINCT FROM OLD.reconciliation_id
              OR NEW.journal_line_id <> OLD.journal_line_id OR NEW.statement_line_id <> OLD.statement_line_id) THEN
            RAISE EXCEPTION 'a match inside a finalized reconciliation cannot change' USING ERRCODE = '42501';
          END IF;
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END $$;`);
      await q(`CREATE TRIGGER bank_match_guard BEFORE UPDATE OR DELETE ON bank_matches FOR EACH ROW EXECUTE FUNCTION bank_match_guard()`);

      for (const table of TABLES) {
        await enableTenantRls(qi, table, { transaction });
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of ['bank_matches', 'bank_statement_lines', 'reconciliations', 'bank_statements', 'bank_accounts']) {
        await queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`, { transaction });
      }
      await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS reconciliation_guard() CASCADE', { transaction });
      await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS bank_match_guard() CASCADE', { transaction });
    });
  }
};
