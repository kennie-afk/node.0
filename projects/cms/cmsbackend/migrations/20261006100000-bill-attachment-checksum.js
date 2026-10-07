'use strict';

/**
 * Bill attachments become real files: the object's SHA-256 is kept next to the metadata so a
 * download can be checked against what was uploaded. Existing rows (metadata only, from before
 * upload existed) keep a NULL checksum. Altering a column adds no new privilege, so the application
 * role's grants and the table's row-level security policy are untouched.
 */
module.exports = {
  async up(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== 'postgres') return;
    await queryInterface.sequelize.query('ALTER TABLE bill_attachments ADD COLUMN IF NOT EXISTS sha256 char(64)');
  },
  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== 'postgres') return;
    await queryInterface.sequelize.query('ALTER TABLE bill_attachments DROP COLUMN IF EXISTS sha256');
  }
};
