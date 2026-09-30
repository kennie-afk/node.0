'use strict';

const { enableTenantRls, makeAppendOnly } = require('./tenant');

/**
 * Shared shape of the church-operations migrations: run the DDL, then put every new table under
 * row-level security (and make the listed ones append-only) in the same transaction.
 */
function tenantMigration({ statements, tables, appendOnly = [], drops }) {
  return {
    async up(qi) {
      await qi.sequelize.transaction(async (transaction) => {
        for (const sql of statements) {
          await qi.sequelize.query(sql, { transaction });
        }
        for (const table of tables) {
          await enableTenantRls(qi, table, { transaction });
        }
        for (const table of appendOnly) {
          await makeAppendOnly(qi, table, { transaction });
        }
      });
    },
    async down(qi) {
      await qi.sequelize.transaction(async (transaction) => {
        for (const sql of drops || [...tables].reverse().map((t) => `DROP TABLE IF EXISTS ${t} CASCADE`)) {
          await qi.sequelize.query(sql, { transaction });
        }
      });
    }
  };
}

const TS = 'timestamptz NOT NULL DEFAULT now()';

module.exports = { tenantMigration, TS };
