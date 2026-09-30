'use strict';

const { enableTenantRls, dropTenantRls } = require('../migrations-lib/tenant');

/** M-Pesa receipts (C2B and STK push) and the suspense inbox for receipts nobody has claimed yet. */
module.exports = {
  async up(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE mpesa_transactions (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          trans_id varchar(40) NOT NULL,
          channel varchar(10) NOT NULL DEFAULT 'C2B' CHECK (channel IN ('C2B','STK')),
          trans_type varchar(40),
          trans_time timestamptz,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          msisdn varchar(80),
          msisdn_normalised varchar(15),
          bill_ref varchar(80),
          shortcode varchar(20),
          payer_name varchar(200),
          status varchar(12) NOT NULL CHECK (status IN ('MATCHED','UNALLOCATED','ALLOCATED','ERROR')),
          member_id integer,
          contribution_id bigint,
          fund_id bigint,
          receipt_entry_id bigint,
          allocation_entry_id bigint,
          error text,
          raw jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, trans_id),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id),
          FOREIGN KEY (church_id, contribution_id) REFERENCES contribution (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id),
          FOREIGN KEY (church_id, receipt_entry_id) REFERENCES journal_entries (church_id, id),
          FOREIGN KEY (church_id, allocation_entry_id) REFERENCES journal_entries (church_id, id)
        )`);
      await q(`CREATE INDEX mpesa_transactions_status ON mpesa_transactions (church_id, status, id DESC)`);

      await q(`
        CREATE TABLE mpesa_stk_requests (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          member_id integer,
          phone varchar(15) NOT NULL,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          account_ref varchar(40) NOT NULL,
          giving_type_id bigint,
          fund_id bigint,
          status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED','CANCELLED')),
          checkout_request_id varchar(80),
          merchant_request_id varchar(80),
          result_code integer,
          result_desc varchar(300),
          mpesa_receipt varchar(40),
          requested_by integer,
          created_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz,
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id),
          FOREIGN KEY (church_id, giving_type_id) REFERENCES giving_types (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id)
        )`);
      await q(`CREATE UNIQUE INDEX mpesa_stk_checkout ON mpesa_stk_requests (church_id, checkout_request_id) WHERE checkout_request_id IS NOT NULL`);

      await enableTenantRls(qi, 'mpesa_transactions', { transaction });
      await enableTenantRls(qi, 'mpesa_stk_requests', { transaction });
    });
  },

  async down(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      for (const table of ['mpesa_stk_requests', 'mpesa_transactions']) {
        await dropTenantRls(qi, table, { transaction });
        await qi.sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`, { transaction });
      }
    });
  }
};
