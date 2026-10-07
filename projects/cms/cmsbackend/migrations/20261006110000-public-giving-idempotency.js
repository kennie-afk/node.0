'use strict';

/**
 * The public giving page has no login, so its idempotency key lives on the request row itself:
 * one key per church, unique, so a double tap or a retried request finds the first request instead
 * of sending the donor a second prompt. ALTER only: the table's RLS policy and grants are unchanged.
 */
module.exports = {
  async up(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== 'postgres') return;
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('ALTER TABLE mpesa_stk_requests ADD COLUMN IF NOT EXISTS public_key varchar(80)');
    await q('CREATE UNIQUE INDEX IF NOT EXISTS mpesa_stk_public_key ON mpesa_stk_requests (church_id, public_key) WHERE public_key IS NOT NULL');
    // Phone throttle lookups: "how many requests did this number make in the last few minutes".
    await q('CREATE INDEX IF NOT EXISTS mpesa_stk_phone_recent ON mpesa_stk_requests (church_id, phone, created_at DESC)');
  },
  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== 'postgres') return;
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('DROP INDEX IF EXISTS mpesa_stk_phone_recent');
    await q('DROP INDEX IF EXISTS mpesa_stk_public_key');
    await q('ALTER TABLE mpesa_stk_requests DROP COLUMN IF EXISTS public_key');
  }
};
