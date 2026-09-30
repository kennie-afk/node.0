'use strict';

const { enableTenantRls, dropTenantRls } = require('../migrations-lib/tenant');

/**
 * Giving: types mapped to income accounts and funds, counting batches with dual control,
 * campaigns, pledges and recurring schedules, plus the ledger/receipt columns on the legacy
 * `contribution` table. Every reference is a composite (church_id, id) foreign key.
 */
const NEW_TABLES = ['giving_types', 'giving_batches', 'giving_campaigns', 'pledges', 'recurring_gifts'];

module.exports = {
  async up(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE giving_types (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          code varchar(20) NOT NULL,
          name varchar(100) NOT NULL,
          income_account_id bigint NOT NULL,
          default_fund_id bigint,
          tax_deductible boolean NOT NULL DEFAULT false,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, code),
          UNIQUE (church_id, name),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, income_account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, default_fund_id) REFERENCES funds (church_id, id)
        )`);

      await q(`
        CREATE TABLE giving_batches (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          batch_no bigint NOT NULL,
          name varchar(150) NOT NULL,
          service_date date NOT NULL,
          status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COUNTED','POSTED')),
          deposit_account_id bigint NOT NULL,
          created_by integer NOT NULL,
          counted_by integer,
          counted_at timestamptz,
          counted_total_minor bigint,
          verified_by integer,
          posted_at timestamptz,
          journal_entry_id bigint,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, batch_no),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, deposit_account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, journal_entry_id) REFERENCES journal_entries (church_id, id)
        )`);

      await q(`
        CREATE TABLE giving_campaigns (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          name varchar(150) NOT NULL,
          description varchar(1000),
          goal_minor bigint NOT NULL DEFAULT 0 CHECK (goal_minor >= 0),
          start_date date NOT NULL,
          end_date date,
          fund_id bigint,
          status varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, name),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id)
        )`);

      await q(`
        CREATE TABLE pledges (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          member_id integer NOT NULL,
          campaign_id bigint,
          giving_type_id bigint,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          installment_minor bigint CHECK (installment_minor IS NULL OR installment_minor > 0),
          frequency varchar(10) NOT NULL DEFAULT 'ONE_TIME' CHECK (frequency IN ('ONE_TIME','WEEKLY','MONTHLY','QUARTERLY','ANNUAL')),
          start_date date NOT NULL,
          end_date date,
          status varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FULFILLED','CANCELLED')),
          notes varchar(500),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id),
          FOREIGN KEY (church_id, campaign_id) REFERENCES giving_campaigns (church_id, id),
          FOREIGN KEY (church_id, giving_type_id) REFERENCES giving_types (church_id, id)
        )`);
      await q(`CREATE INDEX pledges_member ON pledges (church_id, member_id)`);
      await q(`CREATE INDEX pledges_campaign ON pledges (church_id, campaign_id)`);

      await q(`
        CREATE TABLE recurring_gifts (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          member_id integer NOT NULL,
          giving_type_id bigint NOT NULL,
          fund_id bigint,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          frequency varchar(10) NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY','QUARTERLY','ANNUAL')),
          payment_method varchar(100),
          deposit_account_id bigint,
          pledge_id bigint,
          start_date date NOT NULL,
          end_date date,
          next_due_date date NOT NULL,
          status varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ENDED')),
          last_generated_date date,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id),
          FOREIGN KEY (church_id, giving_type_id) REFERENCES giving_types (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id),
          FOREIGN KEY (church_id, deposit_account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, pledge_id) REFERENCES pledges (church_id, id)
        )`);
      await q(`CREATE INDEX recurring_gifts_due ON recurring_gifts (church_id, next_due_date) WHERE status = 'ACTIVE'`);

      // ---- the legacy contribution table -------------------------------------------------
      await q(`ALTER TABLE contribution ALTER COLUMN amount TYPE numeric(14,2)`);
      await q(`ALTER TABLE contribution
        ADD COLUMN fund_id bigint,
        ADD COLUMN giving_type_id bigint,
        ADD COLUMN journal_entry_id bigint,
        ADD COLUMN receipt_no varchar(30),
        ADD COLUMN status varchar(10) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOID','PENDING')),
        ADD COLUMN void_reason varchar(300),
        ADD COLUMN voided_at timestamptz,
        ADD COLUMN voided_by integer,
        ADD COLUMN deposit_account_id bigint,
        ADD COLUMN batch_id bigint,
        ADD COLUMN pledge_id bigint,
        ADD COLUMN campaign_id bigint,
        ADD COLUMN source varchar(20) NOT NULL DEFAULT 'MANUAL',
        ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false,
        ADD COLUMN tax_deductible boolean NOT NULL DEFAULT false,
        ADD COLUMN recorded_by integer`);
      await q(`CREATE UNIQUE INDEX contribution_church_receipt_no_unique ON contribution (church_id, receipt_no) WHERE receipt_no IS NOT NULL`);
      await q(`CREATE INDEX contribution_member_date ON contribution (church_id, member_id, contribution_date)`);
      await q(`CREATE INDEX contribution_date ON contribution (church_id, contribution_date DESC, id DESC)`);
      await q(`CREATE INDEX contribution_batch ON contribution (church_id, batch_id) WHERE batch_id IS NOT NULL`);
      await q(`CREATE INDEX contribution_pledge ON contribution (church_id, pledge_id) WHERE pledge_id IS NOT NULL`);
      await q(`CREATE INDEX contribution_campaign ON contribution (church_id, campaign_id) WHERE campaign_id IS NOT NULL`);
      await q(`ALTER TABLE contribution
        ADD FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id),
        ADD FOREIGN KEY (church_id, giving_type_id) REFERENCES giving_types (church_id, id),
        ADD FOREIGN KEY (church_id, journal_entry_id) REFERENCES journal_entries (church_id, id),
        ADD FOREIGN KEY (church_id, deposit_account_id) REFERENCES accounts (church_id, id),
        ADD FOREIGN KEY (church_id, batch_id) REFERENCES giving_batches (church_id, id),
        ADD FOREIGN KEY (church_id, pledge_id) REFERENCES pledges (church_id, id),
        ADD FOREIGN KEY (church_id, campaign_id) REFERENCES giving_campaigns (church_id, id)`);

      for (const table of NEW_TABLES) {
        await enableTenantRls(qi, table, { transaction });
      }
    });
  },

  async down(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });
      await q(`ALTER TABLE contribution
        DROP COLUMN IF EXISTS fund_id, DROP COLUMN IF EXISTS giving_type_id, DROP COLUMN IF EXISTS journal_entry_id,
        DROP COLUMN IF EXISTS receipt_no, DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS void_reason,
        DROP COLUMN IF EXISTS voided_at, DROP COLUMN IF EXISTS voided_by, DROP COLUMN IF EXISTS deposit_account_id,
        DROP COLUMN IF EXISTS batch_id, DROP COLUMN IF EXISTS pledge_id, DROP COLUMN IF EXISTS campaign_id,
        DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS is_anonymous, DROP COLUMN IF EXISTS tax_deductible,
        DROP COLUMN IF EXISTS recorded_by`);
      await q(`ALTER TABLE contribution ALTER COLUMN amount TYPE numeric(10,2)`);
      for (const table of ['recurring_gifts', 'pledges', 'giving_campaigns', 'giving_batches', 'giving_types']) {
        await dropTenantRls(qi, table, { transaction });
        await q(`DROP TABLE IF EXISTS ${table} CASCADE`);
      }
    });
  }
};
