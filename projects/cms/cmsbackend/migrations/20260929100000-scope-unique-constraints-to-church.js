'use strict';

/**
 * Ids are global but names, e-mails and phone numbers are only meaningful inside one church.
 * With the original table-wide UNIQUE constraints, a second church could not register a
 * family called "Otieno" or a ministry called "Youth" because a different church already had.
 * Each is replaced by a unique index that includes church_id. users.email stays globally
 * unique on purpose: sign-in identifies the account by e-mail alone.
 */
const SCOPED = [
  ['families', 'family_name', 'families_family_name_key'],
  ['families', 'phone_number', 'families_phone_number_key'],
  ['families', 'email', 'families_email_key'],
  ['members', 'email', 'members_email_key'],
  ['members', 'phone_number', 'members_phone_number_key'],
  ['ministries', 'name', 'ministries_name_key'],
  ['users', 'username', 'users_username_key'],
  ['contribution', 'transaction_id', 'contribution_transaction_id_key']
];

const indexName = (table, column) => `${table}_church_${column}_unique`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [table, column, constraint] of SCOPED) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`,
          { transaction }
        );
        await queryInterface.addIndex(table, ['church_id', column], {
          unique: true,
          name: indexName(table, column),
          transaction
        });
      }
    });
  },

  /** Fails, leaving the schema untouched, if two churches now share a value. */
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [table, column, constraint] of SCOPED) {
        await queryInterface.removeIndex(table, indexName(table, column), { transaction });
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" UNIQUE ("${column}")`,
          { transaction }
        );
      }
    });
  }
};
