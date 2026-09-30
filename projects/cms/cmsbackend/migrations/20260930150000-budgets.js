'use strict';

const { enableTenantRls } = require('../migrations-lib/tenant');

const TABLES = ['budgets', 'budget_lines'];

/** Budgets by fiscal year, with one line per account x fund x (optional) ministry x month. */
module.exports = {
  async up(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });
      await q(`
        CREATE TABLE budgets (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          fiscal_year_id bigint NOT NULL,
          name varchar(120) NOT NULL,
          status varchar(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','ACTIVE','CLOSED')),
          notes varchar(500),
          created_by integer,
          approved_by integer,
          approved_at timestamptz,
          activated_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          UNIQUE (church_id, fiscal_year_id, name),
          FOREIGN KEY (church_id, fiscal_year_id) REFERENCES fiscal_years (church_id, id)
        )`);
      // At most one live budget per year: the active one is what spending is measured against.
      await q(`CREATE UNIQUE INDEX budgets_one_active ON budgets (church_id, fiscal_year_id) WHERE status = 'ACTIVE'`);
      await q(`
        CREATE TABLE budget_lines (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          budget_id bigint NOT NULL,
          account_id bigint NOT NULL,
          fund_id bigint NOT NULL,
          ministry_id integer,
          ministry_key integer NOT NULL DEFAULT 0,
          month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
          amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
          UNIQUE (church_id, budget_id, account_id, fund_id, ministry_key, month),
          FOREIGN KEY (church_id, budget_id) REFERENCES budgets (church_id, id) ON DELETE CASCADE,
          FOREIGN KEY (church_id, account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id),
          FOREIGN KEY (church_id, ministry_id) REFERENCES ministries (church_id, id)
        )`);
      await q(`CREATE INDEX budget_lines_lookup ON budget_lines (church_id, account_id, fund_id)`);
      for (const table of TABLES) {
        await enableTenantRls(qi, table, { transaction });
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of [...TABLES].reverse()) {
        await queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`, { transaction });
      }
    });
  }
};
