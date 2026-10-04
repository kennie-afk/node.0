'use strict';

/**
 * Indexes found by measuring a church with 50,000 members and 500,000 gifts (see
 * deploy/single-vm/README.md for the before/after numbers).
 *
 *  - members list: ORDER BY first_name, id for one church was a full scan plus a sort of every member.
 *  - members search is deliberately NOT indexed. Trigram GIN indexes were tried and measured: while row-level
 *    security is on, Postgres will not use an index for ILIKE, because the operator is not "leakproof" (it can
 *    raise errors that reveal data) and so may not be evaluated below the tenant policy. The planner chose a
 *    sequential scan every time for the application role (EXPLAIN as cms_app), so the indexes cost writes and
 *    disk for nothing. Search therefore costs one pass over ONE church's members (about 120 ms for 50,000,
 *    single digit ms for a typical church), because the tenant index narrows it first.
 *  - dashboard: "recent members" and "joined in the last 30 days" scanned every member.
 *  - giving reports: monthly/type totals and top givers re-read every gift; a covering partial index
 *    on POSTED gifts lets Postgres answer from the index alone (index-only scans).
 *
 * Plain CREATE INDEX takes a write lock on the table for the build. On a brand-new database that is
 * milliseconds; on a large live one, build the same indexes by hand with CREATE INDEX CONCURRENTLY
 * first (the IF NOT EXISTS below then makes this migration a no-op).
 */
module.exports = {
  async up(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== 'postgres') return;
    const run = (sql) => queryInterface.sequelize.query(sql);
    await run('CREATE INDEX IF NOT EXISTS members_church_first_name_id ON members (church_id, first_name, id)');
    await run('CREATE INDEX IF NOT EXISTS members_church_created_at ON members (church_id, created_at DESC, id DESC)');
    await run(
      `CREATE INDEX IF NOT EXISTS contribution_posted_report ON contribution (church_id, contribution_date)
         INCLUDE (amount, member_id, contribution_type, fund_id) WHERE status = 'POSTED'`
    );
    await run(
      `CREATE INDEX IF NOT EXISTS contribution_posted_member ON contribution (church_id, member_id, contribution_date)
         INCLUDE (amount) WHERE status = 'POSTED' AND member_id IS NOT NULL`
    );
  },

  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== 'postgres') return;
    const run = (sql) => queryInterface.sequelize.query(sql);
    for (const name of [
      'contribution_posted_member', 'contribution_posted_report',
      'members_church_created_at', 'members_church_first_name_id'
    ]) {
      await run(`DROP INDEX IF EXISTS ${name}`);
    }
  }
};
